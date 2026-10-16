package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/TheLonger011/Nebula/internal/auth"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/TheLonger011/Nebula/internal/models"
	"github.com/TheLonger011/Nebula/internal/repository"
	"github.com/TheLonger011/Nebula/internal/service"
)

type Server struct {
	auth    *service.AuthService
	friends *service.FriendshipService
	tokens  *auth.TokenManager
	db      *pgxpool.Pool
	hub     *Hub
	voice   *VoiceManager
}

func New(authService *service.AuthService, friendshipService *service.FriendshipService, tokens *auth.TokenManager, db *pgxpool.Pool) *Server {
	return &Server{auth: authService, friends: friendshipService, tokens: tokens, db: db, hub: NewHub(), voice: NewVoiceManager()}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/auth/register", s.sendCode)
	mux.HandleFunc("/api/auth/verify", s.verifyCode)
	mux.HandleFunc("/api/auth/profile", s.register)
	mux.HandleFunc("/api/auth/login", s.login)
	mux.HandleFunc("/api/auth/recover", s.recoverPassword)
	mux.HandleFunc("/api/auth/reset", s.resetPassword)
	mux.HandleFunc("/api/auth/refresh", s.refresh)
	mux.HandleFunc("/api/auth/logout", s.logout)
	mux.Handle("/api/friends", s.requireAuth(http.HandlerFunc(s.friendRoutes)))
	mux.Handle("/api/friends/", s.requireAuth(http.HandlerFunc(s.friendRoutes)))
	mux.Handle("/api/me", s.requireAuth(http.HandlerFunc(s.profileRoutes)))
	mux.Handle("/api/me/avatar", s.requireAuth(http.HandlerFunc(s.meAvatar)))
	mux.Handle("/api/me/email/code", s.requireAuth(http.HandlerFunc(s.requestEmailChangeCode)))
	mux.Handle("/api/me/email/verify", s.requireAuth(http.HandlerFunc(s.changeEmail)))
	mux.Handle("/api/me/password", s.requireAuth(http.HandlerFunc(s.changePassword)))
	mux.HandleFunc("/api/avatars/", s.serveAvatar)
	mux.HandleFunc("/api/space-avatars/", s.serveSpaceAvatar)
	mux.Handle("/api/users/", s.requireAuth(http.HandlerFunc(s.userRoutes)))
	mux.Handle("/api/events", s.requireAuth(http.HandlerFunc(s.events)))
	mux.Handle("/api/dm", s.requireAuth(http.HandlerFunc(s.dmRoutes)))
	mux.Handle("/api/dm/", s.requireAuth(http.HandlerFunc(s.dmRoutes)))
	mux.Handle("/api/search/users", s.requireAuth(http.HandlerFunc(s.searchUsers)))
	mux.Handle("/api/search/messages", s.requireAuth(http.HandlerFunc(s.searchMessages)))
	mux.Handle("/api/search/spaces", s.requireAuth(http.HandlerFunc(s.searchSpaces)))
	mux.Handle("/api/invites", s.requireAuth(http.HandlerFunc(s.inviteRoutes)))
	mux.Handle("/api/invites/", s.requireAuth(http.HandlerFunc(s.inviteRoutes)))
	mux.Handle("/api/spaces", s.requireAuth(http.HandlerFunc(s.spaceRoutes)))
	mux.Handle("/api/spaces/", s.requireAuth(http.HandlerFunc(s.spaceRoutes)))
	mux.Handle("/api/channels", s.requireAuth(http.HandlerFunc(s.channelRoutes)))
	mux.Handle("/api/channels/", s.requireAuth(http.HandlerFunc(s.channelRoutes)))
	mux.Handle("/api/voice", s.requireAuth(http.HandlerFunc(s.voiceRoutes)))
	mux.Handle("/api/voice/", s.requireAuth(http.HandlerFunc(s.voiceRoutes)))
	mux.Handle("/api/calls", s.requireAuth(http.HandlerFunc(s.callRoutes)))
	mux.Handle("/api/calls/", s.requireAuth(http.HandlerFunc(s.callRoutes)))
	return s.cors(mux)
}

type codeRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

type registerRequest struct {
	Email       string `json:"email"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Password    string `json:"password"`
	BirthDate   string `json:"birthDate"`
	Day         string `json:"day"`
	Month       string `json:"month"`
	Year        string `json:"year"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Username string `json:"username"`
	Login    string `json:"login"`
	Password string `json:"password"`
}

