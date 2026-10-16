package httpapi

import (
	"net/http"
	"net/mail"
	"strings"
	"unicode/utf8"

	"github.com/TheLonger011/Nebula/internal/auth"
	"github.com/jackc/pgx/v5/pgconn"
)

func normalizeEmail(w http.ResponseWriter, raw string) (string, bool) {
	email := strings.ToLower(strings.TrimSpace(raw))
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email {
		badRequest(w, "Укажите корректный email")
		return "", false
	}
	return email, true
}

// POST /api/me/email/code — sends a confirmation code to the new address.
func (s *Server) requestEmailChangeCode(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodPost) {
		return
	}
	var input struct {
		Email string `json:"email"`
	}
	if !decode(w, r, &input) {
		return
	}
	email, ok := normalizeEmail(w, input.Email)
	if !ok {
		return
	}
	var current *string
	if err := s.db.QueryRow(r.Context(), `SELECT email FROM users WHERE id=$1 AND deleted_at IS NULL`, currentUserID(r)).Scan(&current); err != nil {
		s.writeError(w, err)
		return
	}
	if current != nil && strings.EqualFold(*current, email) {
		badRequest(w, "Это уже ваш текущий email")
		return
	}
	// SendCode rejects addresses already in use, applies the resend cooldown and mails the code.
	if err := s.auth.SendCode(r.Context(), email); err != nil {
		s.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "email": email})
}

// POST /api/me/email/verify — confirms the code and switches the account email.
func (s *Server) changeEmail(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodPost) {
		return
	}
	var input struct {
		Email string `json:"email"`
		Code  string `json:"code"`
	}
	if !decode(w, r, &input) {
		return
	}
	email, ok := normalizeEmail(w, input.Email)
	if !ok {
		return
	}
	if len(strings.TrimSpace(input.Code)) == 0 {
		badRequest(w, "Введите код подтверждения")
		return
	}
	if err := s.auth.ConfirmCode(r.Context(), email, strings.TrimSpace(input.Code)); err != nil {
		s.writeError(w, err)
		return
	}
	_, err := s.db.Exec(r.Context(), `UPDATE users SET email=$2, updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`, currentUserID(r), email)
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
