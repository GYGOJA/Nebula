package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	defaultPanelLimit = 30
	maxPanelLimit     = 100
	threadPreviewLen  = 140
)

func panelLimit(r *http.Request) int {
	limit := defaultPanelLimit
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 {
		limit = min(v, maxPanelLimit)
	}
	return limit
}

func panelOffset(r *http.Request) int {
	if v, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && v > 0 {
		return v
	}
	return 0
}

// panelChannelFilter returns the optional ?channelId= filter as text ("" = whole space).
func panelChannelFilter(r *http.Request) (string, bool) {
	raw := strings.TrimSpace(r.URL.Query().Get("channelId"))
	if raw == "" {
		return "", true
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return "", false
	}
	return id.String(), true
}

func previewText(text string, max int) string {
	text = strings.Join(strings.Fields(text), " ")
	runes := []rune(text)
	if len(runes) <= max {
		return text
	}
	return string(runes[:max]) + "…"
}

// spacePanelRoutes serves the data of the right-hand panel of a group:
//
//	GET /api/spaces/{id}/files    - every attachment of the group (channels the user can see)
//	GET /api/spaces/{id}/threads  - threads: messages that have replies
//
// It returns false when the request is not for one of those routes.
func (s *Server) spacePanelRoutes(w http.ResponseWriter, r *http.Request, parts []string, spaceID, userID uuid.UUID, member bool) bool {
	if len(parts) != 2 || (parts[1] != "files" && parts[1] != "threads") {
		return false
	}
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
		return true
	}
	if !member {
		forbidden(w, "Вы не состоите в этой группе")
		return true
	}
	channelID, ok := panelChannelFilter(r)
	if !ok {
		badRequest(w, "Некорректный ID канала")
		return true
	}
	if parts[1] == "files" {
		s.spaceFiles(w, r, spaceID, userID, channelID)
	} else {
		s.spaceThreads(w, r, spaceID, userID, channelID)
	}
	return true
}

func (s *Server) spaceFiles(w http.ResponseWriter, r *http.Request, spaceID, userID uuid.UUID, channelID string) {
	kind := strings.TrimSpace(r.URL.Query().Get("kind"))
	switch kind {
	case "", "image", "video", "audio", "file":
	default:
		badRequest(w, "Некорректный тип файлов")
		return
	}
	limit, offset := panelLimit(r), panelOffset(r)

	// Voice messages are not "files"; everything else is listed unless a kind is requested.
	rows, err := s.db.Query(r.Context(), `
		SELECT a.id, a.kind, a.file_name, a.mime, a.size_bytes, a.duration_ms, a.created_at,
		       m.id, m.author_id, c.id, c.name
		FROM channel_attachments a
		JOIN channel_messages m ON m.id = a.message_id
		JOIN space_channels c ON c.id = m.channel_id
		JOIN spaces sp ON sp.id = c.space_id
		WHERE c.space_id = $1
		  AND `+channelViewSQL("sp", "c", "$2")+`
		  AND ($3::text = '' OR c.id::text = $3::text)
		  AND ((($4::text = '') AND a.kind <> 'voice') OR a.kind = $4::text)
		ORDER BY a.created_at DESC, a.id DESC
		LIMIT $5 OFFSET $6`, spaceID, userID, channelID, kind, limit+1, offset)
	if err != nil {
		s.writeError(w, err)
		return
	}
	defer rows.Close()

	type fileRow struct {
		att         Attachment
		createdAt   time.Time
		messageID   uuid.UUID
		authorID    uuid.UUID
		channelID   uuid.UUID
		channelName string
	}
	var list []fileRow
	authorSet := make(map[uuid.UUID]struct{})
	for rows.Next() {
		var f fileRow
		if err := rows.Scan(&f.att.ID, &f.att.Kind, &f.att.FileName, &f.att.Mime, &f.att.Size, &f.att.DurationMs,
			&f.createdAt, &f.messageID, &f.authorID, &f.channelID, &f.channelName); err != nil {
			s.writeError(w, err)
			return
		}
		list = append(list, f)
		authorSet[f.authorID] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		s.writeError(w, err)
		return
	}
	rows.Close()

	hasMore := len(list) > limit
	if hasMore {
		list = list[:limit]
	}
	ids := make([]uuid.UUID, 0, len(authorSet))
	for id := range authorSet {
		ids = append(ids, id)
	}
	cards := s.userCards(r.Context(), ids)

	items := make([]map[string]any, 0, len(list))
	for _, f := range list {
		item := f.att.dtoAt(channelAttachmentsURL)
		item["createdAt"] = f.createdAt
		item["messageId"] = f.messageID
		item["channelId"] = f.channelID
		item["channelName"] = f.channelName
		item["author"] = cards[f.authorID]
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "hasMore": hasMore})
}

