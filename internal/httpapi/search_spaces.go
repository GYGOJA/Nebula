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
	rows, err := s.db.Query(r.Context(), `SELECT s.id,s.name,COALESCE(s.description,''),COALESCE(s.avatar_url,''),(SELECT COUNT(*) FROM space_members sm WHERE sm.space_id=s.id) FROM spaces s WHERE s.name ILIKE '%' || $1 || '%' ORDER BY s.name LIMIT 50`, query)
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
		if err := rows.Scan(&id, &name, &description, &avatarURL, &members); err != nil {
			s.writeError(w, err)
			return
		}
		items = append(items, map[string]any{"id": id, "name": name, "description": description, "avatarUrl": avatarURL, "avatar_url": avatarURL, "members": members})
	}
	if err := rows.Err(); err != nil {
		s.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}
