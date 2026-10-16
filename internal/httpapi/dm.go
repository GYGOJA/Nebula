package httpapi

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/TheLonger011/Nebula/internal/models"
	"github.com/TheLonger011/Nebula/internal/repository"
	"github.com/TheLonger011/Nebula/internal/service"
	"github.com/google/uuid"
)

const (
	maxMessageLen  = 4000
	defaultDMLimit = 100
	maxDMLimit     = 200
)

func userDTO(u *models.User) map[string]any {
	return map[string]any{
		"id": u.ID, "userId": u.ID,
		"username": u.Username,
		"name":     u.DisplayName, "displayName": u.DisplayName,
		"avatar": str(u.AvatarURL), "avatarUrl": str(u.AvatarURL),
		"bio": str(u.Bio), "lastSeenAt": u.LastSeenAt,
	}
}

type dmRow struct {
	ID            uuid.UUID
	Sender        uuid.UUID
	Recipient     uuid.UUID
	Content       string
	Created       time.Time
	ReadAt        *time.Time
	Attachments   []Attachment
	EditedAt      *time.Time
	ReplyToID     *uuid.UUID
	ReplyToText   string
	ReplyToAuthor string
}

func dmMessageDTO(m dmRow, me uuid.UUID, author *models.User) map[string]any {
	authorID := m.Sender.String()
	if m.Sender == me {
		authorID = "me"
	}
	status := "sent"
	if m.ReadAt != nil {
		status = "read"
	}
	atts := make([]map[string]any, 0, len(m.Attachments))
	for _, a := range m.Attachments {
		atts = append(atts, a.dto())
	}
	return map[string]any{
		"id": m.ID.String(), "senderId": m.Sender, "recipientId": m.Recipient,
		"text": m.Content, "content": m.Content,
		"createdAt": m.Created, "time": m.Created.Format("15:04"),
		"authorId": authorID,
		"readAt":   m.ReadAt, "status": status,
		"attachments": atts,
		"editedAt":    m.EditedAt,
		"replyTo": func() any {
			if m.ReplyToID == nil {
				return nil
			}
			return map[string]any{"id": *m.ReplyToID, "text": m.ReplyToText, "author": m.ReplyToAuthor}
		}(),
		"author": map[string]any{
			"id": author.ID, "name": author.DisplayName, "displayName": author.DisplayName,
			"avatar": str(author.AvatarURL),
		},
	}
}

func (s *Server) loadAttachments(r *http.Request, rows []dmRow) error {
	if len(rows) == 0 {
		return nil
	}
	ids := make([]string, len(rows))
	index := make(map[uuid.UUID]int, len(rows))
	for i, m := range rows {
		ids[i] = m.ID.String()
		index[m.ID] = i
	}
	res, err := s.db.Query(r.Context(), `
		SELECT id, message_id, kind, file_name, mime, size_bytes, duration_ms, storage_key
		FROM dm_attachments WHERE message_id = ANY($1::uuid[]) ORDER BY created_at, id`, ids)
	if err != nil {
		return err
	}
	defer res.Close()
	for res.Next() {
		var a Attachment
		if err := res.Scan(&a.ID, &a.MessageID, &a.Kind, &a.FileName, &a.Mime, &a.Size, &a.DurationMs, &a.StorageKey); err != nil {
			return err
		}
		if i, ok := index[a.MessageID]; ok {
			rows[i].Attachments = append(rows[i].Attachments, a)
		}
	}
	return res.Err()
}

