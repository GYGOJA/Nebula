package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const (
	maxChannelMessageLen  = 20000
	defaultChannelLimit   = 100
	maxChannelLimit       = 300
	channelAttachmentsURL = "/api/channels/attachments/"
)

type channelMessageInput struct {
	Content   string `json:"content"`
	Text      string `json:"text"`
	ReplyToID string `json:"replyToId"`
}

type channelRow struct {
	ID            uuid.UUID
	ChannelID     uuid.UUID
	AuthorID      uuid.UUID
	Content       string
	Created       time.Time
	Attachments   []Attachment
	EditedAt      *time.Time
	ReplyToID     *uuid.UUID
	ReplyToText   string
	ReplyToAuthor string
}

func channelMessageDTO(m channelRow, me uuid.UUID, author map[string]any) map[string]any {
	authorKey := m.AuthorID.String()
	self := m.AuthorID == me
	if self {
		authorKey = "me"
	}
	atts := make([]map[string]any, 0, len(m.Attachments))
	for _, a := range m.Attachments {
		atts = append(atts, a.dtoAt(channelAttachmentsURL))
	}
	if author == nil {
		author = map[string]any{"id": m.AuthorID}
	}
	return map[string]any{
		"id": m.ID, "channelId": m.ChannelID, "authorId": authorKey, "senderId": m.AuthorID, "self": self,
		"author":  author,
		"text":    m.Content,
		"content": m.Content, "createdAt": m.Created, "time": m.Created.Format("15:04"),
		"attachments": atts,
		"editedAt":    m.EditedAt,
		"replyTo": func() any {
			if m.ReplyToID == nil {
				return nil
			}
			return map[string]any{"id": *m.ReplyToID, "text": m.ReplyToText, "author": m.ReplyToAuthor}
		}(),
	}
}

func (s *Server) loadChannelAttachments(ctx context.Context, rows []channelRow) error {
	if len(rows) == 0 {
		return nil
	}
	ids := make([]string, len(rows))
	index := make(map[uuid.UUID]int, len(rows))
	for i, m := range rows {
		ids[i] = m.ID.String()
		index[m.ID] = i
	}
	res, err := s.db.Query(ctx, `SELECT id, message_id, kind, file_name, mime, size_bytes, duration_ms, storage_key FROM channel_attachments WHERE message_id::text = ANY($1) ORDER BY created_at, id`, ids)
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

func (s *Server) channelRoutes(w http.ResponseWriter, r *http.Request) {
	userID := currentUserID(r)
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/channels"), "/")
	if path == "" {
		s.channelList(w, r, userID)
		return
	}
	parts := strings.Split(path, "/")
	if parts[0] == "attachments" && len(parts) == 2 {
		s.channelAttachmentFile(w, r, userID, parts[1])
		return
	}
	channelID, err := uuid.Parse(parts[0])
	if err != nil {
		badRequest(w, "Некорректный ID канала")
		return
	}
	var spaceID uuid.UUID
	var channelName, typ string
	var restricted bool
	err = s.db.QueryRow(r.Context(), `SELECT c.space_id,c.name,c.type,c.restricted FROM space_channels c WHERE c.id=$1`, channelID).Scan(&spaceID, &channelName, &typ, &restricted)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && typ != "text") {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Текстовый канал не найден"})
		return
	}
	if err != nil {
		s.writeError(w, err)
		return
	}
	perms := s.spacePerms(r.Context(), spaceID, userID)
	if !perms.Member {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Вы не состоите в этой группе"})
		return
	}
	canView, canWrite := s.channelAccessFor(r.Context(), perms, channelID, userID, restricted)
	if !canView {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "У вас нет доступа к этому каналу"})
		return
	}
	if len(parts) == 3 && parts[1] == "messages" {
		messageID, parseErr := uuid.Parse(parts[2])
		if parseErr != nil {
			badRequest(w, "Некорректный ID сообщения")
			return
		}
		if r.Method == http.MethodPatch && !canWrite {
			forbidden(w, "У вас нет права редактировать сообщения в этом канале")
			return
		}
		s.channelMessageAction(w, r, userID, channelID, spaceID, messageID, perms)
		return
	}
	if len(parts) != 2 || parts[1] != "messages" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Маршрут не найден"})
		return
	}
	switch r.Method {
	case http.MethodGet:
		s.channelMessages(w, r, userID, channelID)
	case http.MethodPost:
		if !canWrite {
			forbidden(w, "У вас нет права писать в этом канале")
			return
		}
		s.channelSend(w, r, userID, channelID, spaceID)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
	}
}

