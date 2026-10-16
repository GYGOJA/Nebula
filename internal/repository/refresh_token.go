package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/TheLonger011/Nebula/internal/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const refreshColumns = `id, user_id, token_hash, user_agent, expires_at, revoked_at, created_at`

type RefreshTokenRepository struct {
	db *pgxpool.Pool
}

func NewRefreshTokenRepository(db *pgxpool.Pool) *RefreshTokenRepository {
	return &RefreshTokenRepository{db: db}
}

func (r *RefreshTokenRepository) Create(ctx context.Context, t *models.RefreshToken) error {
	const q = `
		INSERT INTO refresh_tokens (user_id, token_hash, user_agent, expires_at)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at`

	err := r.db.QueryRow(ctx, q,
		t.UserID,
		t.TokenHash,
		t.UserAgent,
		t.ExpiresAt,
	).Scan(&t.ID, &t.CreatedAt)
	if err != nil {
		return fmt.Errorf("create refresh token: %w", err)
	}
	return nil
}

func (r *RefreshTokenRepository) GetByHash(ctx context.Context, hash string) (*models.RefreshToken, error) {
	const q = `
		SELECT ` + refreshColumns + `
		FROM refresh_tokens
		WHERE token_hash = $1`

	var t models.RefreshToken
	err := r.db.QueryRow(ctx, q, hash).Scan(
		&t.ID,
		&t.UserID,
		&t.TokenHash,
		&t.UserAgent,
		&t.ExpiresAt,
		&t.RevokedAt,
		&t.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get refresh token by hash: %w", err)
	}
	return &t, nil
}

func (r *RefreshTokenRepository) Revoke(ctx context.Context, id uuid.UUID) error {
	const q = `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`

	_, err := r.db.Exec(ctx, q, id)
	if err != nil {
		return fmt.Errorf("revoke refresh token: %w", err)
	}
	return nil
}

// Consume atomically revokes an active (not revoked, not expired) refresh token
// and returns it. Two concurrent refreshes with the same token cannot both succeed.
func (r *RefreshTokenRepository) Consume(ctx context.Context, hash string) (*models.RefreshToken, error) {
	const q = `
		UPDATE refresh_tokens
		SET revoked_at = NOW()
		WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
		RETURNING ` + refreshColumns

	var t models.RefreshToken
	err := r.db.QueryRow(ctx, q, hash).Scan(
		&t.ID,
		&t.UserID,
		&t.TokenHash,
		&t.UserAgent,
		&t.ExpiresAt,
		&t.RevokedAt,
		&t.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("consume refresh token: %w", err)
	}
	return &t, nil
}

// RevokeAllForUser signs the user out everywhere (used after a password reset).
func (r *RefreshTokenRepository) RevokeAllForUser(ctx context.Context, userID uuid.UUID) error {
	const q = `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`

	if _, err := r.db.Exec(ctx, q, userID); err != nil {
		return fmt.Errorf("revoke user refresh tokens: %w", err)
	}
	return nil
}