func (s *Server) dmConversations(w http.ResponseWriter, r *http.Request, me uuid.UUID) {
	rows, err := s.db.Query(r.Context(), `
		SELECT u.id::text, u.username, u.display_name, u.avatar_url, l.content, l.created_at, l.from_me,
		       (SELECT a.kind FROM dm_attachments a WHERE a.message_id = l.id ORDER BY a.created_at, a.id LIMIT 1),
		       (SELECT count(*) FROM dm_attachments a WHERE a.message_id = l.id),
		       (SELECT count(*) FROM direct_messages x WHERE x.recipient_id = $1 AND x.sender_id = u.id AND x.read_at IS NULL)
		FROM (
			SELECT DISTINCT ON (other_id)
				id,
				CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other_id,
				content, created_at, (sender_id = $1) AS from_me
			FROM direct_messages
			WHERE sender_id = $1 OR recipient_id = $1
			ORDER BY other_id, created_at DESC, id DESC
		) l
		JOIN users u ON u.id = l.other_id AND u.deleted_at IS NULL
		ORDER BY l.created_at DESC`, me)
	if err != nil {
		s.writeError(w, err)
		return
	}
	defer rows.Close()

	result := make([]map[string]any, 0)
	for rows.Next() {
		var id, username, name, content string
		var avatar, attKind *string
		var created time.Time
		var fromMe bool
		var attCount, unread int64
		if err := rows.Scan(&id, &username, &name, &avatar, &content, &created, &fromMe, &attKind, &attCount, &unread); err != nil {
			s.writeError(w, err)
			return
		}
		result = append(result, map[string]any{
			"userId": id, "id": id, "username": username,
			"name": name, "displayName": name,
			"avatar": str(avatar), "avatarUrl": str(avatar),
			"unread": unread,
			"last": map[string]any{
				"text": content, "createdAt": created, "fromMe": fromMe,
				"attachmentKind": str(attKind), "attachmentCount": attCount,
			},
		})
	}
	if err := rows.Err(); err != nil {
		s.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) dmUnread(w http.ResponseWriter, r *http.Request, me uuid.UUID) {
	if !method(w, r, http.MethodGet) {
		return
	}
	rows, err := s.db.Query(r.Context(),
		`SELECT sender_id::text, count(*) FROM direct_messages WHERE recipient_id = $1 AND read_at IS NULL GROUP BY sender_id`, me)
	if err != nil {
		s.writeError(w, err)
		return
	}
	defer rows.Close()
	byUser := map[string]int64{}
	var total int64
	for rows.Next() {
		var id string
		var n int64
		if err := rows.Scan(&id, &n); err != nil {
			s.writeError(w, err)
			return
		}
		byUser[id] = n
		total += n
	}
	if err := rows.Err(); err != nil {
		s.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"total": total, "byUser": byUser})
}

