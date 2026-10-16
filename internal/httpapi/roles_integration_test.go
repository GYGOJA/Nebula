package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/GYGOJA/Nebula/internal/auth"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestRolesAndSectionAccessIntegration(t *testing.T) {
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
	owner, plain, mod := mk("owner"), mk("plain"), mk("mod")

	tokens := auth.NewTokenManager("secret", time.Hour)
	srv := httptest.NewServer(New(nil, nil, tokens, pool).Handler())
	defer srv.Close()

	call := func(method, path string, user uuid.UUID, payload any) (int, map[string]any, []byte) {
		var body io.Reader
		if payload != nil {
			b, _ := json.Marshal(payload)
			body = bytes.NewReader(b)
		}
		req, _ := http.NewRequest(method, srv.URL+path, body)
		req.Header.Set("Content-Type", "application/json")
		tok, _ := tokens.GenerateAccess(user)
		req.Header.Set("Authorization", "Bearer "+tok)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		raw, _ := io.ReadAll(resp.Body)
		var m map[string]any
		_ = json.Unmarshal(raw, &m)
		return resp.StatusCode, m, raw
	}
	expect := func(got, want int, what string, raw []byte) {
		t.Helper()
		if got != want {
			t.Fatalf("%s: got %d, want %d (%s)", what, got, want, raw)
		}
	}

	code, m, raw := call("POST", "/api/spaces", owner, map[string]string{"name": "Роли"})
	expect(code, http.StatusCreated, "create space", raw)
	spaceID := m["id"].(string)
	var defaults int
	pool.QueryRow(ctx, `SELECT COUNT(*) FROM space_roles WHERE space_id=$1 AND is_default`, spaceID).Scan(&defaults)
	if defaults != 1 {
		t.Fatalf("new space must get exactly one @everyone role, got %d", defaults)
	}

	code, m, raw = call("POST", "/api/spaces/"+spaceID+"/channels", owner, map[string]string{"name": "общий", "type": "text"})
	expect(code, http.StatusCreated, "create section", raw)
	openID := m["id"].(string)
	code, m, raw = call("POST", "/api/spaces/"+spaceID+"/channels", owner, map[string]string{"name": "секретный", "type": "text"})
	expect(code, http.StatusCreated, "create secret section", raw)
	secretID := m["id"].(string)

	// Invite preview and join: a repeated accept must not burn another use.
	code, m, raw = call("POST", "/api/invites", owner, map[string]string{"spaceId": spaceID})
	expect(code, http.StatusCreated, "create invite", raw)
	invite := m["code"].(string)
	code, m, raw = call("GET", "/api/invites/"+invite, plain, nil)
	expect(code, http.StatusOK, "invite preview", raw)
	if m["isMember"] != false {
		t.Fatalf("preview must not join: %s", raw)
	}
	for i := 0; i < 2; i++ {
		code, _, raw = call("POST", "/api/invites/accept", plain, map[string]string{"code": invite})
		expect(code, http.StatusOK, "accept invite", raw)
	}
	code, _, raw = call("POST", "/api/invites/accept", mod, map[string]string{"code": invite})
	expect(code, http.StatusOK, "mod joins", raw)
	var uses int
	pool.QueryRow(ctx, `SELECT uses FROM space_invites WHERE code=$1`, invite).Scan(&uses)
	if uses != 2 {
		t.Fatalf("invite uses = %d, want 2 (re-accept must not count)", uses)
	}
	code, _, raw = call("GET", "/api/invites/nope-nope-nope", plain, nil)
	expect(code, http.StatusNotFound, "unknown invite", raw)

	// Plain members cannot manage anything.
	code, _, raw = call("PATCH", "/api/spaces/"+spaceID, plain, map[string]string{"name": "x"})
	expect(code, http.StatusForbidden, "member renames space", raw)
	code, _, raw = call("GET", "/api/spaces/"+spaceID+"/settings", plain, nil)
	expect(code, http.StatusForbidden, "member opens settings", raw)
	code, _, raw = call("PATCH", "/api/spaces/"+spaceID, owner, map[string]string{"name": "Новое имя", "description": "О нас"})
	expect(code, http.StatusOK, "owner renames space", raw)

	// Custom role that may manage sections but is not an administrator.
	code, m, raw = call("POST", "/api/spaces/"+spaceID+"/roles", owner, map[string]any{"name": "Модератор", "color": "#ffb020", "permissions": permManageChannels | permManageRoles})
	expect(code, http.StatusCreated, "create role", raw)
	roleID := m["id"].(string)
	code, _, raw = call("PATCH", "/api/spaces/"+spaceID+"/members/"+mod.String(), owner, map[string]any{"roleIds": []string{roleID}})
	expect(code, http.StatusOK, "assign role", raw)

	// A role manager cannot hand out administrator or rights they lack.
	code, _, raw = call("POST", "/api/spaces/"+spaceID+"/roles", mod, map[string]any{"name": "Босс", "permissions": permAdministrator})
	expect(code, http.StatusForbidden, "escalate to admin", raw)
	code, m, raw = call("POST", "/api/spaces/"+spaceID+"/roles", mod, map[string]any{"name": "Помощник", "permissions": permSendMessages})
	expect(code, http.StatusCreated, "grant own right", raw)
	helperID := m["id"].(string)

	// Hierarchy: a role manager cannot touch their own rank, themselves, the owner,
	// or hand their own role to others; roles below theirs are fine.
	code, _, raw = call("PATCH", "/api/spaces/"+spaceID+"/members/"+plain.String(), mod, map[string]any{"roleIds": []string{roleID}})
	expect(code, http.StatusForbidden, "assign own-rank role", raw)
	code, _, raw = call("PATCH", "/api/spaces/"+spaceID+"/roles/"+roleID, mod, map[string]any{"color": "#000000"})
	expect(code, http.StatusForbidden, "edit own-rank role", raw)
	code, _, raw = call("DELETE", "/api/spaces/"+spaceID+"/roles/"+roleID, mod, nil)
	expect(code, http.StatusForbidden, "delete own-rank role", raw)
	code, _, raw = call("PATCH", "/api/spaces/"+spaceID+"/members/"+mod.String(), mod, map[string]any{"roleIds": []string{roleID, helperID}})
	expect(code, http.StatusForbidden, "edit own roles", raw)
	code, _, raw = call("PATCH", "/api/spaces/"+spaceID+"/members/"+owner.String(), mod, map[string]any{"roleIds": []string{helperID}})
	expect(code, http.StatusForbidden, "edit owner roles", raw)
	code, _, raw = call("PATCH", "/api/spaces/"+spaceID+"/members/"+plain.String(), mod, map[string]any{"roleIds": []string{helperID}})
	expect(code, http.StatusOK, "assign lower role", raw)
	code, _, raw = call("PATCH", "/api/spaces/"+spaceID+"/members/"+plain.String(), plain, map[string]any{"roleIds": []string{helperID}})
	expect(code, http.StatusForbidden, "member without manage-roles", raw)
	_, m, raw = call("GET", "/api/spaces/"+spaceID+"/settings", mod, nil)
	for _, r := range m["roles"].([]any) {
		role := r.(map[string]any)
		if role["id"] == roleID && role["manageable"] == true {
			t.Fatalf("own-rank role must not be manageable: %s", raw)
		}
		if role["id"] == helperID && role["manageable"] != true {
			t.Fatalf("lower role must be manageable: %s", raw)
		}
	}

	// Restrict the secret section to the moderator role.
	code, _, raw = call("PATCH", "/api/spaces/"+spaceID+"/channels/"+secretID, mod, map[string]any{
		"restricted": true,
		"access":     []map[string]any{{"roleId": roleID, "canView": true, "canWrite": true}},
	})
	expect(code, http.StatusOK, "restrict section", raw)
	code, _, raw = call("PATCH", "/api/spaces/"+spaceID+"/channels/"+secretID, plain, map[string]any{"restricted": false})
	expect(code, http.StatusForbidden, "member edits section", raw)

	code, _, raw = call("GET", "/api/channels/"+secretID+"/messages", plain, nil)
	expect(code, http.StatusForbidden, "plain reads secret", raw)
	code, _, raw = call("POST", "/api/channels/"+secretID+"/messages", plain, map[string]string{"content": "hi"})
	expect(code, http.StatusForbidden, "plain writes secret", raw)
	code, _, raw = call("POST", "/api/channels/"+secretID+"/messages", mod, map[string]string{"content": "hi"})
	expect(code, http.StatusCreated, "mod writes secret", raw)
	code, _, raw = call("POST", "/api/channels/"+secretID+"/messages", owner, map[string]string{"content": "owner"})
	expect(code, http.StatusCreated, "owner writes secret", raw)
	code, _, raw = call("POST", "/api/channels/"+openID+"/messages", plain, map[string]string{"content": "hi"})
	expect(code, http.StatusCreated, "plain writes open", raw)

	_, m, raw = call("GET", "/api/spaces/"+spaceID, plain, nil)
	if n := len(m["channels"].([]any)); n != 1 {
		t.Fatalf("plain member must see 1 section, got %d (%s)", n, raw)
	}
	_, m, raw = call("GET", "/api/spaces/"+spaceID, mod, nil)
	if n := len(m["channels"].([]any)); n != 2 {
		t.Fatalf("moderator must see 2 sections, got %d (%s)", n, raw)
	}
	listed := func(user uuid.UUID) int {
		req, _ := http.NewRequest("GET", srv.URL+"/api/channels", nil)
		tok, _ := tokens.GenerateAccess(user)
		req.Header.Set("Authorization", "Bearer "+tok)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		var list []map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&list)
		return len(list)
	}
	if listed(plain) != 1 || listed(mod) != 2 {
		t.Fatalf("/api/channels filtering wrong: plain=%d mod=%d", listed(plain), listed(mod))
	}

	// The default role can be changed to remove writing for everyone.
	_, m, raw = call("GET", "/api/spaces/"+spaceID+"/settings", owner, nil)
	var everyoneID string
	for _, r := range m["roles"].([]any) {
		if r.(map[string]any)["isDefault"] == true {
			everyoneID = r.(map[string]any)["id"].(string)
		}
	}
	code, _, raw = call("PATCH", "/api/spaces/"+spaceID+"/members/"+plain.String(), owner, map[string]any{"roleIds": []string{}})
	expect(code, http.StatusOK, "owner clears roles", raw)
	code, _, raw = call("PATCH", "/api/spaces/"+spaceID+"/roles/"+everyoneID, owner, map[string]any{"permissions": permCreateInvite})
	expect(code, http.StatusOK, "mute everyone", raw)
	code, _, raw = call("POST", "/api/channels/"+openID+"/messages", plain, map[string]string{"content": "hi"})
	expect(code, http.StatusForbidden, "plain muted", raw)
	code, _, raw = call("DELETE", "/api/spaces/"+spaceID+"/roles/"+everyoneID, owner, nil)
	expect(code, http.StatusBadRequest, "delete base role", raw)

	// Deleting the role removes its access; owner keeps access.
	code, _, raw = call("DELETE", "/api/spaces/"+spaceID+"/roles/"+roleID, owner, nil)
	expect(code, http.StatusOK, "delete role", raw)
	code, _, raw = call("GET", "/api/channels/"+secretID+"/messages", mod, nil)
	expect(code, http.StatusForbidden, "mod lost access", raw)
	code, _, raw = call("GET", "/api/channels/"+secretID+"/messages", owner, nil)
	expect(code, http.StatusOK, "owner keeps access", raw)

	code, _, raw = call("DELETE", "/api/spaces/"+spaceID+"/channels/"+secretID, owner, nil)
	expect(code, http.StatusOK, "delete section", raw)
	code, _, raw = call("DELETE", "/api/spaces/"+spaceID, plain, nil)
	expect(code, http.StatusForbidden, "member deletes space", raw)
	code, _, raw = call("DELETE", "/api/spaces/"+spaceID, owner, nil)
	expect(code, http.StatusOK, "owner deletes space", raw)
}
