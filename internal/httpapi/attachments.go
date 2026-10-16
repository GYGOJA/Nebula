package httpapi

import (
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

const (
	maxAttachmentBytes   = 25 << 20
	maxImageBytes        = 10 << 20
	maxAttachmentsPerMsg = 10
	maxUploadRequest     = 100 << 20
	maxVoiceMs           = 15 * 60 * 1000
)

type Attachment struct {
	ID         uuid.UUID
	MessageID  uuid.UUID
	Kind       string
	FileName   string
	Mime       string
	Size       int64
	DurationMs *int
	StorageKey string
}

func (a Attachment) dto() map[string]any {
	return a.dtoAt("/api/dm/attachments/")
}

func (a Attachment) dtoAt(base string) map[string]any {
	d := map[string]any{
		"id": a.ID, "kind": a.Kind, "name": a.FileName,
		"mime": a.Mime, "size": a.Size,
		"url": base + a.ID.String(),
	}
	if a.DurationMs != nil {
		d["durationMs"] = *a.DurationMs
	}
	return d
}

func attachmentDir() string {
	dir := os.Getenv("UPLOAD_DIR")
	if dir == "" {
		dir = "uploads"
	}
	return filepath.Join(dir, "dm")
}

func sanitizeFileName(name string) string {
	name = strings.ReplaceAll(name, "\\", "/")
	if i := strings.LastIndex(name, "/"); i >= 0 {
		name = name[i+1:]
	}
	name = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f || r == '"' || r == '<' || r == '>' || r == ':' || r == '|' || r == '?' || r == '*' {
			return -1
		}
		return r
	}, name)
	name = strings.Trim(strings.TrimSpace(name), ".")
	if name == "" {
		return "file"
	}
	if utf8.RuneCountInString(name) > 120 {
		ext := filepath.Ext(name)
		if utf8.RuneCountInString(ext) > 16 {
			ext = ""
		}
		r := []rune(strings.TrimSuffix(name, ext))
		name = string(r[:120-utf8.RuneCountInString(ext)]) + ext
	}
	return name
}

func baseMime(v string) string {
	m, _, err := mime.ParseMediaType(v)
	if err != nil {
		return strings.ToLower(strings.TrimSpace(strings.SplitN(v, ";", 2)[0]))
	}
	return m
}

func classify(sniffed, declared string, voice bool) (kind, mimeType string, ok bool) {
	sniffed = baseMime(sniffed)
	declared = baseMime(declared)

	if voice {

		okSniff := strings.HasPrefix(sniffed, "audio/") || sniffed == "video/webm" ||
			sniffed == "video/mp4" || sniffed == "application/ogg" || sniffed == "application/octet-stream"
		if !okSniff || !strings.HasPrefix(declared, "audio/") {
			return "", "", false
		}
		return "voice", declared, true
	}

	switch {
	case sniffed == "image/png" || sniffed == "image/jpeg" || sniffed == "image/gif" || sniffed == "image/webp":
		return "image", sniffed, true
	case sniffed == "video/mp4" || sniffed == "video/webm":
		return "video", sniffed, true
	case strings.HasPrefix(sniffed, "audio/") || sniffed == "application/ogg":
		if sniffed == "application/ogg" {
			sniffed = "audio/ogg"
		}
		return "audio", sniffed, true
	}

	return "file", "application/octet-stream", true
}

type savedFile struct {
	Attachment
	path string
}

func removeSaved(files []savedFile) {
	for _, f := range files {
		_ = os.Remove(f.path)
	}
}

type uploadError struct{ msg string }

func (e *uploadError) Error() string { return e.msg }

func saveUpload(h *multipart.FileHeader, voice bool, durationMs *int) (*savedFile, error) {
	return saveUploadIn(attachmentDir(), h, voice, durationMs)
}

func channelAttachmentDir() string {
	dir := os.Getenv("UPLOAD_DIR")
	if dir == "" {
		dir = "uploads"
	}
	return filepath.Join(dir, "channels")
}

