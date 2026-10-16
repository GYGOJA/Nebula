package httpapi

import (
	"context"

	"github.com/google/uuid"
)

func (s *Server) isSpaceMember(ctx context.Context, spaceID, userID uuid.UUID) bool {
	var ok bool
	err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM spaces WHERE id=$1 AND owner_id=$2) OR EXISTS (SELECT 1 FROM space_members WHERE space_id=$1 AND user_id=$2)`, spaceID, userID).Scan(&ok)
	return err == nil && ok
}

func (s *Server) spaceMemberIDs(ctx context.Context, spaceID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := s.db.Query(ctx, `SELECT user_id FROM space_members WHERE space_id=$1 UNION SELECT owner_id FROM spaces WHERE id=$1`, spaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := make([]uuid.UUID, 0)
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (s *Server) userCards(ctx context.Context, ids []uuid.UUID) map[uuid.UUID]map[string]any {
	out := make(map[uuid.UUID]map[string]any, len(ids))
	if len(ids) == 0 {
		return out
	}
	keys := make([]string, len(ids))
	for i, id := range ids {
		keys[i] = id.String()
	}
	rows, err := s.db.Query(ctx, `SELECT id, username, display_name, avatar_url FROM users WHERE id::text = ANY($1)`, keys)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var username, displayName string
		var avatar *string
		if err := rows.Scan(&id, &username, &displayName, &avatar); err != nil {
			continue
		}
		out[id] = map[string]any{
			"id": id, "userId": id, "username": username,
			"name": displayName, "displayName": displayName,
			"avatar": str(avatar), "avatarUrl": str(avatar),
		}
	}
	return out
}

func (s *Server) publishMany(ids []uuid.UUID, ev Event) {
	for _, id := range ids {
		s.hub.Publish(id, ev)
	}
}
