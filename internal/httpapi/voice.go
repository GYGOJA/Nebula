package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	reapInterval = 10 * time.Second
	reapStrikes  = 3
)

type voiceParticipant struct {
	UserID   uuid.UUID
	Muted    bool
	Deafened bool
	Sharing  bool
	Video    bool
	Joined   time.Time
}

type voiceRoom struct {
	Members map[uuid.UUID]*voiceParticipant
}

type VoiceManager struct {
	mu      sync.Mutex
	rooms   map[uuid.UUID]*voiceRoom
	byUser  map[uuid.UUID]uuid.UUID
	calls   map[uuid.UUID]*call
	strikes map[uuid.UUID]int
	once    sync.Once
}

func NewVoiceManager() *VoiceManager {
	return &VoiceManager{
		rooms:   make(map[uuid.UUID]*voiceRoom),
		byUser:  make(map[uuid.UUID]uuid.UUID),
		calls:   make(map[uuid.UUID]*call),
		strikes: make(map[uuid.UUID]int),
	}
}

func (m *VoiceManager) join(roomID, user uuid.UUID, muted, video bool) (previous uuid.UUID, created bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if prev, ok := m.byUser[user]; ok && prev != roomID {
		previous = prev
		m.removeLocked(prev, user)
	}
	room := m.rooms[roomID]
	if room == nil {
		room = &voiceRoom{Members: make(map[uuid.UUID]*voiceParticipant)}
		m.rooms[roomID] = room
	}
	if existing, ok := room.Members[user]; ok {
		existing.Muted = muted
		existing.Video = video
		m.byUser[user] = roomID
		return previous, false
	}
	room.Members[user] = &voiceParticipant{UserID: user, Muted: muted, Video: video, Joined: time.Now()}
	m.byUser[user] = roomID
	return previous, true
}

func (m *VoiceManager) removeLocked(roomID, user uuid.UUID) bool {
	room := m.rooms[roomID]
	if room == nil {
		return false
	}
	if _, ok := room.Members[user]; !ok {
		return false
	}
	delete(room.Members, user)
	if m.byUser[user] == roomID {
		delete(m.byUser, user)
	}
	if len(room.Members) == 0 {
		delete(m.rooms, roomID)
	}
	return true
}

func (m *VoiceManager) leave(roomID, user uuid.UUID) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.removeLocked(roomID, user)
}

func (m *VoiceManager) leaveAny(user uuid.UUID) (uuid.UUID, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	roomID, ok := m.byUser[user]
	if !ok {
		return uuid.Nil, false
	}
	m.removeLocked(roomID, user)
	return roomID, true
}

func (m *VoiceManager) update(roomID, user uuid.UUID, apply func(p *voiceParticipant)) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	room := m.rooms[roomID]
	if room == nil {
		return false
	}
	p := room.Members[user]
	if p == nil {
		return false
	}
	apply(p)
	return true
}

func (m *VoiceManager) inRoom(roomID, user uuid.UUID) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	room := m.rooms[roomID]
	if room == nil {
		return false
	}
	_, ok := room.Members[user]
	return ok
}

func (m *VoiceManager) participants(roomID uuid.UUID) []voiceParticipant {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.participantsLocked(roomID)
}

func (m *VoiceManager) participantsLocked(roomID uuid.UUID) []voiceParticipant {
	room := m.rooms[roomID]
	if room == nil {
		return nil
	}
	list := make([]voiceParticipant, 0, len(room.Members))
	for _, p := range room.Members {
		list = append(list, *p)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Joined.Before(list[j].Joined) })
	return list
}

func (m *VoiceManager) users() []uuid.UUID {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]uuid.UUID, 0, len(m.byUser))
	for u := range m.byUser {
		out = append(out, u)
	}
	return out
}

func (m *VoiceManager) busy(user uuid.UUID) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.byUser[user]; ok {
		return true
	}
	for _, c := range m.calls {
		if c.Caller == user || c.Callee == user {
			return true
		}
	}
	return false
}

type roomInfo struct {
	Kind     string
	Name     string
	SpaceID  uuid.UUID
	Call     *call
	Audience []uuid.UUID
}

func (ri *roomInfo) has(user uuid.UUID) bool {
	for _, id := range ri.Audience {
		if id == user {
			return true
		}
	}
	return false
}

func (s *Server) resolveRoom(ctx context.Context, roomID uuid.UUID) *roomInfo {
	if c := s.voice.callByID(roomID); c != nil {
		return &roomInfo{Kind: "call", Call: c, Audience: []uuid.UUID{c.Caller, c.Callee}}
	}
	var name string
	var spaceID uuid.UUID
	err := s.db.QueryRow(ctx, `SELECT name, space_id FROM space_channels WHERE id=$1 AND type='voice'`, roomID).Scan(&name, &spaceID)
	if err != nil {
		return nil
	}
	members, err := s.channelAudience(ctx, spaceID, roomID)
	if err != nil {
		return nil
	}
	return &roomInfo{Kind: "channel", Name: name, SpaceID: spaceID, Audience: members}
}

