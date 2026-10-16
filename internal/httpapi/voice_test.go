package httpapi

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func newTestServer() *Server {
	return &Server{hub: NewHub(), voice: NewVoiceManager()}
}

func TestVoiceJoinLeave(t *testing.T) {
	m := NewVoiceManager()
	room, other := uuid.New(), uuid.New()
	a, b := uuid.New(), uuid.New()

	if prev, created := m.join(room, a, false, false); prev != uuid.Nil || !created {
		t.Fatalf("first join: prev=%v created=%v", prev, created)
	}
	if _, created := m.join(room, b, true, false); !created {
		t.Fatal("second user must be created")
	}
	if got := len(m.participants(room)); got != 2 {
		t.Fatalf("want 2 participants, got %d", got)
	}
	if prev, _ := m.join(other, a, false, false); prev != room {
		t.Fatalf("moving rooms must report previous room, got %v", prev)
	}
	if m.inRoom(room, a) {
		t.Fatal("user must leave previous room")
	}
	if !m.leave(other, a) || m.leave(other, a) {
		t.Fatal("leave must succeed once")
	}
	if m.busy(a) {
		t.Fatal("user must not be busy after leaving")
	}
}

func TestCallLifecycle(t *testing.T) {
	s := newTestServer()
	caller, callee := uuid.New(), uuid.New()
	chCaller, stopCaller := s.hub.Subscribe(caller)
	defer stopCaller()
	chCallee, stopCallee := s.hub.Subscribe(callee)
	defer stopCallee()

	c := &call{ID: uuid.New(), Caller: caller, Callee: callee, Created: time.Now()}
	s.voice.addCall(c)
	if !s.voice.busy(caller) || !s.voice.busy(callee) {
		t.Fatal("both sides must be busy while ringing")
	}
	s.voice.join(c.ID, caller, false, false)

	s.finishCall(c, caller, "cancelled")

	for name, ch := range map[string]<-chan Event{"caller": chCaller, "callee": chCallee} {
		select {
		case ev := <-ch:
			if ev.Type != "call_ended" {
				t.Fatalf("%s got %s", name, ev.Type)
			}
		case <-time.After(time.Second):
			t.Fatalf("%s did not receive call_ended", name)
		}
	}
	if s.voice.busy(caller) || s.voice.busy(callee) || s.voice.callByID(c.ID) != nil {
		t.Fatal("call state must be cleaned up")
	}
	s.finishCall(c, caller, "ended")
}

func TestVoiceSignalRouting(t *testing.T) {
	s := newTestServer()
	room, a, b := uuid.New(), uuid.New(), uuid.New()
	s.voice.join(room, a, false, false)
	if s.voice.inRoom(room, b) {
		t.Fatal("b must not be in room")
	}
	s.voice.join(room, b, false, false)
	if !s.voice.inRoom(room, a) || !s.voice.inRoom(room, b) {
		t.Fatal("both must be in room")
	}
	if !s.voice.update(room, a, func(p *voiceParticipant) { p.Sharing = true }) {
		t.Fatal("update must succeed")
	}
	for _, p := range s.voice.participants(room) {
		if p.UserID == a && !p.Sharing {
			t.Fatal("sharing flag lost")
		}
	}
}
