package repository

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	codeTTL     = 10 * time.Minute
	cooldownTTL = time.Minute
	maxAttempts = 5
)

const verifiedTTL = 30 * time.Minute

type CodeRepository struct {
	rdb *redis.Client
}

func verifiedKey(email string) string {
	return fmt.Sprintf("verify:done:%s", normalize(email))
}

func NewCodeRepository(rdb *redis.Client) *CodeRepository {
	return &CodeRepository{rdb: rdb}
}

func normalize(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func codeKey(email string) string {
	return fmt.Sprintf("verify:code:%s", normalize(email))
}

func attemptKey(email string) string {
	return fmt.Sprintf("verify:attempt:%s", normalize(email))
}

func cooldownKey(email string) string {
	return fmt.Sprintf("verify:cooldown:%s", normalize(email))
}

func hashCode(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}

func (r *CodeRepository) Save(ctx context.Context, email, code string) error {
	ok, err := r.rdb.SetNX(ctx, cooldownKey(email), 1, cooldownTTL).Result()
	if err != nil {
		return fmt.Errorf("set cooldown: %w", err)
	}
	if !ok {
		return ErrTooSoon
	}

	err = r.rdb.Set(ctx, codeKey(email), hashCode(code), codeTTL).Err()
	if err != nil {
		return fmt.Errorf("save code: %w", err)
	}

	err = r.rdb.Del(ctx, attemptKey(email)).Err()
	if err != nil {
		return fmt.Errorf("reset attempts: %w", err)
	}
	return nil
}

func (r *CodeRepository) Verify(ctx context.Context, email, code string) error {
	attempts, err := r.rdb.Incr(ctx, attemptKey(email)).Result()
	if err != nil {
		return fmt.Errorf("incr attempts: %w", err)
	}

	if attempts == 1 {
		if err := r.rdb.Expire(ctx, attemptKey(email), codeTTL).Err(); err != nil {
			return fmt.Errorf("expire attempts: %w", err)
		}
	}

	if attempts > maxAttempts {
		return ErrTooManyAttempts
	}

	stored, err := r.rdb.Get(ctx, codeKey(email)).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return ErrCodeExpired
		}
		return fmt.Errorf("get code: %w", err)
	}

	if subtle.ConstantTimeCompare([]byte(stored), []byte(hashCode(code))) != 1 {
		return ErrCodeInvalid
	}

	if err := r.rdb.Del(ctx, codeKey(email), attemptKey(email)).Err(); err != nil {
		return fmt.Errorf("delete code: %w", err)
	}
	return nil
}

func (r *CodeRepository) MarkVerified(ctx context.Context, email string) error {
	if err := r.rdb.Set(ctx, verifiedKey(email), 1, verifiedTTL).Err(); err != nil {
		return fmt.Errorf("mark verified: %w", err)
	}
	return nil
}

func (r *CodeRepository) ConsumeVerified(ctx context.Context, email string) error {
	n, err := r.rdb.Del(ctx, verifiedKey(email)).Result()
	if err != nil {
		return fmt.Errorf("delete verified: %w", err)
	}
	if n == 0 {
		return ErrEmailNotVerified
	}
	return nil
}