func (s *Server) dmRoutes(w http.ResponseWriter, r *http.Request) {
	me := currentUserID(r)
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/dm"), "/")

	if path == "" {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
			return
		}
		s.dmConversations(w, r, me)
		return
	}
	if path == "unread" {
		s.dmUnread(w, r, me)
		return
	}
	if id, ok := strings.CutPrefix(path, "attachments/"); ok {
		s.attachmentFile(w, r, me, id)
		return
	}

	parts := strings.Split(path, "/")
	if len(parts) > 3 || (len(parts) == 2 && parts[1] != "messages" && parts[1] != "read") || (len(parts) == 3 && parts[1] != "messages") {
		http.NotFound(w, r)
		return
	}
	otherID, err := uuid.Parse(parts[0])
	if err != nil || otherID == me {
		badRequest(w, "Некорректный пользователь")
		return
	}

	if len(parts) == 3 {
		messageID, parseErr := uuid.Parse(parts[2])
		if parseErr != nil {
			badRequest(w, "Некорректный ID сообщения")
			return
		}
		s.dmMessageAction(w, r, me, otherID, messageID)
		return
	}
	users := repository.NewUserRepository(s.db)
	other, err := users.GetByID(r.Context(), otherID)
	if err != nil {
		s.writeError(w, service.ErrUserNotFound)
		return
	}

	if len(parts) == 1 {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
			return
		}
		writeJSON(w, http.StatusOK, userDTO(other))
		return
	}

	if parts[1] == "read" {
		s.dmMarkRead(w, r, me, otherID)
		return
	}

	self, err := users.GetByID(r.Context(), me)
	if err != nil {
		s.writeError(w, err)
		return
	}
	authors := map[uuid.UUID]*models.User{me: self, otherID: other}

	switch r.Method {
	case http.MethodGet:
		limit := defaultDMLimit
		if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 {
			limit = min(v, maxDMLimit)
		}

		res, err := s.db.Query(r.Context(), `
			SELECT t.id, t.sender_id, t.recipient_id, t.content, t.created_at, t.read_at, t.edited_at, t.reply_to_id,
		       COALESCE(reply.content,''), COALESCE(reply_user.display_name,'')
			FROM (
				SELECT id, sender_id, recipient_id, content, created_at, read_at, edited_at, reply_to_id
				FROM direct_messages
				WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
				ORDER BY created_at DESC, id DESC
				LIMIT $3
			) t
			LEFT JOIN direct_messages reply ON reply.id=t.reply_to_id
			LEFT JOIN users reply_user ON reply_user.id=reply.sender_id
			ORDER BY t.created_at ASC, t.id ASC`, me, otherID, limit)
		if err != nil {
			s.writeError(w, err)
			return
		}
		defer res.Close()

		var rows []dmRow
		for res.Next() {
			var m dmRow
			if err := res.Scan(&m.ID, &m.Sender, &m.Recipient, &m.Content, &m.Created, &m.ReadAt, &m.EditedAt, &m.ReplyToID, &m.ReplyToText, &m.ReplyToAuthor); err != nil {
				s.writeError(w, err)
				return
			}
			rows = append(rows, m)
		}
		if err := res.Err(); err != nil {
			s.writeError(w, err)
			return
		}
		res.Close()
		if err := s.loadAttachments(r, rows); err != nil {
			s.writeError(w, err)
			return
		}
		result := make([]map[string]any, 0, len(rows))
		for _, m := range rows {
			result = append(result, dmMessageDTO(m, me, authors[m.Sender]))
		}
		writeJSON(w, http.StatusOK, result)

	case http.MethodPost:
		s.dmSend(w, r, me, otherID, self, other)

	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
	}
}

