package repository

import "errors"

var (
	ErrNotFound      = errors.New("not found")
	ErrEmailTaken    = errors.New("email already taken")
	ErrUsernameTaken = errors.New("username already taken")

	ErrCodeInvalid     = errors.New("invalid code")
	ErrCodeExpired     = errors.New("expired code")
	ErrTooManyAttempts = errors.New("too many attempts")
	ErrTooSoon         = errors.New("code requested too soon")

	ErrEmailNotVerified = errors.New("email not verified")
)
