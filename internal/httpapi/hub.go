package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
)

type Event struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

type Hub struct {
	mu   sync.RWMutex
	subs map[uuid.UUID]map[chan Event]struct{}
}

func NewHub() *Hub {
	return &Hub{subs: make(map[uuid.UUID]map[chan Event]struct{})}
}

func (h *Hub) Subscribe(user uuid.UUID) (<-chan Event, func()) {
	ch := make(chan Event, 256)
	h.mu.Lock()
	if h.subs[user] == nil {
		h.subs[user] = make(map[chan Event]struct{})
	}
	h.subs[user][ch] = struct{}{}
	h.mu.Unlock()

	return ch, func() {
		h.mu.Lock()
		if set := h.subs[user]; set != nil {
			delete(set, ch)
			if len(set) == 0 {
				delete(h.subs, user)
			}
		}
		h.mu.Unlock()
	}
}

func (h *Hub) Publish(user uuid.UUID, ev Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.subs[user] {
		select {
		case ch <- ev:
		default:
		}
	}
}

func (h *Hub) Online(user uuid.UUID) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.subs[user]) > 0
}

const sseHeartbeat = 25 * time.Second

func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodGet) {
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Потоковая передача не поддерживается"})
		return
	}
	me := currentUserID(r)
	ch, unsubscribe := s.hub.Subscribe(me)
	defer unsubscribe()

	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache, no-transform")
	h.Set("Connection", "keep-alive")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, "retry: 3000\n: connected\n\n")
	flusher.Flush()

	ticker := time.NewTicker(sseHeartbeat)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			if _, err := fmt.Fprint(w, ": ping\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case ev := <-ch:
			payload, err := json.Marshal(ev.Data)
			if err != nil {
				continue
			}
			if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Type, payload); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
