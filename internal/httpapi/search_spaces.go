package httpapi

import (
	"net/http"
	"strings"

	"github.com/google/uuid"
)

func (s *Server) searchSpaces(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len([]rune(query)) < 2 {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT s.id,s.name,COALESCE(s.description,''),COALESCE(s.avatar_url,''),(SELECT COUNT(*) FROM space_members sm WHERE sm.space_id=s.id), (s.owner_id=$2 OR EXISTS (SELECT 1 FROM space_members sm WHERE sm.space_id=s.id AND sm.user_id=$2)) AS is_member FROM spaces s WHERE s.name ILIKE '%' || $1 || '%' AND (s.is_public OR s.owner_id=$2 OR EXISTS (SELECT 1 FROM space_members sm WHERE sm.space_id=s.id AND sm.user_id=$2)) ORDER BY s.name LIMIT 50`, query, currentUserID(r))
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
		var isMember bool
		if err := rows.Scan(&id, &name, &description, &avatarURL, &members, &isMember); err != nil {
			s.writeError(w, err)
			return
		}
		items = append(items, map[string]any{"id": id, "name": name, "description": description, "avatarUrl": avatarURL, "avatar_url": avatarURL, "members": members, "isMember": isMember})
	}
	if err := rows.Err(); err != nil {
		s.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}
