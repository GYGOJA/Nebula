package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/TheLonger011/Nebula/internal/auth"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestSanitizeFileName(t *testing.T) {
	cases := map[string]string{
		"../../etc/passwd":     "passwd",
		`C:\dir\report.pdf`:    "report.pdf",
		"  ..hidden. ":         "hidden",
		"":                     "file",
		"a<b>c?.txt":           "abc.txt",
		"отчёт за квартал.pdf": "отчёт за квартал.pdf",
	}
	for in, want := range cases {
		if got := sanitizeFileName(in); got != want {
			t.Errorf("sanitize(%q)=%q want %q", in, got, want)
		}
	}
	long := strings.Repeat("я", 300) + ".docx"
	if got := sanitizeFileName(long); len([]rune(got)) > 120 || !strings.HasSuffix(got, ".docx") {
		t.Errorf("long name not trimmed properly: %d", len([]rune(got)))
	}
}

func TestClassify(t *testing.T) {
	cases := []struct {
		sniffed, declared string
		voice             bool
		kind, mime        string
		ok                bool
	}{
		{"image/png", "image/png", false, "image", "image/png", true},
		{"image/jpeg", "application/x", false, "image", "image/jpeg", true},
		{"text/html; charset=utf-8", "image/png", false, "file", "application/octet-stream", true},
		{"text/xml; charset=utf-8", "image/svg+xml", false, "file", "application/octet-stream", true},
		{"video/mp4", "video/mp4", false, "video", "video/mp4", true},
		{"audio/mpeg", "audio/mpeg", false, "audio", "audio/mpeg", true},
		{"application/pdf", "application/pdf", false, "file", "application/octet-stream", true},
		{"video/webm", "audio/webm;codecs=opus", true, "voice", "audio/webm", true},
		{"application/octet-stream", "audio/mp4", true, "voice", "audio/mp4", true},
		{"text/plain; charset=utf-8", "audio/webm", true, "", "", false},
		{"video/webm", "video/webm", true, "", "", false},
	}
	for _, c := range cases {
		kind, m, ok := classify(c.sniffed, c.declared, c.voice)
		if kind != c.kind || m != c.mime || ok != c.ok {
			t.Errorf("classify(%q,%q,%v)=(%q,%q,%v) want (%q,%q,%v)", c.sniffed, c.declared, c.voice, kind, m, ok, c.kind, c.mime, c.ok)
		}
	}
}

func TestHubPublish(t *testing.T) {
	h := NewHub()
	a, b := uuid.New(), uuid.New()
	chA, unA := h.Subscribe(a)
	chA2, unA2 := h.Subscribe(a)
	chB, unB := h.Subscribe(b)
	defer unB()

	h.Publish(a, Event{Type: "message", Data: 1})
	for _, ch := range []<-chan Event{chA, chA2} {
		select {
		case ev := <-ch:
			if ev.Type != "message" {
				t.Fatal("wrong event")
			}
		case <-time.After(time.Second):
			t.Fatal("no event")
		}
	}
	select {
	case <-chB:
		t.Fatal("foreign user got event")
	default:
	}
	unA()
	if !h.Online(a) {
		t.Fatal("still one subscription")
	}
	unA2()
	if h.Online(a) {
		t.Fatal("should be offline")
	}
	_, un := h.Subscribe(b)
	defer un()
	for i := 0; i < 500; i++ {
		h.Publish(b, Event{Type: "x"})
	}
}

