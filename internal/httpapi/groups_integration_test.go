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

	"github.com/GYGOJA/Nebula/internal/auth"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestGroupsVoiceAndCallsIntegration(t *testing.T) {
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
	owner, member, outsider := mk("owner"), mk("member"), mk("outsider")

	tokens := auth.NewTokenManager("secret", time.Hour)
	srv := httptest.NewServer(New(nil, nil, tokens, pool).Handler())
	defer srv.Close()

	tok := func(id uuid.UUID) string { s, _ := tokens.GenerateAccess(id); return s }
	do := func(method, path string, user uuid.UUID, body io.Reader, ct string) (int, []byte) {
		req, _ := http.NewRequest(method, srv.URL+path, body)
		if ct != "" {
			req.Header.Set("Content-Type", ct)
		}
		req.Header.Set("Authorization", "Bearer "+tok(user))
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, b
	}
	postJSON := func(path string, user uuid.UUID, payload any) (int, []byte) {
		b, _ := json.Marshal(payload)
		return do("POST", path, user, bytes.NewReader(b), "application/json")
	}
	decodeMap := func(b []byte) map[string]any {
		var m map[string]any
		if err := json.Unmarshal(b, &m); err != nil {
			t.Fatalf("bad json %s: %v", b, err)
		}
		return m
	}

	code, b := postJSON("/api/spaces", owner, map[string]string{"name": "Тест"})
	if code != http.StatusCreated && code != http.StatusOK {
		t.Fatalf("create space: %d %s", code, b)
	}
	spaceID := decodeMap(b)["id"].(string)

	code, b = postJSON("/api/spaces/"+spaceID+"/channels", owner, map[string]string{"name": "общий", "type": "text"})
	if code >= 300 {
		t.Fatalf("create text channel: %d %s", code, b)
	}
	channelID := decodeMap(b)["id"].(string)

	code, b = postJSON("/api/spaces/"+spaceID+"/voice", owner, map[string]string{"name": "голос", "type": "voice"})
	if code >= 300 {
		t.Fatalf("create voice channel: %d %s", code, b)
	}
	voiceID := decodeMap(b)["id"].(string)

	if _, err := pool.Exec(ctx, `INSERT INTO space_members (space_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, spaceID, member); err != nil {
		t.Fatal(err)
	}

	code, _ = postJSON("/api/channels/"+channelID+"/messages", outsider, map[string]string{"content": "чужак"})
	if code != http.StatusForbidden {
		t.Fatalf("outsider send must be 403, got %d", code)
	}
	code, _ = do("GET", "/api/channels/"+channelID+"/messages", outsider, nil, "")
	if code != http.StatusForbidden {
		t.Fatalf("outsider read must be 403, got %d", code)
	}

	code, b = postJSON("/api/channels/"+channelID+"/messages", member, map[string]string{"content": "привет группа"})
	if code != http.StatusCreated {
		t.Fatalf("text message: %d %s", code, b)
	}
	msg := decodeMap(b)
	author := msg["author"].(map[string]any)
	if author["username"] == nil || msg["authorId"] != "me" {
		t.Fatalf("author payload wrong: %v", msg)
	}

	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	mw.WriteField("text", "файлы")
	png := []byte("\x89PNG\r\n\x1a\n" + strings.Repeat("\x00", 64))
	h := textproto.MIMEHeader{}
	h.Set("Content-Disposition", `form-data; name="files"; filename="pic.png"`)
	h.Set("Content-Type", "image/png")
	pw, _ := mw.CreatePart(h)
	pw.Write(png)
	h2 := textproto.MIMEHeader{}
	h2.Set("Content-Disposition", `form-data; name="files"; filename="doc.pdf"`)
	h2.Set("Content-Type", "application/pdf")
	pw2, _ := mw.CreatePart(h2)
	pw2.Write([]byte("%PDF-1.4 test"))
	mw.Close()
	code, b = do("POST", "/api/channels/"+channelID+"/messages", member, &body, mw.FormDataContentType())
	if code != http.StatusCreated {
		t.Fatalf("files message: %d %s", code, b)
	}
	fm := decodeMap(b)
	atts := fm["attachments"].([]any)
	if len(atts) != 2 {
		t.Fatalf("want 2 attachments, got %v", atts)
	}
	first := atts[0].(map[string]any)
	url := first["url"].(string)
	if !strings.HasPrefix(url, "/api/channels/attachments/") || first["kind"] != "image" {
		t.Fatalf("bad attachment: %v", first)
	}

	code, got := do("GET", url, owner, nil, "")
	if code != http.StatusOK || !bytes.Equal(got, png) {
		t.Fatalf("member download: %d", code)
	}
	code, _ = do("GET", url, outsider, nil, "")
	if code != http.StatusNotFound {
		t.Fatalf("outsider download must be 404, got %d", code)
	}

	var vbody bytes.Buffer
	vw := multipart.NewWriter(&vbody)
	vw.WriteField("voice", "1")
	vw.WriteField("duration", "2300")
	vh := textproto.MIMEHeader{}
	vh.Set("Content-Disposition", `form-data; name="files"; filename="voice.webm"`)
	vh.Set("Content-Type", "audio/webm;codecs=opus")
	vp, _ := vw.CreatePart(vh)
	vp.Write(append([]byte("\x1a\x45\xdf\xa3"), bytes.Repeat([]byte{0}, 64)...))
	vw.Close()
	code, b = do("POST", "/api/channels/"+channelID+"/messages", owner, &vbody, vw.FormDataContentType())
	if code != http.StatusCreated {
		t.Fatalf("voice message: %d %s", code, b)
	}
	if va := decodeMap(b)["attachments"].([]any); len(va) != 1 || va[0].(map[string]any)["kind"] != "voice" {
		t.Fatalf("voice attachment wrong: %s", b)
	}

	code, b = do("GET", "/api/channels/"+channelID+"/messages", owner, nil, "")
	var list []map[string]any
	json.Unmarshal(b, &list)
	if code != 200 || len(list) != 3 {
		t.Fatalf("history: %d %d %s", code, len(list), b)
	}
	if list[0]["authorId"] == "me" || list[2]["authorId"] != "me" {
		t.Fatalf("authorId perspective wrong: %v %v", list[0]["authorId"], list[2]["authorId"])
	}

	code, b = do("GET", "/api/spaces/"+spaceID+"/members", owner, nil, "")
	var members []map[string]any
	json.Unmarshal(b, &members)
	if code != 200 || len(members) != 2 {
		t.Fatalf("members: %d %s", code, b)
	}
	code, _ = do("GET", "/api/spaces/"+spaceID+"/members", outsider, nil, "")
	if code != http.StatusForbidden {
		t.Fatalf("outsider members must be 403, got %d", code)
	}

	code, _ = postJSON("/api/voice/"+voiceID+"/join", outsider, map[string]any{})
	if code != http.StatusForbidden {
		t.Fatalf("outsider join must be 403, got %d", code)
	}
	code, b = postJSON("/api/voice/"+voiceID+"/join", owner, map[string]any{})
	if code != 200 {
		t.Fatalf("owner join: %d %s", code, b)
	}
	code, b = postJSON("/api/voice/"+voiceID+"/join", member, map[string]any{})
	jr := decodeMap(b)
	if code != 200 || len(jr["peers"].([]any)) != 1 || len(jr["iceServers"].([]any)) == 0 {
		t.Fatalf("member join: %d %s", code, b)
	}
	code, _ = postJSON("/api/voice/"+voiceID+"/state", member, map[string]any{"muted": true, "sharing": true})
	if code != 200 {
		t.Fatalf("state: %d", code)
	}
	code, b = do("GET", "/api/voice", owner, nil, "")
	var rooms []map[string]any
	json.Unmarshal(b, &rooms)
	if code != 200 || len(rooms) != 1 {
		t.Fatalf("rooms: %d %s", code, b)
	}
	parts := rooms[0]["participants"].([]any)
	if len(parts) != 2 {
		t.Fatalf("participants: %s", b)
	}
	sharing := false
	for _, p := range parts {
		pm := p.(map[string]any)
		if pm["id"] == member.String() && pm["sharing"] == true && pm["muted"] == true {
			sharing = true
		}
	}
	if !sharing {
		t.Fatalf("state flags lost: %s", b)
	}
	code, _ = postJSON("/api/voice/"+voiceID+"/signal", member, map[string]any{"to": owner.String(), "type": "offer", "data": map[string]string{"type": "offer", "sdp": "v=0"}})
	if code != 200 {
		t.Fatalf("signal: %d", code)
	}
	code, _ = postJSON("/api/voice/"+voiceID+"/signal", member, map[string]any{"to": outsider.String(), "type": "offer", "data": map[string]string{}})
	if code != http.StatusConflict {
		t.Fatalf("signal to non-participant must be 409, got %d", code)
	}
	postJSON("/api/voice/"+voiceID+"/leave", member, map[string]any{})
	postJSON("/api/voice/"+voiceID+"/leave", owner, map[string]any{})
	code, b = do("GET", "/api/voice/"+voiceID, owner, nil, "")
	if rs := decodeMap(b); code != 200 || len(rs["participants"].([]any)) != 0 {
		t.Fatalf("room must be empty: %s", b)
	}

	code, b = postJSON("/api/calls", owner, map[string]any{"userId": member.String(), "video": true})
	if code != http.StatusCreated {
		t.Fatalf("start call: %d %s", code, b)
	}
	callID := decodeMap(b)["id"].(string)
	code, _ = postJSON("/api/calls", outsider, map[string]any{"userId": member.String()})
	if code != http.StatusConflict {
		t.Fatalf("busy callee must be 409, got %d", code)
	}
	code, b = do("GET", "/api/calls/pending", member, nil, "")
	pend := decodeMap(b)
	if code != 200 || len(pend["incoming"].([]any)) != 1 {
		t.Fatalf("pending: %d %s", code, b)
	}
	code, _ = postJSON("/api/voice/"+callID+"/join", member, map[string]any{})
	if code != http.StatusConflict {
		t.Fatalf("callee join before accept must be 409, got %d", code)
	}
	code, _ = postJSON("/api/voice/"+callID+"/join", owner, map[string]any{})
	if code != 200 {
		t.Fatalf("caller join: %d", code)
	}
	code, _ = postJSON("/api/calls/"+callID+"/accept", outsider, nil)
	if code != http.StatusNotFound {
		t.Fatalf("foreign accept must be 404, got %d", code)
	}
	code, b = postJSON("/api/calls/"+callID+"/accept", member, nil)
	if code != 200 {
		t.Fatalf("accept: %d %s", code, b)
	}
	code, b = postJSON("/api/voice/"+callID+"/join", member, map[string]any{})
	if code != 200 || len(decodeMap(b)["peers"].([]any)) != 1 {
		t.Fatalf("callee join after accept: %d %s", code, b)
	}
	code, _ = postJSON("/api/calls/"+callID+"/end", member, nil)
	if code != 200 {
		t.Fatalf("end: %d", code)
	}
	code, _ = postJSON("/api/calls/"+callID+"/end", member, nil)
	if code != http.StatusNotFound {
		t.Fatalf("second end must be 404, got %d", code)
	}

	code, b = postJSON("/api/calls", owner, map[string]any{"userId": member.String()})
	callID = decodeMap(b)["id"].(string)
	code, _ = postJSON("/api/calls/"+callID+"/decline", member, nil)
	if code != 200 {
		t.Fatalf("decline: %d", code)
	}
	code, b = postJSON("/api/calls", owner, map[string]any{"userId": member.String()})
	if code != http.StatusCreated {
		t.Fatalf("restart call after decline: %d %s", code, b)
	}
	callID = decodeMap(b)["id"].(string)
	code, _ = postJSON("/api/calls/"+callID+"/cancel", owner, nil)
	if code != 200 {
		t.Fatalf("cancel: %d", code)
	}
}