func participantDTO(p voiceParticipant, card map[string]any) map[string]any {
	d := make(map[string]any, len(card)+5)
	for k, v := range card {
		d[k] = v
	}
	d["id"] = p.UserID
	d["userId"] = p.UserID
	d["muted"] = p.Muted
	d["deafened"] = p.Deafened
	d["sharing"] = p.Sharing
	d["video"] = p.Video
	return d
}

func (s *Server) participantList(ctx context.Context, roomIDs []uuid.UUID) map[uuid.UUID][]map[string]any {
	raw := make(map[uuid.UUID][]voiceParticipant, len(roomIDs))
	seen := make(map[uuid.UUID]struct{})
	var ids []uuid.UUID
	for _, id := range roomIDs {
		list := s.voice.participants(id)
		raw[id] = list
		for _, p := range list {
			if _, ok := seen[p.UserID]; !ok {
				seen[p.UserID] = struct{}{}
				ids = append(ids, p.UserID)
			}
		}
	}
	cards := s.userCards(ctx, ids)
	out := make(map[uuid.UUID][]map[string]any, len(roomIDs))
	for id, list := range raw {
		items := make([]map[string]any, 0, len(list))
		for _, p := range list {
			items = append(items, participantDTO(p, cards[p.UserID]))
		}
		out[id] = items
	}
	return out
}

func (s *Server) roomSnapshot(ctx context.Context, roomID uuid.UUID, info *roomInfo) map[string]any {
	list := s.participantList(ctx, []uuid.UUID{roomID})[roomID]
	if list == nil {
		list = []map[string]any{}
	}
	snap := map[string]any{
		"id": roomID, "roomId": roomID, "kind": info.Kind, "name": info.Name,
		"participants": list, "members": len(list),
	}
	if info.Kind == "channel" {
		snap["spaceId"] = info.SpaceID
	}
	return snap
}

func (s *Server) broadcastRoom(ctx context.Context, roomID uuid.UUID, info *roomInfo) {
	s.publishMany(info.Audience, Event{Type: "voice_state", Data: s.roomSnapshot(ctx, roomID, info)})
}

func (s *Server) attachParticipants(ctx context.Context, items []map[string]any) {
	ids := make([]uuid.UUID, 0, len(items))
	for _, item := range items {
		if id, ok := item["id"].(uuid.UUID); ok {
			ids = append(ids, id)
		}
	}
	lists := s.participantList(ctx, ids)
	for _, item := range items {
		id, ok := item["id"].(uuid.UUID)
		if !ok {
			continue
		}
		list := lists[id]
		if list == nil {
			list = []map[string]any{}
		}
		item["participants"] = list
		item["members"] = len(list)
	}
}

func (s *Server) afterLeave(ctx context.Context, roomID, user uuid.UUID) {
	if c := s.voice.callByID(roomID); c != nil {
		s.finishCall(c, user, "ended")
		return
	}
	info := s.resolveRoom(ctx, roomID)
	if info == nil {
		return
	}
	s.broadcastRoom(ctx, roomID, info)
}

func (s *Server) startReaper() {
	s.voice.once.Do(func() {
		go func() {
			ticker := time.NewTicker(reapInterval)
			defer ticker.Stop()
			for range ticker.C {
				s.reapOffline()
			}
		}()
	})
}

func (s *Server) reapOffline() {
	for _, user := range s.voice.users() {
		if s.hub.Online(user) {
			s.voice.mu.Lock()
			delete(s.voice.strikes, user)
			s.voice.mu.Unlock()
			continue
		}
		s.voice.mu.Lock()
		s.voice.strikes[user]++
		drop := s.voice.strikes[user] >= reapStrikes
		if drop {
			delete(s.voice.strikes, user)
		}
		s.voice.mu.Unlock()
		if drop {
			if roomID, ok := s.voice.leaveAny(user); ok {
				s.afterLeave(context.Background(), roomID, user)
			}
		}
	}
}

func iceServers() []map[string]any {
	if raw := strings.TrimSpace(os.Getenv("ICE_SERVERS")); raw != "" {
		var custom []map[string]any
		if err := json.Unmarshal([]byte(raw), &custom); err == nil && len(custom) > 0 {
			return custom
		}
	}
	servers := []map[string]any{
		{"urls": []string{"stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"}},
	}
	if turn := strings.TrimSpace(os.Getenv("TURN_URL")); turn != "" {
		servers = append(servers, map[string]any{
			"urls":       strings.Split(turn, ","),
			"username":   os.Getenv("TURN_USERNAME"),
			"credential": os.Getenv("TURN_PASSWORD"),
		})
	}
	return servers
}

