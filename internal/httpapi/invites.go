package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type inviteInput struct {
	SpaceID string `json:"spaceId"`
	Code    string `json:"code"`
}

type inviteInfo struct {
	SpaceID     uuid.UUID
	Name        string
	Description string
	AvatarURL   string
	Members     int
	ExpiresAt   *time.Time
	MaxUses     *int
	Uses        int
}

func (i *inviteInfo) usable() bool {
	if i.ExpiresAt != nil && time.Now().After(*i.ExpiresAt) {
		return false
	}
	return i.MaxUses == nil || i.Uses < *i.MaxUses
}

func (i *inviteInfo) spaceDTO() map[string]any {
	return map[string]any{
		"id": i.SpaceID, "name": i.Name, "description": i.Description,
		"avatarUrl": i.AvatarURL, "avatar_url": i.AvatarURL, "members": i.Members,
	}
}

func (s *Server) loadInvite(ctx context.Context, code string) (*inviteInfo, error) {
	var info inviteInfo
	err := s.db.QueryRow(ctx, `
		SELECT i.space_id, s.name, COALESCE(s.description, ''), COALESCE(s.avatar_url, ''),
		       (SELECT COUNT(*) FROM (SELECT user_id FROM space_members WHERE space_id = s.id UNION SELECT owner_id FROM spaces WHERE id = s.id) t),
		       i.expires_at, i.max_uses, i.uses
		FROM space_invites i JOIN spaces s ON s.id = i.space_id
		WHERE i.code = $1`, code).Scan(&info.SpaceID, &info.Name, &info.Description, &info.AvatarURL, &info.Members, &info.ExpiresAt, &info.MaxUses, &info.Uses)
	if err != nil {
		return nil, err
	}
	return &info, nil
}

func (s *Server) inviteRoutes(w http.ResponseWriter, r *http.Request) {
	userID := currentUserID(r)
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/invites"), "/")

	if path == "" && r.Method == http.MethodPost {
		var in inviteInput
		if !decode(w, r, &in) {
			return
		}
		spaceID, err := uuid.Parse(in.SpaceID)
		if err != nil {
			badRequest(w, "Некорректное пространство")
			return
		}
		perms := s.spacePerms(r.Context(), spaceID, userID)
		if !perms.Member {
			notFound(w, "Пространство не найдено или нет доступа")
			return
		}
		if !perms.Has(permCreateInvite) {
			forbidden(w, "У вас нет права создавать приглашения")
			return
		}
		var name string
		if err := s.db.QueryRow(r.Context(), `SELECT name FROM spaces WHERE id=$1`, spaceID).Scan(&name); err != nil {
			notFound(w, "Пространство не найдено или нет доступа")
			return
		}
		buf := make([]byte, 18)
		if _, err := rand.Read(buf); err != nil {
			s.writeError(w, err)
			return
		}
		code := base64.RawURLEncoding.EncodeToString(buf)
		if _, err := s.db.Exec(r.Context(), `INSERT INTO space_invites(code,space_id,created_by) VALUES($1,$2,$3)`, code, spaceID, userID); err != nil {
			s.writeError(w, err)
			return
		}
		base := strings.TrimRight(r.Header.Get("Origin"), "/")
		if base == "" {
			scheme := "http"
			if r.TLS != nil {
				scheme = "https"
			}
			base = scheme + "://" + r.Host
		}
		writeJSON(w, http.StatusCreated, map[string]any{"code": code, "url": base + "/invite/" + code, "spaceId": spaceID, "spaceName": name})
		return
	}

	// Preview: shows what the link leads to without joining.
	if path != "" && path != "accept" && !strings.Contains(path, "/") && r.Method == http.MethodGet {
		info, err := s.loadInvite(r.Context(), path)
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "Приглашение недействительно")
			return
		}
		if err != nil {
			s.writeError(w, err)
			return
		}
		if !info.usable() {
			writeJSON(w, http.StatusGone, map[string]string{"error": "Приглашение недействительно"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"space":    info.spaceDTO(),
			"isMember": s.isSpaceMember(r.Context(), info.SpaceID, userID),
		})
		return
	}

	if path == "accept" && r.Method == http.MethodPost {
		var in inviteInput
		if !decode(w, r, &in) {
			return
		}
		code := strings.TrimSpace(in.Code)
		info, err := s.loadInvite(r.Context(), code)
		if err != nil {
			notFound(w, "Приглашение недействительно")
			return
		}
		if !info.usable() {
			writeJSON(w, http.StatusGone, map[string]string{"error": "Приглашение недействительно"})
			return
		}
		tx, err := s.db.Begin(r.Context())
		if err != nil {
			s.writeError(w, err)
			return
		}
		defer tx.Rollback(r.Context())
		tag, err := tx.Exec(r.Context(), `INSERT INTO space_members(space_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, info.SpaceID, userID)
		if err != nil {
			s.writeError(w, err)
			return
		}
		joined := tag.RowsAffected() > 0
		if joined {
			// Only a real join consumes a use, and the limit is re-checked atomically.
			used, err := tx.Exec(r.Context(), `UPDATE space_invites SET uses=uses+1 WHERE code=$1 AND (max_uses IS NULL OR uses < max_uses) AND (expires_at IS NULL OR expires_at > NOW())`, code)
			if err != nil {
				s.writeError(w, err)
				return
			}
			if used.RowsAffected() == 0 {
				writeJSON(w, http.StatusGone, map[string]string{"error": "Приглашение недействительно"})
				return
			}
		}
		if err := tx.Commit(r.Context()); err != nil {
			s.writeError(w, err)
			return
		}
		if joined {
			s.notifySpace(r.Context(), info.SpaceID, "space_updated")
		}
		writeJSON(w, http.StatusOK, map[string]any{"space": info.spaceDTO(), "alreadyMember": !joined})
		return
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "Маршрут не найден"})
}