func (s *Server) channelList(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT c.id,c.space_id,c.name,c.type FROM space_channels c JOIN spaces sp ON sp.id=c.space_id WHERE `+channelViewSQL("sp", "c", "$1")+` AND c.type='text' ORDER BY c.created_at`, userID)
	if err != nil {
		s.writeError(w, err)
		return
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var id, spaceID uuid.UUID
		var name, typ string
		if err := rows.Scan(&id, &spaceID, &name, &typ); err != nil {
			s.writeError(w, err)
			return
		}
		items = append(items, map[string]any{"id": id, "spaceId": spaceID, "name": name, "type": typ})
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) channelMessages(w http.ResponseWriter, r *http.Request, userID, channelID uuid.UUID) {
	limit := defaultChannelLimit
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 {
		limit = min(v, maxChannelLimit)
	}
	res, err := s.db.Query(r.Context(), `
		SELECT m.id, m.channel_id, m.author_id, m.content, m.created_at, m.edited_at, m.reply_to_id,
		       COALESCE(reply.content,''), COALESCE(reply_user.display_name,'')
		FROM (
			SELECT id, channel_id, author_id, content, created_at, edited_at, reply_to_id
			FROM channel_messages WHERE channel_id=$1
			ORDER BY created_at DESC, id DESC LIMIT $2
		) m
		LEFT JOIN channel_messages reply ON reply.id=m.reply_to_id
		LEFT JOIN users reply_user ON reply_user.id=reply.author_id
		ORDER BY m.created_at ASC, m.id ASC`, channelID, limit)
	if err != nil {
		s.writeError(w, err)
		return
	}
	defer res.Close()
	var rows []channelRow
	authorIDs := make(map[uuid.UUID]struct{})
	for res.Next() {
		var m channelRow
		if err := res.Scan(&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &m.Created, &m.EditedAt, &m.ReplyToID, &m.ReplyToText, &m.ReplyToAuthor); err != nil {
			s.writeError(w, err)
			return
		}
		rows = append(rows, m)
		authorIDs[m.AuthorID] = struct{}{}
	}
	if err := res.Err(); err != nil {
		s.writeError(w, err)
		return
	}
	res.Close()
	if err := s.loadChannelAttachments(r.Context(), rows); err != nil {
		s.writeError(w, err)
		return
	}
	ids := make([]uuid.UUID, 0, len(authorIDs))
	for id := range authorIDs {
		ids = append(ids, id)
	}
	cards := s.userCards(r.Context(), ids)
	items := make([]map[string]any, 0, len(rows))
	for _, m := range rows {
		items = append(items, channelMessageDTO(m, userID, cards[m.AuthorID]))
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) channelSend(w http.ResponseWriter, r *http.Request, userID, channelID, spaceID uuid.UUID) {
	var text, replyToIDText string
	var files []savedFile
	if baseMime(r.Header.Get("Content-Type")) == "multipart/form-data" {
		var ok bool
		text, files, ok = s.readUpload(w, r, channelAttachmentDir())
		if !ok {
			return
		}
		replyToIDText = strings.TrimSpace(r.FormValue("replyToId"))
	} else {
		var input channelMessageInput
		if !decode(w, r, &input) {
			return
		}
		text = strings.TrimSpace(input.Content)
		if text == "" {
			text = strings.TrimSpace(input.Text)
		}
		replyToIDText = strings.TrimSpace(input.ReplyToID)
	}
	n := runes(text)
	if n > maxChannelMessageLen || (n == 0 && len(files) == 0) {
		removeSaved(files)
		badRequest(w, "Сообщение должно содержать от 1 до 20000 символов или вложение")
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
		err := s.db.QueryRow(r.Context(), `SELECT m.content, u.display_name FROM channel_messages m JOIN users u ON u.id=m.author_id WHERE m.id=$1 AND m.channel_id=$2`, parsed, channelID).Scan(&replyText, &replyAuthor)
		if err != nil {
			removeSaved(files)
			badRequest(w, "Исходное сообщение не найдено в этом канале")
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
	msg := channelRow{ChannelID: channelID, AuthorID: userID, Content: text}
	if parsed, ok := replyToID.(uuid.UUID); ok {
		msg.ReplyToID = &parsed
		_ = s.db.QueryRow(r.Context(), `SELECT m.content, u.display_name FROM channel_messages m JOIN users u ON u.id=m.author_id WHERE m.id=$1 AND m.channel_id=$2`, parsed, channelID).Scan(&msg.ReplyToText, &msg.ReplyToAuthor)
	}
	if err := tx.QueryRow(r.Context(), `INSERT INTO channel_messages(channel_id,author_id,content,reply_to_id) VALUES($1,$2,$3,$4) RETURNING id,created_at`, channelID, userID, text, replyToID).Scan(&msg.ID, &msg.Created); err != nil {
		removeSaved(files)
		s.writeError(w, err)
		return
	}
	for i := range files {
		f := &files[i]
		f.MessageID = msg.ID
		if _, err := tx.Exec(r.Context(), `INSERT INTO channel_attachments (id, message_id, kind, file_name, mime, size_bytes, duration_ms, storage_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, f.ID, msg.ID, f.Kind, f.FileName, f.Mime, f.Size, f.DurationMs, f.StorageKey); err != nil {
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
	cards := s.userCards(r.Context(), []uuid.UUID{userID})
	author := cards[userID]
	if members, err := s.channelAudience(r.Context(), spaceID, channelID); err == nil {
		for _, id := range members {
			s.hub.Publish(id, Event{Type: "channel_message", Data: map[string]any{
				"channelId": channelID, "spaceId": spaceID,
				"message": channelMessageDTO(msg, id, author),
			}})
		}
	}
	writeJSON(w, http.StatusCreated, channelMessageDTO(msg, userID, author))
}

func (s *Server) readUpload(w http.ResponseWriter, r *http.Request, dir string) (string, []savedFile, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadRequest)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			badRequest(w, "Слишком большой объём файлов (не более 100 МБ)")
			return "", nil, false
		}
		badRequest(w, "Некорректная загрузка файлов")
		return "", nil, false
	}
	defer r.MultipartForm.RemoveAll()
	text := strings.TrimSpace(r.FormValue("text"))
	headers := r.MultipartForm.File["files"]
	if len(headers) > maxAttachmentsPerMsg {
		badRequest(w, "Не более 10 файлов в одном сообщении")
		return "", nil, false
	}
	voice := r.FormValue("voice") == "1" || r.FormValue("voice") == "true"
	if voice && len(headers) != 1 {
		badRequest(w, "Голосовое сообщение должно содержать один файл")
		return "", nil, false
	}
	var duration *int
	if voice {
		duration = parseDuration(r.FormValue("duration"))
	}
	var files []savedFile
	for _, h := range headers {
		f, err := saveUploadIn(dir, h, voice, duration)
		if err != nil {
			removeSaved(files)
			var ue *uploadError
			if errors.As(err, &ue) {
				badRequest(w, ue.msg)
			} else {
				s.writeError(w, err)
			}
			return "", nil, false
		}
		files = append(files, *f)
	}
	return text, files, true
}

func (s *Server) channelAttachmentFile(w http.ResponseWriter, r *http.Request, me uuid.UUID, idStr string) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
		return
	}
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	var a Attachment
	var spaceID, sectionID uuid.UUID
	err = s.db.QueryRow(r.Context(), `
		SELECT a.kind, a.file_name, a.mime, a.size_bytes, a.storage_key, c.space_id, c.id
		FROM channel_attachments a
		JOIN channel_messages m ON m.id = a.message_id
		JOIN space_channels c ON c.id = m.channel_id
		WHERE a.id = $1`, id).Scan(&a.Kind, &a.FileName, &a.Mime, &a.Size, &a.StorageKey, &spaceID, &sectionID)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	if view, _ := s.channelAccess(r.Context(), spaceID, sectionID, me); !view {
		http.NotFound(w, r)
		return
	}
	serveStoredFile(w, r, a, channelAttachmentDir())
}
