package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (s *Server) searchUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len([]rune(query)) < 2 {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	me := currentUserID(r)
	rows, err := s.db.Query(r.Context(), `SELECT id, username, display_name, COALESCE(avatar_url, ''), COALESCE(bio, '')
		FROM users
		WHERE id <> $1 AND deleted_at IS NULL AND (username ILIKE '%' || $2 || '%' OR display_name ILIKE '%' || $2 || '%')
		ORDER BY username LIMIT 30`, me, query)
	if err != nil {
		s.writeError(w, err)
		return
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var id uuid.UUID
		var username, name, avatar, bio string
		if err := rows.Scan(&id, &username, &name, &avatar, &bio); err != nil {
			s.writeError(w, err)
			return
		}
		items = append(items, map[string]any{
			"id": id, "userId": id, "username": username,
			"name": name, "displayName": name,
			"avatar": avatar, "avatarUrl": avatar, "bio": bio,
		})
	}
	if err := rows.Err(); err != nil {
		s.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) searchMessages(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len([]rune(query)) < 2 {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	me := currentUserID(r)
	rows, err := s.db.Query(r.Context(), `SELECT m.id, m.channel_id, c.name, m.content, m.created_at
		FROM channel_messages m
		JOIN space_channels c ON c.id = m.channel_id
		JOIN spaces sp ON sp.id = c.space_id
		WHERE c.type = 'text' AND m.content ILIKE '%' || $2 || '%'
		AND `+channelViewSQL("sp", "c", "$1")+`
		ORDER BY m.created_at DESC LIMIT 50`, me, query)
	if err != nil {
		s.writeError(w, err)
		return
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var id, channelID uuid.UUID
		var channelName, content string
		var created time.Time
		if err := rows.Scan(&id, &channelID, &channelName, &content, &created); err != nil {
			s.writeError(w, err)
			return
		}
		items = append(items, map[string]any{
			"id": id, "channelId": channelID, "channelName": channelName,
			"text": content, "content": content, "createdAt": created,
		})
	}
	if err := rows.Err(); err != nil {
		s.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}