func TestDMAttachmentsIntegration(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL не задан")
	}
	t.Setenv("UPLOAD_DIR", t.TempDir())
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	mk := func(name string) uuid.UUID {
		var id uuid.UUID
		err := pool.QueryRow(ctx, `INSERT INTO users (username, display_name, email, password_hash, birth_date)
			VALUES ($1::text,$1::text,$1::text||'@t.io','x','2000-01-01') RETURNING id`, name+uuid.NewString()[:6]).Scan(&id)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, id) })
		return id
	}
	alice, bob, eve := mk("alice"), mk("bob"), mk("eve")

	tokens := auth.NewTokenManager("secret", time.Hour)
	srv := httptest.NewServer(New(nil, nil, tokens, pool).Handler())
	defer srv.Close()

	tok := func(id uuid.UUID) string { s, _ := tokens.GenerateAccess(id); return s }
	do := func(method, path, token string, body io.Reader, ct string) (*http.Response, []byte) {
		req, _ := http.NewRequest(method, srv.URL+path, body)
		if ct != "" {
			req.Header.Set("Content-Type", ct)
		}
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		return resp, b
	}

	sseReq, _ := http.NewRequest("GET", srv.URL+"/api/events", nil)
	sseReq.Header.Set("Authorization", "Bearer "+tok(bob))
	sseCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	sseResp, err := http.DefaultClient.Do(sseReq.WithContext(sseCtx))
	if err != nil {
		t.Fatal(err)
	}
	defer sseResp.Body.Close()
	if ct := sseResp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("content-type %q", ct)
	}
	lines := make(chan string, 64)
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := sseResp.Body.Read(buf)
			if n > 0 {
				lines <- string(buf[:n])
			}
			if err != nil {
				return
			}
		}
	}()
	waitFor := func(substr string) string {
		deadline := time.After(3 * time.Second)
		var acc string
		for {
			select {
			case s := <-lines:
				acc += s
				if strings.Contains(acc, substr) {
					return acc
				}
			case <-deadline:
				t.Fatalf("не дождались %q, получено: %q", substr, acc)
			}
		}
	}
	waitFor(": connected")

	png := []byte("\x89PNG\r\n\x1a\n" + strings.Repeat("\x00", 64))
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	mw.WriteField("text", "привет с файлами")
	part := func(name, fname, ctype string, data []byte) {
		h := textproto.MIMEHeader{}
		h.Set("Content-Disposition", `form-data; name="`+name+`"; filename="`+fname+`"`)
		h.Set("Content-Type", ctype)
		w, _ := mw.CreatePart(h)
		w.Write(data)
	}
	part("files", "pic.png", "image/png", png)
	part("files", "../doc.pdf", "application/pdf", []byte("%PDF-1.4 hello"))
	mw.Close()
	resp, b := do("POST", "/api/dm/"+bob.String()+"/messages", tok(alice), &body, mw.FormDataContentType())
	if resp.StatusCode != 201 {
		t.Fatalf("send: %d %s", resp.StatusCode, b)
	}
	var sent struct {
		ID          string           `json:"id"`
		Attachments []map[string]any `json:"attachments"`
	}
	json.Unmarshal(b, &sent)
	if len(sent.Attachments) != 2 || sent.Attachments[0]["kind"] != "image" || sent.Attachments[1]["kind"] != "file" || sent.Attachments[1]["name"] != "doc.pdf" {
		t.Fatalf("attachments: %s", b)
	}

	ev := waitFor("event: message")
	if !strings.Contains(ev, "привет с файлами") {
		t.Fatalf("event: %q", ev)
	}

	imgURL := sent.Attachments[0]["url"].(string)
	resp, b = do("GET", imgURL, tok(bob), nil, "")
	if resp.StatusCode != 200 || !bytes.Equal(b, png) || resp.Header.Get("Content-Type") != "image/png" {
		t.Fatalf("download bob: %d %v", resp.StatusCode, resp.Header)
	}
	pdfURL := sent.Attachments[1]["url"].(string)
	resp, _ = do("GET", pdfURL, tok(alice), nil, "")
	if !strings.HasPrefix(resp.Header.Get("Content-Disposition"), "attachment") {
		t.Fatalf("pdf must be attachment: %q", resp.Header.Get("Content-Disposition"))
	}
	if resp, _ = do("GET", imgURL, tok(eve), nil, ""); resp.StatusCode != 404 {
		t.Fatalf("eve got %d", resp.StatusCode)
	}
	if resp, _ = do("GET", imgURL, "", nil, ""); resp.StatusCode != 401 {
		t.Fatalf("anon got %d", resp.StatusCode)
	}
	req, _ := http.NewRequest("GET", srv.URL+imgURL, nil)
	req.Header.Set("Authorization", "Bearer "+tok(bob))
	req.Header.Set("Range", "bytes=0-3")
	rr, _ := http.DefaultClient.Do(req)
	rr.Body.Close()
	if rr.StatusCode != 206 {
		t.Fatalf("range: %d", rr.StatusCode)
	}

	body.Reset()
	mw = multipart.NewWriter(&body)
	mw.WriteField("voice", "1")
	mw.WriteField("duration", "4200")
	part("files", "blob", "audio/webm;codecs=opus", append([]byte("\x1a\x45\xdf\xa3"), make([]byte, 100)...))
	mw.Close()
	resp, b = do("POST", "/api/dm/"+bob.String()+"/messages", tok(alice), &body, mw.FormDataContentType())
	if resp.StatusCode != 201 || !strings.Contains(string(b), `"kind":"voice"`) || !strings.Contains(string(b), `"durationMs":4200`) {
		t.Fatalf("voice: %d %s", resp.StatusCode, b)
	}

	if resp, _ = do("POST", "/api/dm/"+bob.String()+"/messages", tok(alice), strings.NewReader(`{"text":"  "}`), "application/json"); resp.StatusCode != 400 {
		t.Fatalf("empty: %d", resp.StatusCode)
	}
	body.Reset()
	mw = multipart.NewWriter(&body)
	mw.WriteField("voice", "1")
	part("files", "x", "audio/webm", []byte("<html><script>alert(1)</script></html>"))
	mw.Close()
	if resp, _ = do("POST", "/api/dm/"+bob.String()+"/messages", tok(alice), &body, mw.FormDataContentType()); resp.StatusCode != 400 {
		t.Fatalf("fake voice: %d", resp.StatusCode)
	}

	resp, b = do("GET", "/api/dm/unread", tok(bob), nil, "")
	var un struct{ Total int }
	json.Unmarshal(b, &un)
	if un.Total != 2 {
		t.Fatalf("unread: %s", b)
	}
	resp, b = do("GET", "/api/dm", tok(bob), nil, "")
	if !strings.Contains(string(b), `"unread":2`) || !strings.Contains(string(b), `"attachmentKind":"voice"`) {
		t.Fatalf("conversations: %s", b)
	}

	aliceSSE, _ := http.NewRequest("GET", srv.URL+"/api/events", nil)
	aliceSSE.Header.Set("Authorization", "Bearer "+tok(alice))
	aResp, err := http.DefaultClient.Do(aliceSSE.WithContext(sseCtx))
	if err != nil {
		t.Fatal(err)
	}
	defer aResp.Body.Close()
	aliceBuf := make(chan string, 8)
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := aResp.Body.Read(buf)
			if n > 0 {
				aliceBuf <- string(buf[:n])
			}
			if err != nil {
				return
			}
		}
	}()
	<-aliceBuf
	if resp, b = do("POST", "/api/dm/"+alice.String()+"/read", tok(bob), nil, ""); resp.StatusCode != 200 || !strings.Contains(string(b), `"count":2`) {
		t.Fatalf("read: %d %s", resp.StatusCode, b)
	}
	select {
	case s := <-aliceBuf:
		if !strings.Contains(s, "event: read") || !strings.Contains(s, sent.ID) {
			t.Fatalf("alice event: %q", s)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("alice no read event")
	}
	_, b = do("GET", "/api/dm/"+bob.String()+"/messages", tok(alice), nil, "")
	if !strings.Contains(string(b), `"status":"read"`) {
		t.Fatalf("status: %s", b)
	}
	_, b = do("GET", "/api/dm/unread", tok(bob), nil, "")
	if !strings.Contains(string(b), `"total":0`) {
		t.Fatalf("unread after read: %s", b)
	}
}
