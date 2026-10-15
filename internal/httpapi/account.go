package httpapi

import (
	"net/http"
	"net/mail"
	"strings"
	"unicode/utf8"

	"github.com/TheLonger011/Nebula/internal/auth"
	"github.com/jackc/pgx/v5/pgconn"
)

func (s *Server) changeEmail(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodPost) {
		return
	}
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decode(w, r, &input) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(input.Email))
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email {
		badRequest(w, "Укажите корректный email")
		return
	}
	if len(input.Password) == 0 {
		badRequest(w, "Введите текущий пароль")
		return
	}
	id := currentUserID(r)
	var hash string
	if err := s.db.QueryRow(r.Context(), `SELECT password_hash FROM users WHERE id=$1 AND deleted_at IS NULL`, id).Scan(&hash); err != nil {
		s.writeError(w, err)
		return
	}
	if !auth.CheckPasswordHash(input.Password, hash) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Текущий пароль указан неверно"})
		return
	}
	_, err = s.db.Exec(r.Context(), `UPDATE users SET email=$2, updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`, id, email)
	if err != nil {
		if pgErr, ok := err.(*pgconn.PgError); ok && pgErr.Code == "23505" {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "Этот email уже используется"})
			return
		}
		s.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "email": email})
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodPost) {
		return
	}
	var input struct {
		Current string `json:"current"`
		Next    string `json:"next"`
	}
	if !decode(w, r, &input) {
		return
	}
	if utf8.RuneCountInString(input.Next) < 8 || len(input.Next) > 72 {
		badRequest(w, "Новый пароль должен содержать не менее 8 символов и не более 72 байт")
		return
	}
	if input.Current == input.Next {
		badRequest(w, "Новый пароль должен отличаться от текущего")
		return
	}
	id := currentUserID(r)
	var hash string
	if err := s.db.QueryRow(r.Context(), `SELECT password_hash FROM users WHERE id=$1 AND deleted_at IS NULL`, id).Scan(&hash); err != nil {
		s.writeError(w, err)
		return
	}
	if !auth.CheckPasswordHash(input.Current, hash) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Текущий пароль указан неверно"})
		return
	}
	nextHash, err := auth.HashPassword(input.Next)
	if err != nil {
		badRequest(w, "Не удалось обработать новый пароль")
		return
	}
	if _, err := s.db.Exec(r.Context(), `UPDATE users SET password_hash=$2, updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`, id, nextHash); err != nil {
		s.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
