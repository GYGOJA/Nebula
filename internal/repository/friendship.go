package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/GYGOJA/Nebula/internal/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrFriendshipExists   = errors.New("friendship already exists")
	ErrFriendshipNotFound = errors.New("friendship not found")
	ErrNotFriend          = errors.New("users are not friends")
)

type FriendshipEntry struct {
	Friendship models.Friendship `json:"-"`
	User       *models.User      `json:"-"`
}

type FriendshipRepository struct{ db *pgxpool.Pool }

func NewFriendshipRepository(db *pgxpool.Pool) *FriendshipRepository {
	return &FriendshipRepository{db: db}
}

func (r *FriendshipRepository) CreateRequest(ctx context.Context, requesterID, addresseeID uuid.UUID) (*models.Friendship, error) {
	var item models.Friendship
	err := r.db.QueryRow(ctx, `
		INSERT INTO friendships (requester_id, addressee_id, status)
		VALUES ($1, $2, 'pending')
		RETURNING id, requester_id, addressee_id, status, created_at, updated_at`, requesterID, addresseeID).
		Scan(&item.ID, &item.RequesterID, &item.AddresseeID, &item.Status, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		if pgErrCode(err) == "23505" {
			return nil, ErrFriendshipExists
		}
		return nil, fmt.Errorf("create friend request: %w", err)
	}
	return &item, nil
}

func pgErrCode(err error) string {
	var pgErr interface{ SQLState() string }
	if errors.As(err, &pgErr) {
		return pgErr.SQLState()
	}
	return ""
}

func (r *FriendshipRepository) ListFriends(ctx context.Context, userID uuid.UUID) ([]*models.User, error) {
	rows, err := r.db.Query(ctx, `
		SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.last_seen_at
		FROM friendships f
		JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
		WHERE (f.requester_id = $1 OR f.addressee_id = $1) AND f.status = 'accepted' AND u.deleted_at IS NULL
		ORDER BY LOWER(u.display_name), LOWER(u.username)`, userID)
	if err != nil {
		return nil, fmt.Errorf("list friends: %w", err)
	}
	defer rows.Close()
	result := make([]*models.User, 0)
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.Bio, &u.LastSeenAt); err != nil {
			return nil, err
		}
		result = append(result, &u)
	}
	return result, rows.Err()
}

func (r *FriendshipRepository) ListRequests(ctx context.Context, userID uuid.UUID) (incoming, outgoing []FriendshipEntry, err error) {
	incoming, err = r.listRequests(ctx, userID, true)
	if err != nil {
		return nil, nil, err
	}
	outgoing, err = r.listRequests(ctx, userID, false)
	return incoming, outgoing, err
}

func (r *FriendshipRepository) listRequests(ctx context.Context, userID uuid.UUID, incoming bool) ([]FriendshipEntry, error) {
	ownerColumn, otherColumn := "requester_id", "addressee_id"
	if incoming {
		ownerColumn, otherColumn = otherColumn, ownerColumn
	}
	query := `SELECT f.id, f.requester_id, f.addressee_id, f.status, f.created_at, f.updated_at,
		u.id, u.username, u.display_name, u.avatar_url, u.bio, u.last_seen_at
		FROM friendships f JOIN users u ON u.id = f.` + otherColumn + `
		WHERE f.` + ownerColumn + ` = $1 AND f.status = 'pending' AND u.deleted_at IS NULL
		ORDER BY f.created_at`
	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("list friend requests: %w", err)
	}
	defer rows.Close()
	result := make([]FriendshipEntry, 0)
	for rows.Next() {
		var entry FriendshipEntry
		entry.User = &models.User{}
		if err := rows.Scan(&entry.Friendship.ID, &entry.Friendship.RequesterID, &entry.Friendship.AddresseeID,
			&entry.Friendship.Status, &entry.Friendship.CreatedAt, &entry.Friendship.UpdatedAt,
			&entry.User.ID, &entry.User.Username, &entry.User.DisplayName, &entry.User.AvatarURL, &entry.User.Bio, &entry.User.LastSeenAt); err != nil {
			return nil, err
		}
		result = append(result, entry)
	}
	return result, rows.Err()
}

func (r *FriendshipRepository) Accept(ctx context.Context, requestID, userID uuid.UUID) error {
	tag, err := r.db.Exec(ctx, `UPDATE friendships SET status = 'accepted', updated_at = NOW()
		WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`, requestID, userID)
	if err != nil {
		return fmt.Errorf("accept friend request: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrFriendshipNotFound
	}
	return nil
}

func (r *FriendshipRepository) Decline(ctx context.Context, requestID, userID uuid.UUID) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM friendships WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`, requestID, userID)
	if err != nil {
		return fmt.Errorf("decline friend request: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrFriendshipNotFound
	}
	return nil
}

func (r *FriendshipRepository) Remove(ctx context.Context, userID, friendID uuid.UUID) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM friendships WHERE status = 'accepted' AND
		((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`, userID, friendID)
	if err != nil {
		return fmt.Errorf("remove friend: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFriend
	}
	return nil
}

func (r *FriendshipRepository) Cancel(ctx context.Context, requestID, userID uuid.UUID) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM friendships WHERE id=$1 AND requester_id=$2 AND status='pending'`, requestID, userID)
	if err != nil {
		return fmt.Errorf("cancel friend request: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrFriendshipNotFound
	}
	return nil
}