func (s *Server) sendCode(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodPost) {
		return
	}
	var input codeRequest
	if !decode(w, r, &input) {
		return
	}
	if err := s.auth.SendCode(r.Context(), input.Email); err != nil {
		s.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) recoverPassword(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodPost) {
		return
	}
	var input codeRequest
	if !decode(w, r, &input) {
		return
	}
	if err := s.auth.RequestPasswordReset(r.Context(), input.Email); err != nil {
		s.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) resetPassword(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodPost) {
		return
	}
	var input struct {
		Email    string `json:"email"`
		Code     string `json:"code"`
		Password string `json:"password"`
	}
	if !decode(w, r, &input) {
		return
	}
	if err := s.auth.ResetPassword(r.Context(), input.Email, input.Code, input.Password); err != nil {
		s.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) verifyCode(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodPost) {
		return
	}
	var input codeRequest
	if !decode(w, r, &input) {
		return
	}
	if err := s.auth.VerifyCode(r.Context(), input.Email, input.Code); err != nil {
		s.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "ticket": "verified"})
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodPost) {
		return
	}
	var input registerRequest
	if !decode(w, r, &input) {
		return
	}
	birthDate := strings.TrimSpace(input.BirthDate)
	if birthDate == "" && input.Day != "" && input.Month != "" && input.Year != "" {
		birthDate = fmt.Sprintf("%04s-%02s-%02s", input.Year, input.Month, input.Day)
	}
	birth, err := time.Parse("2006-01-02", birthDate)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Укажите корректную дату рождения"})
		return
	}
	result, err := s.auth.Register(r.Context(), service.RegisterInput{
		Email:       input.Email,
		Username:    input.Username,
		DisplayName: input.DisplayName,
		Password:    input.Password,
		BirthDate:   birth,
		UserAgent:   r.UserAgent(),
	})
	if err != nil {
		s.writeError(w, err)
		return
	}
	s.writeAuth(w, result)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodPost) {
		return
	}
	var input loginRequest
	if !decode(w, r, &input) {
		return
	}
	login := input.Login
	if login == "" {
		login = input.Email
	}
	if login == "" {
		login = input.Username
	}
	result, err := s.auth.Login(r.Context(), service.LoginInput{Login: login, Password: input.Password, UserAgent: r.UserAgent()})
	if err != nil {
		s.writeError(w, err)
		return
	}
	s.writeAuth(w, result)
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func (s *Server) refresh(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodPost) {
		return
	}
	var input refreshRequest
	if !decode(w, r, &input) {
		return
	}
	result, err := s.auth.Refresh(r.Context(), input.RefreshToken, r.UserAgent())
	if err != nil {
		s.writeError(w, err)
		return
	}
	s.writeAuth(w, result)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodPost) {
		return
	}
	var input refreshRequest
	if !decode(w, r, &input) {
		return
	}
	if err := s.auth.Logout(r.Context(), input.RefreshToken); err != nil {
		s.writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) writeAuth(w http.ResponseWriter, result *service.AuthResult) {
	writeJSON(w, http.StatusOK, map[string]any{
		"token":         result.AccessToken,
		"access_token":  result.AccessToken,
		"refresh_token": result.RefreshToken,
		"user":          publicUser(result.User),
	})
}

func publicUser(user *models.User) map[string]any {
	return map[string]any{
		"id":           user.ID,
		"username":     user.Username,
		"display_name": user.DisplayName,
		"birth_date":   user.BirthDate.Format("2006-01-02"),
		"avatar_url":   user.AvatarURL,
		"bio":          user.Bio,
	}
}

func (s *Server) writeError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	message := "Внутренняя ошибка сервера"
	code := ""
	switch {
	case errors.Is(err, service.ErrInvalidInput):
		status, message = http.StatusBadRequest, err.Error()
	case errors.Is(err, repository.ErrEmailTaken):
		status, message = http.StatusConflict, "Эта почта уже зарегистрирована"
	case errors.Is(err, repository.ErrUsernameTaken):
		status, message = http.StatusConflict, "Этот username уже занят"
	case errors.Is(err, repository.ErrEmailNotVerified):
		status, message = http.StatusForbidden, "Сначала подтвердите почту"
	case errors.Is(err, repository.ErrCodeInvalid):
		status, message = http.StatusBadRequest, "Неверный код подтверждения"
		code = "INVALID_CODE"
	case errors.Is(err, repository.ErrCodeExpired):
		status, message = http.StatusBadRequest, "Код истёк. Запросите новый"
		code = "CODE_EXPIRED"
	case errors.Is(err, repository.ErrTooManyAttempts):
		status, message = http.StatusTooManyRequests, "Слишком много попыток. Запросите новый код"
		code = "CODE_ATTEMPTS_EXCEEDED"
	case errors.Is(err, repository.ErrTooSoon):
		status, message = http.StatusTooManyRequests, "Повторно запросить код можно через минуту"
	case errors.Is(err, service.ErrInvalidCredentials):
		status, message = http.StatusUnauthorized, "Неверные данные для входа"
	case errors.Is(err, service.ErrInvalidRefresh):
		status, message = http.StatusUnauthorized, "Сессия истекла. Войдите снова"
	case errors.Is(err, service.ErrSelfFriendRequest):
		status, message = http.StatusBadRequest, "Нельзя добавить самого себя"
	case errors.Is(err, service.ErrUserNotFound):
		status, message = http.StatusNotFound, "Пользователь не найден"
	case errors.Is(err, repository.ErrFriendshipExists):
		status, message = http.StatusConflict, "Запрос уже существует или вы уже друзья"
	case errors.Is(err, repository.ErrFriendshipNotFound):
		status, message = http.StatusNotFound, "Запрос не найден"
	case errors.Is(err, repository.ErrNotFriend):
		status, message = http.StatusNotFound, "Пользователь не находится в списке друзей"
	}
	if status == http.StatusInternalServerError {
		log.Printf("internal error: %v", err)
	}
	body := map[string]string{"error": message}
	if code != "" {
		body["code"] = code
	}
	writeJSON(w, status, body)
}

