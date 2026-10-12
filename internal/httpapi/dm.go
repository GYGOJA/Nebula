package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/TheLonger011/Nebula/internal/models"
	"github.com/TheLonger011/Nebula/internal/repository"
	"github.com/TheLonger011/Nebula/internal/service"
	"github.com/google/uuid"
)

const (
	maxMessageLen  = 4000
	defaultDMLimit = 100
	maxDMLimit     = 200
)

func userDTO(u *models.User) map[string]any {
	return map[string]any{
		"id": u.ID, "userId": u.ID,
		"username": u.Username,
		"name":     u.DisplayName, "displayName": u.DisplayName,
		"avatar": str(u.AvatarURL), "avatarUrl": str(u.AvatarURL),
		"bio": str(u.Bio), "lastSeenAt": u.LastSeenAt,
	}
}

func dmMessageDTO(id string, sender, recipient uuid.UUID, content string, created time.Time, me uuid.UUID, author *models.User) map[string]any {
	authorID := sender.String()
	if sender == me {
		authorID = "me"
	}
	return map[string]any{
		"id": id, "senderId": sender, "recipientId": recipient,
		"text": content, "content": content,
		"createdAt": created, "time": created.Format("15:04"),
		"authorId": authorID,
		"author": map[string]any{
			"id": author.ID, "name": author.DisplayName, "displayName": author.DisplayName,
			"avatar": str(author.AvatarURL),
		},
	}
}

func (s *Server) dmConversations(w http.ResponseWriter, r *http.Request, me uuid.UUID) {
	rows, err := s.db.Query(r.Context(), `
		SELECT u.id::text, u.username, u.display_name, u.avatar_url, l.content, l.created_at, l.from_me
		FROM (
			SELECT DISTINCT ON (other_id)
				CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other_id,
				content, created_at, (sender_id = $1) AS from_me
			FROM direct_messages
			WHERE sender_id = $1 OR recipient_id = $1
			ORDER BY other_id, created_at DESC
		) l
		JOIN users u ON u.id = l.other_id AND u.deleted_at IS NULL
		ORDER BY l.created_at DESC`, me)
	if err != nil {
		s.writeError(w, err)
		return
	}
	defer rows.Close()

	result := make([]map[string]any, 0)
	for rows.Next() {
		var id, username, name, content string
		var avatar *string
		var created time.Time
		var fromMe bool
		if err := rows.Scan(&id, &username, &name, &avatar, &content, &created, &fromMe); err != nil {
			s.writeError(w, err)
			return
		}
		result = append(result, map[string]any{
			"userId": id, "id": id, "username": username,
			"name": name, "displayName": name,
			"avatar": str(avatar), "avatarUrl": str(avatar),
			"last": map[string]any{"text": content, "createdAt": created, "fromMe": fromMe},
		})
	}
	if err := rows.Err(); err != nil {
		s.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) dmRoutes(w http.ResponseWriter, r *http.Request) {
	me := currentUserID(r)
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/dm"), "/")

	if path == "" {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
			return
		}
		s.dmConversations(w, r, me)
		return
	}

	parts := strings.Split(path, "/")
	if len(parts) > 2 || (len(parts) == 2 && parts[1] != "messages") {
		http.NotFound(w, r)
		return
	}
	otherID, err := uuid.Parse(parts[0])
	if err != nil || otherID == me {
		badRequest(w, "Некорректный пользователь")
		return
	}

	users := repository.NewUserRepository(s.db)
	other, err := users.GetByID(r.Context(), otherID)
	if err != nil {
		s.writeError(w, service.ErrUserNotFound)
		return
	}

	if len(parts) == 1 {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
			return
		}
		writeJSON(w, http.StatusOK, userDTO(other))
		return
	}

	self, err := users.GetByID(r.Context(), me)
	if err != nil {
		s.writeError(w, err)
		return
	}
	authors := map[uuid.UUID]*models.User{me: self, otherID: other}

	switch r.Method {
	case http.MethodGet:
		limit := defaultDMLimit
		if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 {
			limit = min(v, maxDMLimit)
		}
		rows, err := s.db.Query(r.Context(), `
			SELECT id, sender_id, recipient_id, content, created_at FROM (
				SELECT id, sender_id, recipient_id, content, created_at
				FROM direct_messages
				WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
				ORDER BY created_at DESC, id DESC
				LIMIT $3
			) t ORDER BY created_at ASC, id ASC`, me, otherID, limit)
		if err != nil {
			s.writeError(w, err)
			return
		}
		defer rows.Close()

		result := make([]map[string]any, 0)
		for rows.Next() {
			var id, sender, recipient uuid.UUID
			var content string
			var created time.Time
			if err := rows.Scan(&id, &sender, &recipient, &content, &created); err != nil {
				s.writeError(w, err)
				return
			}
			result = append(result, dmMessageDTO(id.String(), sender, recipient, content, created, me, authors[sender]))
		}
		if err := rows.Err(); err != nil {
			s.writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, result)

	case http.MethodPost:
		var input struct {
			Text    string `json:"text"`
			Content string `json:"content"`
		}
		if !decode(w, r, &input) {
			return
		}
		text := strings.TrimSpace(input.Text)
		if text == "" {
			text = strings.TrimSpace(input.Content)
		}
		if n := runes(text); n < 1 || n > maxMessageLen {
			badRequest(w, "Сообщение должно содержать от 1 до 4000 символов")
			return
		}
		var id uuid.UUID
		var created time.Time
		err := s.db.QueryRow(r.Context(),
			`INSERT INTO direct_messages (sender_id, recipient_id, content) VALUES ($1, $2, $3) RETURNING id, created_at`,
			me, otherID, text).Scan(&id, &created)
		if err != nil {
			s.writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, dmMessageDTO(id.String(), me, otherID, text, created, me, self))

	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
	}
}
