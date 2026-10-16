package models

import (
	"github.com/google/uuid"
	"time"
)

type User struct {
	ID              uuid.UUID  `json:"id"`
	Username        string     `json:"username"`
	DisplayName     string     `json:"display_name"`
	Email           string     `json:"-"`
	PasswordHash    string     `json:"-"`
	BirthDate       time.Time  `json:"birth_date"`
	AvatarURL       *string    `json:"avatar_url"`
	Bio             *string    `json:"bio"`
	LastSeenAt      *time.Time `json:"last_seen_at"`
	EmailVerifiedAt *time.Time `json:"email_verified_at"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	DeletedAt       *time.Time `json:"deleted_at"`
}