func (s *Server) spaceThreads(w http.ResponseWriter, r *http.Request, spaceID, userID uuid.UUID, channelID string) {
	limit, offset := panelLimit(r), panelOffset(r)

	rows, err := s.db.Query(r.Context(), `
		SELECT root.id, root.channel_id, c.name, root.author_id, root.content, root.created_at,
		       t.replies, t.participants, t.last_at,
		       COALESCE(lr.content, ''), lr.author_id,
		       EXISTS (SELECT 1 FROM channel_attachments ra WHERE ra.message_id = root.id)
		FROM (
			SELECT x.reply_to_id AS root_id, COUNT(*) AS replies,
			       COUNT(DISTINCT x.author_id) AS participants, MAX(x.created_at) AS last_at
			FROM channel_messages x
			JOIN space_channels xc ON xc.id = x.channel_id
			WHERE x.reply_to_id IS NOT NULL AND xc.space_id = $1
			GROUP BY x.reply_to_id
		) t
		JOIN channel_messages root ON root.id = t.root_id
		JOIN space_channels c ON c.id = root.channel_id
		JOIN spaces sp ON sp.id = c.space_id
		LEFT JOIN LATERAL (
			SELECT content, author_id FROM channel_messages
			WHERE reply_to_id = root.id
			ORDER BY created_at DESC, id DESC LIMIT 1
		) lr ON TRUE
		WHERE `+channelViewSQL("sp", "c", "$2")+`
		  AND ($3::text = '' OR c.id::text = $3::text)
		ORDER BY t.last_at DESC, root.id DESC
		LIMIT $4 OFFSET $5`, spaceID, userID, channelID, limit+1, offset)
	if err != nil {
		s.writeError(w, err)
		return
	}
	defer rows.Close()

	type threadRow struct {
		id, channelID, authorID uuid.UUID
		channelName, text       string
		createdAt, lastAt       time.Time
		replies, participants   int
		lastText                string
		lastAuthorID            *uuid.UUID
		hasAttachment           bool
	}
	var list []threadRow
	authorSet := make(map[uuid.UUID]struct{})
	for rows.Next() {
		var t threadRow
		if err := rows.Scan(&t.id, &t.channelID, &t.channelName, &t.authorID, &t.text, &t.createdAt,
			&t.replies, &t.participants, &t.lastAt, &t.lastText, &t.lastAuthorID, &t.hasAttachment); err != nil {
			s.writeError(w, err)
			return
		}
		list = append(list, t)
		authorSet[t.authorID] = struct{}{}
		if t.lastAuthorID != nil {
			authorSet[*t.lastAuthorID] = struct{}{}
		}
	}
	if err := rows.Err(); err != nil {
		s.writeError(w, err)
		return
	}
	rows.Close()

	hasMore := len(list) > limit
	if hasMore {
		list = list[:limit]
	}
	ids := make([]uuid.UUID, 0, len(authorSet))
	for id := range authorSet {
		ids = append(ids, id)
	}
	cards := s.userCards(r.Context(), ids)

	items := make([]map[string]any, 0, len(list))
	for _, t := range list {
		item := map[string]any{
			"id":            t.id,
			"messageId":     t.id,
			"channelId":     t.channelID,
			"channelName":   t.channelName,
			"text":          previewText(t.text, threadPreviewLen),
			"hasAttachment": t.hasAttachment,
			"createdAt":     t.createdAt,
			"author":        cards[t.authorID],
			"replies":       t.replies,
			"participants":  t.participants,
			"lastReplyAt":   t.lastAt,
			"lastReplyText": previewText(t.lastText, threadPreviewLen),
		}
		if t.lastAuthorID != nil {
			item["lastReplyAuthor"] = cards[*t.lastAuthorID]
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "hasMore": hasMore})
}
