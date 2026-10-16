package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/GYGOJA/Nebula/internal/service"
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

	sharedSpaces := make([]map[string]any, 0)
	spaceRows, spaceErr := s.db.Query(r.Context(), `
		SELECT sp.id::text, sp.name, COALESCE(sp.description,''), COALESCE(sp.avatar_url,''),
		       (SELECT COUNT(*) FROM space_members sm WHERE sm.space_id=sp.id)
		FROM spaces sp
		WHERE (sp.owner_id=$1 OR EXISTS (SELECT 1 FROM space_members sm WHERE sm.space_id=sp.id AND sm.user_id=$1))
		  AND (sp.owner_id=$2 OR EXISTS (SELECT 1 FROM space_members sm WHERE sm.space_id=sp.id AND sm.user_id=$2))
		ORDER BY sp.name`, me, id)
	if spaceErr != nil {
		s.writeError(w, spaceErr)
		return
	}
	for spaceRows.Next() {
		var sid, sname, desc, avatarURL string
		var members int64
		if err := spaceRows.Scan(&sid, &sname, &desc, &avatarURL, &members); err != nil {
			spaceRows.Close()
			s.writeError(w, err)
			return
		}
		sharedSpaces = append(sharedSpaces, map[string]any{"id": sid, "name": sname, "description": desc, "avatarUrl": avatarURL, "members": members})
	}
	if err := spaceRows.Err(); err != nil {
		spaceRows.Close()
		s.writeError(w, err)
		return
	}
	spaceRows.Close()

	// Return only channels both users can actually view, including role-restricted channels.
	sharedChannels := make([]map[string]any, 0)
	if id != me {
		channelRows, channelErr := s.db.Query(r.Context(), `
			SELECT c.id, c.space_id, sp.name, c.name, c.type, c.restricted
			FROM space_channels c
		JOIN spaces sp ON sp.id = c.space_id
		WHERE (sp.owner_id=$1 OR EXISTS (SELECT 1 FROM space_members sm WHERE sm.space_id=sp.id AND sm.user_id=$1))
		  AND (sp.owner_id=$2 OR EXISTS (SELECT 1 FROM space_members sm WHERE sm.space_id=sp.id AND sm.user_id=$2))
		ORDER BY sp.name, c.type, c.name`, me, id)
		if channelErr != nil {
			s.writeError(w, channelErr)
			return
		}
		type sharedChannel struct {
			ID         uuid.UUID
			SpaceID    uuid.UUID
			SpaceName  string
			Name       string
			Type       string
			Restricted bool
		}
		candidates := make([]sharedChannel, 0)
		for channelRows.Next() {
			var candidate sharedChannel
			if err := channelRows.Scan(&candidate.ID, &candidate.SpaceID, &candidate.SpaceName, &candidate.Name, &candidate.Type, &candidate.Restricted); err != nil {
				channelRows.Close()
				s.writeError(w, err)
				return
			}
			candidates = append(candidates, candidate)
		}
		if err := channelRows.Err(); err != nil {
			channelRows.Close()
			s.writeError(w, err)
			return
		}
		channelRows.Close()

		myPerms := make(map[uuid.UUID]spacePerms)
		otherPerms := make(map[uuid.UUID]spacePerms)
		for _, candidate := range candidates {
			mine, ok := myPerms[candidate.SpaceID]
			if !ok {
				mine = s.spacePerms(r.Context(), candidate.SpaceID, me)
				myPerms[candidate.SpaceID] = mine
			}
			other, ok := otherPerms[candidate.SpaceID]
			if !ok {
				other = s.spacePerms(r.Context(), candidate.SpaceID, id)
				otherPerms[candidate.SpaceID] = other
			}
			myView, _ := s.channelAccessFor(r.Context(), mine, candidate.ID, me, candidate.Restricted)
			otherView, _ := s.channelAccessFor(r.Context(), other, candidate.ID, id, candidate.Restricted)
			if !myView || !otherView {
				continue
			}
			sharedChannels = append(sharedChannels, map[string]any{
				"id": candidate.ID, "spaceId": candidate.SpaceID,
				"spaceName": candidate.SpaceName, "name": candidate.Name, "type": candidate.Type,
			})
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id": id, "userId": id, "username": username,
		"name": displayName, "displayName": displayName,
		"avatar": str(avatar), "avatarUrl": str(avatar),
		"bio": str(bio), "statusText": str(statusText),
		"pronouns": str(pronouns), "website": str(website), "location": str(location),
		"createdAt":      created,
		"relationship":   relationship,
		"requestId":      requestID,
		"sharedSpaces":   sharedSpaces,
		"sharedChannels": sharedChannels,
	})
}