func (s *Server) dmSend(w http.ResponseWriter, r *http.Request, me, otherID uuid.UUID, self, other *models.User) {
	var text, replyToIDText string
	var files []savedFile

	ct := baseMime(r.Header.Get("Content-Type"))
	if ct == "multipart/form-data" {
		r.Body = http.MaxBytesReader(w, r.Body, maxUploadRequest)
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			var tooBig *http.MaxBytesError
			if errors.As(err, &tooBig) {
				badRequest(w, "Слишком большой объём файлов (не более 100 МБ)")
				return
			}
			badRequest(w, "Некорректная загрузка файлов")
			return
		}
		defer r.MultipartForm.RemoveAll()

		text = strings.TrimSpace(r.FormValue("text"))
		replyToIDText = strings.TrimSpace(r.FormValue("replyToId"))
		headers := r.MultipartForm.File["files"]
		if len(headers) > maxAttachmentsPerMsg {
			badRequest(w, "Не более 10 файлов в одном сообщении")
			return
		}
		voice := r.FormValue("voice") == "1" || r.FormValue("voice") == "true"
		if voice && len(headers) != 1 {
			badRequest(w, "Голосовое сообщение должно содержать один файл")
			return
		}
		var duration *int
		if voice {
			duration = parseDuration(r.FormValue("duration"))
		}
		for _, h := range headers {
			f, err := saveUpload(h, voice, duration)
			if err != nil {
				removeSaved(files)
				var ue *uploadError
				if errors.As(err, &ue) {
					badRequest(w, ue.msg)
				} else {
					s.writeError(w, err)
				}
				return
			}
			files = append(files, *f)
		}
	} else {
		var input struct {
			Text      string `json:"text"`
			Content   string `json:"content"`
			ReplyToID string `json:"replyToId"`
		}
		if !decode(w, r, &input) {
			return
		}
		text = strings.TrimSpace(input.Text)
		if text == "" {
			text = strings.TrimSpace(input.Content)
		}
		replyToIDText = strings.TrimSpace(input.ReplyToID)
	}

	n := runes(text)
	if n > maxMessageLen || (n == 0 && len(files) == 0) {
		removeSaved(files)
		badRequest(w, "Сообщение должно содержать от 1 до 4000 символов или вложение")
		return
	}

	var replyToID any
	if replyToIDText != "" {
		parsed, parseErr := uuid.Parse(replyToIDText)
		if parseErr != nil {
			removeSaved(files)
			badRequest(w, "Некорректный ответ на сообщение")
			return
		}
		var replyText, replyAuthor string
		err := s.db.QueryRow(r.Context(), `SELECT m.content, u.display_name FROM direct_messages m JOIN users u ON u.id=m.sender_id WHERE m.id=$1 AND ((m.sender_id=$2 AND m.recipient_id=$3) OR (m.sender_id=$3 AND m.recipient_id=$2))`, parsed, me, otherID).Scan(&replyText, &replyAuthor)
		if err != nil {
			removeSaved(files)
			badRequest(w, "Исходное сообщение не найдено в этом диалоге")
			return
		}
		replyToID = parsed
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		removeSaved(files)
		s.writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())

	msg := dmRow{Sender: me, Recipient: otherID, Content: text}
	if parsed, ok := replyToID.(uuid.UUID); ok {
		msg.ReplyToID = &parsed
		_ = s.db.QueryRow(r.Context(), `SELECT m.content, u.display_name FROM direct_messages m JOIN users u ON u.id=m.sender_id WHERE m.id=$1 AND ((m.sender_id=$2 AND m.recipient_id=$3) OR (m.sender_id=$3 AND m.recipient_id=$2))`, parsed, me, otherID).Scan(&msg.ReplyToText, &msg.ReplyToAuthor)
	}
	if err := tx.QueryRow(r.Context(),
		`INSERT INTO direct_messages (sender_id, recipient_id, content, reply_to_id) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
		me, otherID, text, replyToID).Scan(&msg.ID, &msg.Created); err != nil {
		removeSaved(files)
		s.writeError(w, err)
		return
	}
	for i := range files {
		f := &files[i]
		f.MessageID = msg.ID
		if _, err := tx.Exec(r.Context(), `
			INSERT INTO dm_attachments (id, message_id, kind, file_name, mime, size_bytes, duration_ms, storage_key)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			f.ID, msg.ID, f.Kind, f.FileName, f.Mime, f.Size, f.DurationMs, f.StorageKey); err != nil {
			removeSaved(files)
			s.writeError(w, err)
			return
		}
		msg.Attachments = append(msg.Attachments, f.Attachment)
	}
	if err := tx.Commit(r.Context()); err != nil {
		removeSaved(files)
		s.writeError(w, err)
		return
	}

	s.hub.Publish(otherID, Event{Type: "message", Data: map[string]any{
		"message": dmMessageDTO(msg, otherID, self),
		"peer":    userDTO(self),
	}})
	s.hub.Publish(me, Event{Type: "message", Data: map[string]any{
		"message": dmMessageDTO(msg, me, self),
		"peer":    userDTO(other),
	}})

	writeJSON(w, http.StatusCreated, dmMessageDTO(msg, me, self))
}

func (s *Server) dmMarkRead(w http.ResponseWriter, r *http.Request, me, otherID uuid.UUID) {
	if !method(w, r, http.MethodPost) {
		return
	}
	rows, err := s.db.Query(r.Context(), `
		UPDATE direct_messages SET read_at = NOW()
		WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL
		RETURNING id::text, read_at`, me, otherID)
	if err != nil {
		s.writeError(w, err)
		return
	}
	defer rows.Close()
	ids := []string{}
	var readAt time.Time
	for rows.Next() {
		var id string
		if err := rows.Scan(&id, &readAt); err != nil {
			s.writeError(w, err)
			return
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		s.writeError(w, err)
		return
	}
	if len(ids) > 0 {
		s.hub.Publish(otherID, Event{Type: "read", Data: map[string]any{"peerId": me, "ids": ids, "readAt": readAt}})
		s.hub.Publish(me, Event{Type: "read_self", Data: map[string]any{"peerId": otherID, "count": len(ids)}})
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "count": len(ids)})
}
