package httpapi

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

const ringTimeout = 45 * time.Second

type call struct {
	ID      uuid.UUID
	Caller  uuid.UUID
	Callee  uuid.UUID
	Video   bool
	Created time.Time

	mu     sync.Mutex
	active bool
	timer  *time.Timer
}

func (c *call) isActive() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.active
}

func (m *VoiceManager) callByID(id uuid.UUID) *call {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.calls[id]
}

func (m *VoiceManager) addCall(c *call) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.calls[c.ID] = c
}

func (m *VoiceManager) removeCall(id uuid.UUID) *call {
	m.mu.Lock()
	defer m.mu.Unlock()
	c := m.calls[id]
	if c == nil {
		return nil
	}
	delete(m.calls, id)
	for _, u := range []uuid.UUID{c.Caller, c.Callee} {
		m.removeLocked(id, u)
	}
	return c
}

func (m *VoiceManager) callsFor(user uuid.UUID) []*call {
	m.mu.Lock()
	defer m.mu.Unlock()
	var list []*call
	for _, c := range m.calls {
		if c.Caller == user || c.Callee == user {
			list = append(list, c)
		}
	}
	return list
}

func (s *Server) finishCall(c *call, by uuid.UUID, reason string) {
	removed := s.voice.removeCall(c.ID)
	if removed == nil {
		return
	}
	c.mu.Lock()
	if c.timer != nil {
		c.timer.Stop()
	}
	c.mu.Unlock()
	data := map[string]any{"id": c.ID, "roomId": c.ID, "reason": reason, "by": by}
	s.hub.Publish(c.Caller, Event{Type: "call_ended", Data: data})
	s.hub.Publish(c.Callee, Event{Type: "call_ended", Data: data})
}

func (s *Server) callDTO(c *call, peer map[string]any) map[string]any {
	return map[string]any{
		"id": c.ID, "roomId": c.ID, "video": c.Video, "active": c.isActive(),
		"createdAt": c.Created, "callerId": c.Caller, "calleeId": c.Callee, "peer": peer,
	}
}

func (s *Server) callRoutes(w http.ResponseWriter, r *http.Request) {
	me := currentUserID(r)
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/calls"), "/")
	if path == "" {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
			return
		}
		s.callStart(w, r, me)
		return
	}
	if path == "pending" {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
			return
		}
		s.callPending(w, r, me)
		return
	}
	parts := strings.Split(path, "/")
	if len(parts) != 2 || r.Method != http.MethodPost {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Маршрут не найден"})
		return
	}
	id, err := uuid.Parse(parts[0])
	if err != nil {
		badRequest(w, "Некорректный ID звонка")
		return
	}
	c := s.voice.callByID(id)
	if c == nil || (c.Caller != me && c.Callee != me) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Звонок не найден или уже завершён"})
		return
	}
	switch parts[1] {
	case "accept":
		s.callAccept(w, r, me, c)
	case "decline":
		if c.Callee != me || c.isActive() {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "Звонок нельзя отклонить"})
			return
		}
		s.finishCall(c, me, "declined")
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	case "cancel":
		if c.Caller != me || c.isActive() {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "Звонок нельзя отменить"})
			return
		}
		s.finishCall(c, me, "cancelled")
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	case "end":
		s.finishCall(c, me, "ended")
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	default:
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Маршрут не найден"})
	}
}

func (s *Server) callStart(w http.ResponseWriter, r *http.Request, me uuid.UUID) {
	var in struct {
		UserID string `json:"userId"`
		Video  bool   `json:"video"`
	}
	if !decode(w, r, &in) {
		return
	}
	other, err := uuid.Parse(in.UserID)
	if err != nil || other == me {
		badRequest(w, "Некорректный пользователь")
		return
	}
	cards := s.userCards(r.Context(), []uuid.UUID{me, other})
	if cards[other] == nil || cards[me] == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Пользователь не найден"})
		return
	}
	if s.voice.busy(me) {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "Вы уже участвуете в звонке или голосовом канале"})
		return
	}
	if s.voice.busy(other) {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "Пользователь сейчас занят"})
		return
	}
	c := &call{ID: uuid.New(), Caller: me, Callee: other, Video: in.Video, Created: time.Now()}
	c.timer = time.AfterFunc(ringTimeout, func() {
		if !c.isActive() {
			s.finishCall(c, uuid.Nil, "missed")
		}
	})
	s.voice.addCall(c)
	s.hub.Publish(other, Event{Type: "call_incoming", Data: map[string]any{
		"call": s.callDTO(c, cards[me]),
	}})
	writeJSON(w, http.StatusCreated, s.callDTO(c, cards[other]))
}

func (s *Server) callAccept(w http.ResponseWriter, r *http.Request, me uuid.UUID, c *call) {
	if c.Callee != me {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "Принять звонок может только адресат"})
		return
	}
	c.mu.Lock()
	c.active = true
	if c.timer != nil {
		c.timer.Stop()
	}
	c.mu.Unlock()
	cards := s.userCards(r.Context(), []uuid.UUID{c.Caller})
	s.hub.Publish(c.Caller, Event{Type: "call_accepted", Data: map[string]any{"id": c.ID, "roomId": c.ID}})
	s.hub.Publish(c.Callee, Event{Type: "call_handled", Data: map[string]any{"id": c.ID}})
	writeJSON(w, http.StatusOK, s.callDTO(c, cards[c.Caller]))
}

func (s *Server) callPending(w http.ResponseWriter, r *http.Request, me uuid.UUID) {
	list := s.voice.callsFor(me)
	ids := make([]uuid.UUID, 0, len(list))
	for _, c := range list {
		if c.Caller == me {
			ids = append(ids, c.Callee)
		} else {
			ids = append(ids, c.Caller)
		}
	}
	cards := s.userCards(r.Context(), ids)
	incoming := make([]map[string]any, 0)
	var active map[string]any
	for _, c := range list {
		peerID := c.Caller
		if c.Caller == me {
			peerID = c.Callee
		}
		dto := s.callDTO(c, cards[peerID])
		switch {
		case c.isActive():
			active = dto
		case c.Callee == me:
			incoming = append(incoming, dto)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"incoming": incoming, "active": active})
}
