package auth

import (
	"errors"

	"golang.org/x/crypto/bcrypt"
)

const maxPasswordBytes = 72

var ErrPasswordTooLong = errors.New("password too long")

func HashPassword(password string) (string, error) {
	if len(password) > maxPasswordBytes {
		return "", ErrPasswordTooLong
	}
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

func CheckPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}
