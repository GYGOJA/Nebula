package httpapi

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type spaceInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	IsPublic    bool   `json:"isPublic"`
}

type channelInput struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

func (s *Server) spaceRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/spaces"), "/")
	userID := currentUserID(r)
	if path == "" {
		switch r.Method {
		case http.MethodGet:
			rows, err := s.db.Query(r.Context(), `SELECT s.id, s.name, COALESCE(s.description, ''), (SELECT COUNT(*) FROM space_members sm WHERE sm.space_id=s.id) AS members, COALESCE(s.avatar_url, ''), s.is_public FROM spaces s WHERE s.owner_id=$1 OR EXISTS (SELECT 1 FROM space_members sm WHERE sm.space_id=s.id AND sm.user_id=$1) ORDER BY s.created_at DESC`, userID)
			if err != nil {
				s.writeError(w, err)
				return
			}
			defer rows.Close()
			items := make([]map[string]any, 0)
			for rows.Next() {
				var id uuid.UUID
				var name, description, avatarURL string
				var members int
				var isPublic bool
				if err := rows.Scan(&id, &name, &description, &members, &avatarURL, &isPublic); err != nil {
					s.writeError(w, err)
					return
				}
				items = append(items, map[string]any{"id": id, "name": name, "description": description, "avatarUrl": avatarURL, "avatar_url": avatarURL, "members": members, "isPublic": isPublic})
			}
			writeJSON(w, http.StatusOK, items)
		case http.MethodPost:
			var input spaceInput
			if !decode(w, r, &input) {
				return
			}
			input.Name = strings.TrimSpace(input.Name)
			input.Description = strings.TrimSpace(input.Description)
			if input.Name == "" || len([]rune(input.Name)) > 80 || len([]rune(input.Description)) > 500 {
				badRequest(w, "Проверьте название и описание группы")
				return
			}
			tx, err := s.db.Begin(r.Context())
			if err != nil {
				s.writeError(w, err)
				return
			}
			defer tx.Rollback(r.Context())
			var id uuid.UUID
			if err := tx.QueryRow(r.Context(), `INSERT INTO spaces(owner_id,name,description,is_public) VALUES($1,$2,$3,$4) RETURNING id`, userID, input.Name, input.Description, input.IsPublic).Scan(&id); err != nil {
				s.writeError(w, err)
				return
			}
			if _, err := tx.Exec(r.Context(), `INSERT INTO space_members(space_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, id, userID); err != nil {
				s.writeError(w, err)
				return
			}
			if _, err := tx.Exec(r.Context(), `INSERT INTO space_roles(space_id,name,permissions,is_default) VALUES($1,'@everyone',$2,TRUE)`, id, defaultEveryonePerms); err != nil {
				s.writeError(w, err)
				return
			}
			if err := tx.Commit(r.Context()); err != nil {
				s.writeError(w, err)
				return
			}
			writeJSON(w, http.StatusCreated, map[string]any{"id": id, "name": input.Name, "description": input.Description, "members": 1, "isPublic": input.IsPublic})
		default:
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
		}
		return
	}
	parts := strings.Split(path, "/")
	spaceID, err := uuid.Parse(parts[0])
	if err != nil {
		badRequest(w, "Некорректный ID группы")
		return
	}
	var ownerID uuid.UUID
	var name, description string
	var avatarURL *string
	var isPublic bool
	err = s.db.QueryRow(r.Context(), `SELECT owner_id,name,COALESCE(description, ''),avatar_url,is_public FROM spaces WHERE id=$1`, spaceID).Scan(&ownerID, &name, &description, &avatarURL, &isPublic)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Группа не найдена"})
		return
	}
	if err != nil {
		s.writeError(w, err)
		return
	}
	perms := s.spacePerms(r.Context(), spaceID, userID)
	// Private spaces do not exist for non-members; they are reachable only through an invite link.
	if !perms.Member && !isPublic {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Группа не найдена"})
		return
	}
	if len(parts) == 2 && parts[1] == "join" {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
			return
		}
		tag, err := s.db.Exec(r.Context(), `INSERT INTO space_members(space_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, spaceID, userID)
		if err != nil {
			s.writeError(w, err)
			return
		}
		if tag.RowsAffected() > 0 {
			s.notifySpace(r.Context(), spaceID, "space_updated")
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "id": spaceID, "alreadyMember": tag.RowsAffected() == 0})
		return
	}
	if s.spacePanelRoutes(w, r, parts, spaceID, userID, perms.Member) {
		return
	}
	if s.spaceManageRoutes(w, r, parts, spaceID, perms, name, description, str(avatarURL), ownerID) {
		return
	}
	if len(parts) == 2 && parts[1] == "avatar" {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
			return
		}
		if !perms.Has(permManageSpace) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Недостаточно прав для изменения аватара группы"})
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxAvatarBytes+(1<<20))
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			badRequest(w, "Аватар: не более 5 МБ")
			return
		}
		file, _, err := r.FormFile("avatar")
		if err != nil {
			badRequest(w, "Выберите файл изображения")
			return
		}
		defer file.Close()
		data, err := io.ReadAll(io.LimitReader(file, maxAvatarBytes+1))
		if err != nil || len(data) > maxAvatarBytes {
			badRequest(w, "Аватар: не более 5 МБ")
			return
		}
		processed, err := processAvatar(data)
		if err != nil {
			badRequest(w, err.Error())
			return
		}
		if err := saveSpaceAvatarFile(spaceID, processed); err != nil {
			s.writeError(w, err)
			return
		}
		url := fmt.Sprintf("/api/space-avatars/%s.png?v=%d", spaceID, time.Now().Unix())
		if _, err := s.db.Exec(r.Context(), `UPDATE spaces SET avatar_url=$2 WHERE id=$1`, spaceID, url); err != nil {
			s.writeError(w, err)
			return
		}
		s.notifySpace(r.Context(), spaceID, "space_updated")
		writeJSON(w, http.StatusOK, map[string]any{"id": spaceID, "name": name, "description": description, "avatarUrl": url})
		return
	}
	if len(parts) == 1 && r.Method == http.MethodGet {
		sections, err := s.spaceSections(r.Context(), spaceID, userID, "")
		if err != nil {
			s.writeError(w, err)
			return
		}
		channels := make([]map[string]any, 0)
		voices := make([]map[string]any, 0)
		for _, item := range sections {
			if item["type"] == "voice" {
				voices = append(voices, item)
			} else {
				channels = append(channels, item)
			}
		}
		var memberCount int
		_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM (SELECT user_id FROM space_members WHERE space_id=$1 UNION SELECT owner_id FROM spaces WHERE id=$1) t`, spaceID).Scan(&memberCount)
		s.attachParticipants(r.Context(), voices)
		role := "member"
		if ownerID == userID {
			role = "owner"
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": spaceID, "name": name, "description": description, "avatarUrl": str(avatarURL), "avatar_url": str(avatarURL), "channels": channels, "voiceRooms": voices, "members": memberCount, "isPublic": isPublic, "ownerId": ownerID, "isMember": perms.Member, "role": role, "permissions": perms.effective(), "can": perms.dto(), "canManage": perms.CanManage()})
		return
	}
	if len(parts) == 2 && parts[1] == "members" {
		s.spaceMembers(w, r, spaceID, ownerID, userID)
		return
	}
	if len(parts) == 2 && (parts[1] == "channels" || parts[1] == "voice") {
		typ := "text"
		if parts[1] == "voice" {
			typ = "voice"
		}
		if r.Method == http.MethodGet {
			items, err := s.spaceSections(r.Context(), spaceID, userID, typ)
			if err != nil {
				s.writeError(w, err)
				return
			}
			if typ == "voice" {
				s.attachParticipants(r.Context(), items)
			}
			writeJSON(w, http.StatusOK, items)
			return
		}
		if r.Method == http.MethodPost {
			if !perms.Has(permManageChannels) {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "Недостаточно прав для создания каналов"})
				return
			}
			var input channelInput
			if !decode(w, r, &input) {
				return
			}
			input.Name = strings.TrimSpace(input.Name)
			if input.Type != "" {
				typ = input.Type
			}
			if input.Name == "" || len([]rune(input.Name)) > 80 || (typ != "text" && typ != "voice") || (parts[1] == "voice" && typ != "voice") || (parts[1] == "channels" && typ != "text") {
				badRequest(w, "Укажите название и тип канала")
				return
			}
			var id uuid.UUID
			err := s.db.QueryRow(r.Context(), `INSERT INTO space_channels(space_id,name,type) VALUES($1,$2,$3) RETURNING id`, spaceID, input.Name, typ).Scan(&id)
			if err != nil {
				s.writeError(w, err)
				return
			}
			s.notifySpace(r.Context(), spaceID, "space_updated")
			writeJSON(w, http.StatusCreated, map[string]any{"id": id, "name": input.Name, "type": typ, "spaceId": spaceID, "restricted": false, "canWrite": true})
			return
		}
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "Маршрут не найден"})
}

func (s *Server) spaceMembers(w http.ResponseWriter, r *http.Request, spaceID, ownerID, userID uuid.UUID) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
		return
	}
	if !s.isSpaceMember(r.Context(), spaceID, userID) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Вы не состоите в этой группе"})
		return
	}
	ids, err := s.spaceMemberIDs(r.Context(), spaceID)
	if err != nil {
		s.writeError(w, err)
		return
	}
	// ?channelId=… narrows the list to the people who may actually see that channel,
	// so a restricted channel does not advertise members who have no access to it.
	if raw := r.URL.Query().Get("channelId"); raw != "" {
		channelID, perr := uuid.Parse(raw)
		if perr != nil {
			badRequest(w, "Некорректный ID канала")
			return
		}
		if view, _ := s.channelAccess(r.Context(), spaceID, channelID, userID); !view {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "У вас нет доступа к этому каналу"})
			return
		}
		audience, aerr := s.channelAudience(r.Context(), spaceID, channelID)
		if aerr != nil {
			s.writeError(w, aerr)
			return
		}
		allowed := make(map[uuid.UUID]bool, len(audience))
		for _, id := range audience {
			allowed[id] = true
		}
		filtered := make([]uuid.UUID, 0, len(ids))
		for _, id := range ids {
			if allowed[id] {
				filtered = append(filtered, id)
			}
		}
		ids = filtered
	}
	cards := s.userCards(r.Context(), ids)
	byUser := s.memberRoles(r.Context(), spaceID)
	items := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		card := cards[id]
		if card == nil {
			continue
		}
		item := make(map[string]any, len(card)+6)
		for k, v := range card {
			item[k] = v
		}
		item["role"] = "member"
		if id == ownerID {
			item["role"] = "owner"
		}
		roleList := make([]map[string]any, 0, len(byUser[id]))
		roleIDs := make([]uuid.UUID, 0, len(byUser[id]))
		for _, b := range byUser[id] {
			roleList = append(roleList, map[string]any{"id": b.ID, "name": b.Name, "color": b.Color, "position": b.Position})
			roleIDs = append(roleIDs, b.ID)
		}
		item["roles"] = roleList
		item["roleIds"] = roleIDs
		item["color"] = ""
		if len(byUser[id]) > 0 {
			item["color"] = byUser[id][0].Color
		}
		item["online"] = s.hub.Online(id)
		items = append(items, item)
	}
	sort.SliceStable(items, func(i, j int) bool {
		oi, oj := items[i]["online"].(bool), items[j]["online"].(bool)
		if oi != oj {
			return oi
		}
		ri, rj := items[i]["role"] == "owner", items[j]["role"] == "owner"
		if ri != rj {
			return ri
		}
		return strings.ToLower(str2(items[i]["displayName"])) < strings.ToLower(str2(items[j]["displayName"]))
	})
	writeJSON(w, http.StatusOK, items)
}

func str2(v any) string {
	s, _ := v.(string)
	return s
}
