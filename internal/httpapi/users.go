package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/TheLonger011/Nebula/internal/service"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Server) userRoutes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
		return
	}
	me := currentUserID(r)
	id, err := uuid.Parse(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/users/"), "/"))
	if err != nil {
		badRequest(w, "Некорректный ID пользователя")
		return
	}

	var username, displayName string
	var avatar, bio, statusText, pronouns, website, location *string
	var created time.Time
	err = s.db.QueryRow(r.Context(), `SELECT username, display_name, avatar_url, bio, status_text, pronouns, website, location, created_at
		FROM users WHERE id=$1 AND deleted_at IS NULL`, id).
		Scan(&username, &displayName, &avatar, &bio, &statusText, &pronouns, &website, &location, &created)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			s.writeError(w, service.ErrUserNotFound)
			return
		}
		s.writeError(w, err)
		return
	}

	relationship, requestID := "none", ""
	if id == me {
		relationship = "self"
	} else {
		var fid, requester, status string
		err := s.db.QueryRow(r.Context(), `SELECT id::text, requester_id::text, status FROM friendships
			WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)`, me, id).
			Scan(&fid, &requester, &status)
		switch {
		case err == nil && status == "accepted":
			relationship, requestID = "friends", fid
		case err == nil && status == "pending" && requester == me.String():
			relationship, requestID = "outgoing", fid
		case err == nil && status == "pending":
			relationship, requestID = "incoming", fid
		case err != nil && !errors.Is(err, pgx.ErrNoRows):
			s.writeError(w, err)
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id": id, "userId": id, "username": username,
		"name": displayName, "displayName": displayName,
		"avatar": str(avatar), "avatarUrl": str(avatar),
		"bio": str(bio), "statusText": str(statusText),
		"pronouns": str(pronouns), "website": str(website), "location": str(location),
		"createdAt":    created,
		"relationship": relationship,
		"requestId":    requestID,
	})
}
