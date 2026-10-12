package httpapi

import (
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/TheLonger011/Nebula/internal/repository"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var usernameRe = regexp.MustCompile(`^[A-Za-z0-9_]{3,16}$`)

const (
	maxDisplayName = 64
	maxBio         = 255
	maxStatusText  = 80
	maxPronouns    = 40
	maxWebsite     = 200
	maxLocation    = 80
	maxAvatarURL   = 2048
)

func runes(s string) int { return utf8.RuneCountInString(s) }

func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func (s *Server) loadProfile(r *http.Request, id uuid.UUID) (map[string]any, error) {
	var userID, username, displayName, email, birthDate string
	var avatar, bio, statusText, pronouns, website, location *string
	err := s.db.QueryRow(r.Context(), `SELECT id::text, username, display_name, email, birth_date::text,
		avatar_url, bio, status_text, pronouns, website, location
		FROM users WHERE id=$1 AND deleted_at IS NULL`, id).
		Scan(&userID, &username, &displayName, &email, &birthDate, &avatar, &bio, &statusText, &pronouns, &website, &location)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id": userID, "username": username,
		"name": displayName, "displayName": displayName,
		"email": email, "birthDate": birthDate,
		"avatarUrl": str(avatar), "avatar": str(avatar),
		"bio": str(bio), "statusText": str(statusText),
		"pronouns": str(pronouns), "website": str(website), "location": str(location),
	}, nil
}

func badRequest(w http.ResponseWriter, msg string) {
	writeJSON(w, http.StatusBadRequest, map[string]string{"error": msg})
}

func validHTTPURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

func (s *Server) profileRoutes(w http.ResponseWriter, r *http.Request) {
	id := currentUserID(r)

	if r.Method == http.MethodGet {
		profile, err := s.loadProfile(r, id)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "Профиль не найден"})
				return
			}
			s.writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, profile)
		return
	}

	if r.Method != http.MethodPatch {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
		return
	}

	var input struct {
		Username    string  `json:"username"`
		DisplayName string  `json:"displayName"`
		Name        string  `json:"name"`
		Bio         string  `json:"bio"`
		AvatarURL   string  `json:"avatarUrl"`
		BirthDate   *string `json:"birthDate"`
		StatusText  string  `json:"statusText"`
		Pronouns    string  `json:"pronouns"`
		Website     string  `json:"website"`
		Location    string  `json:"location"`
	}
	if !decode(w, r, &input) {
		return
	}

	username := strings.TrimPrefix(strings.TrimSpace(input.Username), "@")
	displayName := strings.TrimSpace(input.DisplayName)
	if displayName == "" {
		displayName = strings.TrimSpace(input.Name)
	}
	if displayName == "" {
		displayName = username
	}
	bio := strings.TrimSpace(input.Bio)
	avatar := strings.TrimSpace(input.AvatarURL)
	status := strings.TrimSpace(input.StatusText)
	pronouns := strings.TrimSpace(input.Pronouns)
	website := strings.TrimSpace(input.Website)
	location := strings.TrimSpace(input.Location)

	switch {
	case !usernameRe.MatchString(username):
		badRequest(w, "Username: 3–16 символов, латиница, цифры и «_»")
		return
	case runes(displayName) < 1 || runes(displayName) > maxDisplayName:
		badRequest(w, "Отображаемое имя: от 1 до 64 символов")
		return
	case runes(bio) > maxBio:
		badRequest(w, "Описание: не более 255 символов")
		return
	case runes(status) > maxStatusText:
		badRequest(w, "Статус: не более 80 символов")
		return
	case runes(pronouns) > maxPronouns:
		badRequest(w, "Местоимения: не более 40 символов")
		return
	case runes(location) > maxLocation:
		badRequest(w, "Местоположение: не более 80 символов")
		return
	case website != "" && (runes(website) > maxWebsite || !validHTTPURL(website)):
		badRequest(w, "Сайт: корректная ссылка http(s) до 200 символов")
		return
	case avatar != "" && (runes(avatar) > maxAvatarURL || !(validHTTPURL(avatar) || avatarURLRe.MatchString(avatar))):
		badRequest(w, "Аватар: нужна прямая ссылка http(s) на изображение")
		return
	}

	var birth *time.Time
	if input.BirthDate != nil && strings.TrimSpace(*input.BirthDate) != "" {
		parsed, err := time.Parse("2006-01-02", strings.TrimSpace(*input.BirthDate))
		if err != nil || parsed.After(time.Now()) || parsed.Year() < 1900 {
			badRequest(w, "Некорректная дата рождения")
			return
		}
		birth = &parsed
	}

	users := repository.NewUserRepository(s.db)
	if _, err := users.UpdateProfile(r.Context(), id, username, displayName, bio, avatar, status, pronouns, website, location, birth); err != nil {
		s.writeError(w, err)
		return
	}
	profile, err := s.loadProfile(r, id)
	if err != nil {
		s.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, profile)
}
