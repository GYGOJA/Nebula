package httpapi

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (s *Server) channelMessageAction(w http.ResponseWriter, r *http.Request, userID, channelID, spaceID, messageID uuid.UUID, perms spacePerms) {
	switch r.Method {
	case http.MethodPatch:
		var input struct {
			Text    string `json:"text"`
			Content string `json:"content"`
		}
		if !decode(w, r, &input) {
			return
		}
		text := strings.TrimSpace(input.Text)
		if text == "" {
			text = strings.TrimSpace(input.Content)
		}
		if text == "" || runes(text) > maxChannelMessageLen {
			badRequest(w, "Текст сообщения должен содержать от 1 до 20000 символов")
			return
		}
		var editedAt time.Time
		err := s.db.QueryRow(r.Context(), `UPDATE channel_messages SET content=$4, edited_at=NOW() WHERE id=$1 AND channel_id=$2 AND author_id=$3 RETURNING edited_at`, messageID, channelID, userID, text).Scan(&editedAt)
		if err != nil {
			var exists bool
			if checkErr := s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM channel_messages WHERE id=$1 AND channel_id=$2)`, messageID, channelID).Scan(&exists); checkErr != nil {
				s.writeError(w, checkErr)
				return
			}
			if !exists {
				notFound(w, "Сообщение не найдено")
			} else {
				forbidden(w, "Редактировать можно только свои сообщения")
			}
			return
		}
		update := map[string]any{"channelId": channelID, "messageId": messageID, "text": text, "editedAt": editedAt}
		if audience, err := s.channelAudience(r.Context(), spaceID, channelID); err == nil {
			for _, member := range audience {
				s.hub.Publish(member, Event{Type: "channel_message_updated", Data: update})
			}
		}
		writeJSON(w, http.StatusOK, update)
	case http.MethodDelete:
		fileKeys := s.channelFileKeys(r.Context(), `m.id=$1 AND c.id=$2`, messageID, channelID)
		tag, err := s.db.Exec(r.Context(), `DELETE FROM channel_messages WHERE id=$1 AND channel_id=$2 AND (author_id=$3 OR $4)`, messageID, channelID, userID, perms.Has(permManageChannels))
		if err != nil {
			s.writeError(w, err)
			return
		}
		if tag.RowsAffected() == 0 {
			var exists bool
			if checkErr := s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM channel_messages WHERE id=$1 AND channel_id=$2)`, messageID, channelID).Scan(&exists); checkErr != nil {
				s.writeError(w, checkErr)
				return
			}
			if !exists {
				notFound(w, "Сообщение не найдено")
			} else {
				forbidden(w, "Удалять можно только свои сообщения")
			}
			return
		}
		removeChannelFiles(fileKeys)
		update := map[string]any{"channelId": channelID, "messageId": messageID}
		if audience, err := s.channelAudience(r.Context(), spaceID, channelID); err == nil {
			for _, member := range audience {
				s.hub.Publish(member, Event{Type: "channel_message_deleted", Data: update})
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
	}
}

func (s *Server) dmMessageAction(w http.ResponseWriter, r *http.Request, me, otherID, messageID uuid.UUID) {
	switch r.Method {
	case http.MethodPatch:
		var input struct {
			Text    string `json:"text"`
			Content string `json:"content"`
		}
		if !decode(w, r, &input) {
			return
		}
		text := strings.TrimSpace(input.Text)
		if text == "" {
			text = strings.TrimSpace(input.Content)
		}
		if text == "" || runes(text) > maxMessageLen {
			badRequest(w, "Текст сообщения должен содержать от 1 до 4000 символов")
			return
		}
		var editedAt time.Time
		err := s.db.QueryRow(r.Context(), `UPDATE direct_messages SET content=$4, edited_at=NOW() WHERE id=$1 AND sender_id=$2 AND recipient_id=$3 RETURNING edited_at`, messageID, me, otherID, text).Scan(&editedAt)
		if err != nil {
			var exists bool
			if checkErr := s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM direct_messages WHERE id=$1 AND ((sender_id=$2 AND recipient_id=$3) OR (sender_id=$3 AND recipient_id=$2)))`, messageID, me, otherID).Scan(&exists); checkErr != nil {
				s.writeError(w, checkErr)
				return
			}
			if !exists {
				notFound(w, "Сообщение не найдено")
			} else {
				forbidden(w, "Редактировать можно только свои сообщения")
			}
			return
		}
		// Each recipient identifies the conversation by the other participant's ID.
		response := map[string]any{"peerId": otherID, "messageId": messageID, "text": text, "editedAt": editedAt}
		for recipient, peer := range map[uuid.UUID]uuid.UUID{me: otherID, otherID: me} {
			update := map[string]any{"peerId": peer, "messageId": messageID, "text": text, "editedAt": editedAt}
			s.hub.Publish(recipient, Event{Type: "message_updated", Data: update})
		}
		writeJSON(w, http.StatusOK, response)
	case http.MethodDelete:
		fileRows, fileErr := s.db.Query(r.Context(), `SELECT a.storage_key FROM dm_attachments a JOIN direct_messages m ON m.id=a.message_id WHERE m.id=$1 AND m.sender_id=$2 AND m.recipient_id=$3`, messageID, me, otherID)
		if fileErr != nil {
			s.writeError(w, fileErr)
			return
		}
		var fileKeys []string
		for fileRows.Next() {
			var key string
			if err := fileRows.Scan(&key); err != nil {
				fileRows.Close()
				s.writeError(w, err)
				return
			}
			fileKeys = append(fileKeys, key)
		}
		if err := fileRows.Err(); err != nil {
			fileRows.Close()
			s.writeError(w, err)
			return
		}
		fileRows.Close()
		tag, err := s.db.Exec(r.Context(), `DELETE FROM direct_messages WHERE id=$1 AND sender_id=$2 AND recipient_id=$3`, messageID, me, otherID)
		if err != nil {
			s.writeError(w, err)
			return
		}
		if tag.RowsAffected() == 0 {
			var exists bool
			if checkErr := s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM direct_messages WHERE id=$1 AND ((sender_id=$2 AND recipient_id=$3) OR (sender_id=$3 AND recipient_id=$2)))`, messageID, me, otherID).Scan(&exists); checkErr != nil {
				s.writeError(w, checkErr)
				return
			}
			if !exists {
				notFound(w, "Сообщение не найдено")
			} else {
				forbidden(w, "Удалять можно только свои сообщения")
			}
			return
		}
		for _, key := range fileKeys {
			_ = os.Remove(filepath.Join(attachmentDir(), filepath.Base(key)))
		}
		for recipient, peer := range map[uuid.UUID]uuid.UUID{me: otherID, otherID: me} {
			update := map[string]any{"peerId": peer, "messageId": messageID}
			s.hub.Publish(recipient, Event{Type: "message_deleted", Data: update})
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
	}
}