func saveUploadIn(dir string, h *multipart.FileHeader, voice bool, durationMs *int) (*savedFile, error) {
	if h.Size > maxAttachmentBytes {
		return nil, &uploadError{fmt.Sprintf("Файл «%s» больше 25 МБ", sanitizeFileName(h.Filename))}
	}
	src, err := h.Open()
	if err != nil {
		return nil, &uploadError{"Не удалось прочитать файл"}
	}
	defer src.Close()

	head := make([]byte, 512)
	n, _ := io.ReadFull(src, head)
	head = head[:n]
	kind, mimeType, ok := classify(http.DetectContentType(head), h.Header.Get("Content-Type"), voice)
	if !ok {
		return nil, &uploadError{"Неподдерживаемый формат файла"}
	}
	if strings.HasPrefix(mimeType, "image/") && h.Size > maxImageBytes {
		return nil, &uploadError{fmt.Sprintf("Изображение «%s» больше 10 МБ", sanitizeFileName(h.Filename))}
	}
	if _, err := src.Seek(0, io.SeekStart); err != nil {
		return nil, &uploadError{"Не удалось прочитать файл"}
	}

	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, err
	}
	id := uuid.New()
	key := id.String()
	path := filepath.Join(dir, key)
	dst, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
	if err != nil {
		return nil, err
	}
	written, err := io.Copy(dst, io.LimitReader(src, maxAttachmentBytes+1))
	cerr := dst.Close()
	if err == nil {
		err = cerr
	}
	if err == nil && written > maxAttachmentBytes {
		err = &uploadError{fmt.Sprintf("Файл «%s» больше 25 МБ", sanitizeFileName(h.Filename))}
	}
	if err == nil && written == 0 {
		err = &uploadError{"Файл пустой"}
	}
	if err != nil {
		_ = os.Remove(path)
		return nil, err
	}

	name := sanitizeFileName(h.Filename)
	if voice {
		name = "voice-" + time.Now().Format("20060102-150405") + extForMime(mimeType)
	}
	return &savedFile{
		Attachment: Attachment{ID: id, Kind: kind, FileName: name, Mime: mimeType, Size: written, DurationMs: durationMs, StorageKey: key},
		path:       path,
	}, nil
}

func extForMime(m string) string {
	switch m {
	case "audio/webm":
		return ".webm"
	case "audio/ogg":
		return ".ogg"
	case "audio/mp4", "audio/aac", "audio/x-m4a":
		return ".m4a"
	case "audio/mpeg":
		return ".mp3"
	case "audio/wav", "audio/x-wav":
		return ".wav"
	}
	return ".audio"
}

func parseDuration(v string) *int {
	n, err := strconv.Atoi(strings.TrimSpace(v))
	if err != nil || n < 0 {
		return nil
	}
	if n > maxVoiceMs {
		n = maxVoiceMs
	}
	return &n
}

func (s *Server) attachmentFile(w http.ResponseWriter, r *http.Request, me uuid.UUID, idStr string) {
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
	err = s.db.QueryRow(r.Context(), `
		SELECT a.kind, a.file_name, a.mime, a.size_bytes, a.storage_key
		FROM dm_attachments a JOIN direct_messages m ON m.id = a.message_id
		WHERE a.id = $1 AND (m.sender_id = $2 OR m.recipient_id = $2)`, id, me).
		Scan(&a.Kind, &a.FileName, &a.Mime, &a.Size, &a.StorageKey)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	serveStoredFile(w, r, a, attachmentDir())
}

func serveStoredFile(w http.ResponseWriter, r *http.Request, a Attachment, dir string) {
	f, err := os.Open(filepath.Join(dir, filepath.Base(a.StorageKey)))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()

	h := w.Header()
	h.Set("Content-Type", a.Mime)
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Cache-Control", "private, max-age=3600")
	h.Set("Content-Security-Policy", "default-src 'none'; sandbox")

	disposition := "inline"
	if a.Kind == "file" || r.URL.Query().Get("download") == "1" {
		disposition = "attachment"
	}
	h.Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": a.FileName}))

	http.ServeContent(w, r, "", time.Time{}, f)
}