func (s *Server) voiceRoutes(w http.ResponseWriter, r *http.Request) {
	me := currentUserID(r)
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/voice"), "/")
	if path == "" {
		s.voiceList(w, r, me)
		return
	}
	if path == "config" {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"iceServers": iceServers()})
		return
	}
	parts := strings.Split(path, "/")
	roomID, err := uuid.Parse(parts[0])
	if err != nil || len(parts) > 2 {
		badRequest(w, "Некорректный ID комнаты")
		return
	}
	info := s.resolveRoom(r.Context(), roomID)
	if info == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Голосовая комната не найдена"})
		return
	}
	if !info.has(me) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Нет доступа к этой комнате"})
		return
	}
	if len(parts) == 1 {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
			return
		}
		writeJSON(w, http.StatusOK, s.roomSnapshot(r.Context(), roomID, info))
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
		return
	}
	switch parts[1] {
	case "join":
		s.voiceJoin(w, r, me, roomID, info)
	case "leave":
		s.voiceLeave(w, r, me, roomID)
	case "state":
		s.voiceState(w, r, me, roomID, info)
	case "signal":
		s.voiceSignal(w, r, me, roomID)
	default:
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Маршрут не найден"})
	}
}

func (s *Server) voiceList(w http.ResponseWriter, r *http.Request, me uuid.UUID) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT c.id, c.name, c.space_id, sp.name FROM space_channels c JOIN spaces sp ON sp.id=c.space_id WHERE c.type='voice' AND `+channelViewSQL("sp", "c", "$1")+` ORDER BY sp.name, c.created_at`, me)
	if err != nil {
		s.writeError(w, err)
		return
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var id, spaceID uuid.UUID
		var name, spaceName string
		if err := rows.Scan(&id, &name, &spaceID, &spaceName); err != nil {
			s.writeError(w, err)
			return
		}
		items = append(items, map[string]any{"id": id, "name": name, "type": "voice", "spaceId": spaceID, "spaceName": spaceName})
	}
	if err := rows.Err(); err != nil {
		s.writeError(w, err)
		return
	}
	rows.Close()
	s.attachParticipants(r.Context(), items)
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) voiceJoin(w http.ResponseWriter, r *http.Request, me, roomID uuid.UUID, info *roomInfo) {
	var in struct {
		Muted bool `json:"muted"`
		Video bool `json:"video"`
	}
	if !decode(w, r, &in) {
		return
	}
	if info.Kind == "call" && info.Call.Callee == me && !info.Call.isActive() {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "Сначала примите звонок"})
		return
	}
	if info.Kind == "channel" {
		if _, canConnect := s.channelAccess(r.Context(), info.SpaceID, roomID, me); !canConnect {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "У вас нет права подключаться к этому голосовому каналу"})
			return
		}
	}
	previous, _ := s.voice.join(roomID, me, in.Muted, in.Video)
	s.startReaper()
	if previous != uuid.Nil {
		s.afterLeave(r.Context(), previous, me)
	}
	s.broadcastRoom(r.Context(), roomID, info)
	snap := s.roomSnapshot(r.Context(), roomID, info)
	peers := make([]uuid.UUID, 0)
	for _, p := range s.voice.participants(roomID) {
		if p.UserID != me {
			peers = append(peers, p.UserID)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"room": snap, "peers": peers, "iceServers": iceServers()})
}

func (s *Server) voiceLeave(w http.ResponseWriter, r *http.Request, me, roomID uuid.UUID) {
	if s.voice.leave(roomID, me) {
		s.afterLeave(r.Context(), roomID, me)
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) voiceState(w http.ResponseWriter, r *http.Request, me, roomID uuid.UUID, info *roomInfo) {
	var in struct {
		Muted    *bool `json:"muted"`
		Deafened *bool `json:"deafened"`
		Sharing  *bool `json:"sharing"`
		Video    *bool `json:"video"`
	}
	if !decode(w, r, &in) {
		return
	}
	ok := s.voice.update(roomID, me, func(p *voiceParticipant) {
		if in.Muted != nil {
			p.Muted = *in.Muted
		}
		if in.Deafened != nil {
			p.Deafened = *in.Deafened
		}
		if in.Sharing != nil {
			p.Sharing = *in.Sharing
		}
		if in.Video != nil {
			p.Video = *in.Video
		}
	})
	if !ok {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "Вы не подключены к комнате"})
		return
	}
	s.broadcastRoom(r.Context(), roomID, info)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) voiceSignal(w http.ResponseWriter, r *http.Request, me, roomID uuid.UUID) {
	var in struct {
		To   uuid.UUID       `json:"to"`
		Type string          `json:"type"`
		Data json.RawMessage `json:"data"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Type != "offer" && in.Type != "answer" && in.Type != "candidate" {
		badRequest(w, "Неизвестный тип сигнала")
		return
	}
	if in.To == me || !s.voice.inRoom(roomID, me) || !s.voice.inRoom(roomID, in.To) {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "Собеседник не в комнате"})
		return
	}
	s.hub.Publish(in.To, Event{Type: "voice_signal", Data: map[string]any{
		"roomId": roomID, "from": me, "type": in.Type, "data": in.Data,
	}})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