func (s *Server) emptyList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Маршрут пока не реализован"})
		return
	}
	writeJSON(w, http.StatusOK, []any{})
}

type userIDKey struct{}

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := strings.TrimSpace(r.Header.Get("Authorization"))
		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Требуется авторизация"})
			return
		}
		id, err := s.tokens.ParseAccess(strings.TrimSpace(parts[1]))
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Сессия истекла. Войдите снова"})
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userIDKey{}, id)))
	})
}

func currentUserID(r *http.Request) uuid.UUID {
	id, _ := r.Context().Value(userIDKey{}).(uuid.UUID)
	return id
}

func (s *Server) friendRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/friends"), "/")
	userID := currentUserID(r)
	switch {
	case path == "" && r.Method == http.MethodGet:
		friends, err := s.friends.Friends(r.Context(), userID)
		if err != nil {
			s.writeError(w, err)
			return
		}
		result := make([]map[string]any, 0, len(friends))
		for _, user := range friends {
			result = append(result, map[string]any{"id": user.ID, "userId": user.ID, "username": user.Username, "name": user.DisplayName, "displayName": user.DisplayName, "avatar": user.AvatarURL, "avatarUrl": user.AvatarURL, "bio": user.Bio, "lastSeenAt": user.LastSeenAt})
		}
		writeJSON(w, http.StatusOK, result)
	case path == "requests" && r.Method == http.MethodGet:
		incoming, outgoing, err := s.friends.Requests(r.Context(), userID)
		if err != nil {
			s.writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"incoming": friendRequestDTOs(incoming), "outgoing": friendRequestDTOs(outgoing)})
	case path == "requests" && r.Method == http.MethodPost:
		var input struct {
			Username string `json:"username"`
		}
		if !decode(w, r, &input) {
			return
		}
		request, err := s.friends.SendRequest(r.Context(), userID, input.Username)
		if err != nil {
			s.writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"id": request.ID, "status": request.Status})
	case strings.HasPrefix(path, "requests/"):
		parts := strings.Split(path, "/")
		if len(parts) != 3 {
			http.NotFound(w, r)
			return
		}
		requestID, err := uuid.Parse(parts[1])
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Некорректный ID запроса"})
			return
		}
		switch {
		case parts[2] == "accept" && r.Method == http.MethodPost:
			err = s.friends.Accept(r.Context(), requestID, userID)
		case parts[2] == "decline" && r.Method == http.MethodPost:
			err = s.friends.Decline(r.Context(), requestID, userID)
		case parts[2] == "cancel" && r.Method == http.MethodDelete:
			err = s.friends.Cancel(r.Context(), requestID, userID)
		default:
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
			return
		}
		if err != nil {
			s.writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	case path != "" && r.Method == http.MethodDelete:
		friendID, err := uuid.Parse(path)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Некорректный ID пользователя"})
			return
		}
		if err := s.friends.Remove(r.Context(), userID, friendID); err != nil {
			s.writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
	}
}

func friendRequestDTOs(entries []repository.FriendshipEntry) []map[string]any {
	result := make([]map[string]any, 0, len(entries))
	for _, entry := range entries {
		user := entry.User
		result = append(result, map[string]any{"id": entry.Friendship.ID, "userId": user.ID, "username": user.Username, "name": user.DisplayName, "displayName": user.DisplayName, "avatar": user.AvatarURL, "avatarUrl": user.AvatarURL, "bio": user.Bio, "description": user.Bio, "status": entry.Friendship.Status, "createdAt": entry.Friendship.CreatedAt})
	}
	return result
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "http://localhost:5173" || origin == "http://127.0.0.1:5173" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func method(w http.ResponseWriter, r *http.Request, expected string) bool {
	if r.Method == expected {
		return true
	}
	w.Header().Set("Allow", expected)
	writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
	return false
}

func decode(w http.ResponseWriter, r *http.Request, value any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(value); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Некорректные данные запроса"})
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
