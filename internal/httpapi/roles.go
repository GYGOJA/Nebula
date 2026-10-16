package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Role permission bits. They are stored in space_roles.permissions.
const (
	permAdministrator int64 = 1 << iota
	permManageSpace
	permManageChannels
	permManageRoles
	permCreateInvite
	permSendMessages
)

const (
	allPerms             = permAdministrator | permManageSpace | permManageChannels | permManageRoles | permCreateInvite | permSendMessages
	defaultEveryonePerms = permCreateInvite | permSendMessages
	maxRolesPerSpace     = 25
	defaultRoleColor     = "#95908c"
)

var roleColorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func forbidden(w http.ResponseWriter, msg string) {
	writeJSON(w, http.StatusForbidden, map[string]string{"error": msg})
}

func notFound(w http.ResponseWriter, msg string) {
	writeJSON(w, http.StatusNotFound, map[string]string{"error": msg})
}

// spacePerms describes what one user may do inside one space.
type spacePerms struct {
	Exists bool
	Owner  bool
	Member bool
	Perms  int64
	UserID uuid.UUID
	// Top is the highest position among the user's assigned roles (-1 when none).
	// Owners and administrators are not bound by the role hierarchy.
	Top int
}

const rankUnbounded = 1 << 30

// Admin is true for the owner and for anyone holding the administrator bit.
func (p spacePerms) Admin() bool { return p.Member && (p.Owner || p.Perms&permAdministrator != 0) }

func (p spacePerms) Has(perm int64) bool { return p.Admin() || (p.Member && p.Perms&perm != 0) }

func (p spacePerms) CanManage() bool {
	return p.Has(permManageSpace) || p.Has(permManageChannels) || p.Has(permManageRoles)
}

// canGrant stops people from handing out (or editing) rights they do not hold themselves.
func (p spacePerms) canGrant(bits int64) bool { return p.Admin() || bits&^p.Perms == 0 }

// canManageRole: editing, deleting or handing out a role requires it to sit strictly below
// the actor's highest role and to contain only rights the actor holds.
func (p spacePerms) canManageRole(role roleRow) bool {
	return p.Admin() || (role.Position < p.Top && p.canGrant(role.Perms))
}

// memberEditable: whose roles may this actor change? Never the owner's (except by the owner),
// never their own, and for non-admins only members whose top role is below their own.
func (p spacePerms) memberEditable(targetID uuid.UUID, targetIsOwner bool, targetTop int) bool {
	if !p.Has(permManageRoles) {
		return false
	}
	if targetIsOwner {
		return p.Owner
	}
	if p.Admin() {
		return true
	}
	return targetID != p.UserID && targetTop < p.Top
}

func (p spacePerms) effective() int64 {
	if p.Admin() {
		return allPerms
	}
	return p.Perms
}

func (p spacePerms) dto() map[string]any {
	return map[string]any{
		"administrator":  p.Admin(),
		"manageSpace":    p.Has(permManageSpace),
		"manageChannels": p.Has(permManageChannels),
		"manageRoles":    p.Has(permManageRoles),
		"invite":         p.Has(permCreateInvite),
		"send":           p.Has(permSendMessages),
	}
}

func (s *Server) spacePerms(ctx context.Context, spaceID, userID uuid.UUID) spacePerms {
	var p spacePerms
	var everyone *int64
	var assigned int64
	err := s.db.QueryRow(ctx, `
		SELECT sp.owner_id = $2,
		       EXISTS (SELECT 1 FROM space_members sm WHERE sm.space_id = sp.id AND sm.user_id = $2),
		       (SELECT r.permissions FROM space_roles r WHERE r.space_id = sp.id AND r.is_default),
		       COALESCE((SELECT bit_or(r.permissions) FROM space_roles r
		                 JOIN space_member_roles mr ON mr.role_id = r.id
		                 WHERE r.space_id = sp.id AND mr.user_id = $2), 0)::bigint,
		       COALESCE((SELECT MAX(r.position) FROM space_roles r
		                 JOIN space_member_roles mr ON mr.role_id = r.id
		                 WHERE r.space_id = sp.id AND mr.user_id = $2), -1)::int
		FROM spaces sp WHERE sp.id = $1`, spaceID, userID).Scan(&p.Owner, &p.Member, &everyone, &assigned, &p.Top)
	if err != nil {
		return spacePerms{}
	}
	p.Exists = true
	p.UserID = userID
	p.Member = p.Member || p.Owner
	base := defaultEveryonePerms
	if everyone != nil {
		base = *everyone
	}
	p.Perms = (base | assigned) & allPerms
	if p.Admin() {
		p.Top = rankUnbounded
	}
	return p
}

// channelViewSQL returns a boolean SQL expression: may user `u` see section `c` of space `sp`.
// sp, c and u are SQL aliases/expressions already present in the surrounding query.
func channelViewSQL(sp, c, u string) string {
	return fmt.Sprintf(`(%[1]s.owner_id = %[3]s OR (EXISTS (SELECT 1 FROM space_members vm WHERE vm.space_id = %[1]s.id AND vm.user_id = %[3]s)
		AND (%[2]s.restricted = FALSE OR EXISTS (SELECT 1 FROM space_roles vr WHERE vr.space_id = %[1]s.id
			AND (vr.is_default OR EXISTS (SELECT 1 FROM space_member_roles vmr WHERE vmr.role_id = vr.id AND vmr.user_id = %[3]s))
			AND ((vr.permissions & %[4]d) <> 0 OR EXISTS (SELECT 1 FROM space_channel_access va WHERE va.channel_id = %[2]s.id AND va.role_id = vr.id AND va.can_view))))))`,
		sp, c, u, permAdministrator)
}

// channelAccessFor computes view/write access for one section. For voice sections "write" means "may connect".
func (s *Server) channelAccessFor(ctx context.Context, p spacePerms, channelID, userID uuid.UUID, restricted bool) (view, write bool) {
	if !p.Member {
		return false, false
	}
	if p.Admin() {
		return true, true
	}
	canSend := p.Perms&permSendMessages != 0
	if !restricted {
		return true, canSend
	}
	var v, w bool
	err := s.db.QueryRow(ctx, `
		SELECT COALESCE(bool_or(a.can_view), FALSE), COALESCE(bool_or(a.can_view AND a.can_write), FALSE)
		FROM space_channel_access a
		JOIN space_roles r ON r.id = a.role_id
		WHERE a.channel_id = $1
		  AND (r.is_default OR EXISTS (SELECT 1 FROM space_member_roles mr WHERE mr.role_id = r.id AND mr.user_id = $2))`,
		channelID, userID).Scan(&v, &w)
	if err != nil {
		return false, false
	}
	return v, v && w && canSend
}

func (s *Server) channelAccess(ctx context.Context, spaceID, channelID, userID uuid.UUID) (view, write bool) {
	p := s.spacePerms(ctx, spaceID, userID)
	if !p.Member {
		return false, false
	}
	var restricted bool
	if err := s.db.QueryRow(ctx, `SELECT restricted FROM space_channels WHERE id = $1 AND space_id = $2`, channelID, spaceID).Scan(&restricted); err != nil {
		return false, false
	}
	return s.channelAccessFor(ctx, p, channelID, userID, restricted)
}

// channelAudience returns the members who may see the section (used for realtime events).
func (s *Server) channelAudience(ctx context.Context, spaceID, channelID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := s.db.Query(ctx, `
		SELECT u.user_id
		FROM (SELECT user_id FROM space_members WHERE space_id = $1 UNION SELECT owner_id FROM spaces WHERE id = $1) u
		JOIN spaces sp ON sp.id = $1
		JOIN space_channels c ON c.id = $2 AND c.space_id = sp.id
		WHERE `+channelViewSQL("sp", "c", "u.user_id"), spaceID, channelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := make([]uuid.UUID, 0)
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// spaceSections lists the sections of a space the user is allowed to see.
func (s *Server) spaceSections(ctx context.Context, spaceID, userID uuid.UUID, typ string) ([]map[string]any, error) {
	items := make([]map[string]any, 0)
	p := s.spacePerms(ctx, spaceID, userID)
	if !p.Member {
		return items, nil
	}
	q := `SELECT id, name, type, restricted FROM space_channels WHERE space_id = $1`
	args := []any{spaceID}
	if typ != "" {
		q += ` AND type = $2`
		args = append(args, typ)
	}
	rows, err := s.db.Query(ctx, q+` ORDER BY created_at`, args...)
	if err != nil {
		return nil, err
	}
	type section struct {
		id         uuid.UUID
		name, typ  string
		restricted bool
	}
	var all []section
	for rows.Next() {
		var sec section
		if err := rows.Scan(&sec.id, &sec.name, &sec.typ, &sec.restricted); err != nil {
			rows.Close()
			return nil, err
		}
		all = append(all, sec)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, sec := range all {
		view, write := s.channelAccessFor(ctx, p, sec.id, userID, sec.restricted)
		if !view {
			continue
		}
		items = append(items, map[string]any{
			"id": sec.id, "name": sec.name, "type": sec.typ, "spaceId": spaceID,
			"restricted": sec.restricted, "canWrite": write,
		})
	}
	return items, nil
}

// ---- roles -----------------------------------------------------------------

type roleBrief struct {
	ID       uuid.UUID
	Name     string
	Color    string
	Position int
}

func (s *Server) memberRoles(ctx context.Context, spaceID uuid.UUID) map[uuid.UUID][]roleBrief {
	out := make(map[uuid.UUID][]roleBrief)
	rows, err := s.db.Query(ctx, `
		SELECT mr.user_id, r.id, r.name, r.color, r.position
		FROM space_member_roles mr JOIN space_roles r ON r.id = mr.role_id
		WHERE mr.space_id = $1 ORDER BY r.position DESC, r.created_at`, spaceID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var uid uuid.UUID
		var b roleBrief
		if err := rows.Scan(&uid, &b.ID, &b.Name, &b.Color, &b.Position); err != nil {
			continue
		}
		out[uid] = append(out[uid], b)
	}
	return out
}

type roleRow struct {
	ID        uuid.UUID
	Name      string
	Color     string
	Perms     int64
	IsDefault bool
	Position  int
	Members   int
}

func (r roleRow) dto() map[string]any {
	return map[string]any{
		"id": r.ID, "name": r.Name, "color": r.Color, "permissions": r.Perms,
		"isDefault": r.IsDefault, "position": r.Position, "members": r.Members,
	}
}

func (s *Server) loadRoles(ctx context.Context, spaceID uuid.UUID) ([]roleRow, error) {
	rows, err := s.db.Query(ctx, `
		SELECT r.id, r.name, r.color, r.permissions, r.is_default, r.position,
		       CASE WHEN r.is_default
		            THEN (SELECT COUNT(*) FROM (SELECT user_id FROM space_members WHERE space_id = r.space_id UNION SELECT owner_id FROM spaces WHERE id = r.space_id) t)
		            ELSE (SELECT COUNT(*) FROM space_member_roles mr WHERE mr.role_id = r.id) END
		FROM space_roles r WHERE r.space_id = $1
		ORDER BY r.is_default DESC, r.position DESC, r.created_at`, spaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]roleRow, 0)
	for rows.Next() {
		var r roleRow
		if err := rows.Scan(&r.ID, &r.Name, &r.Color, &r.Perms, &r.IsDefault, &r.Position, &r.Members); err != nil {
			return nil, err
		}
		items = append(items, r)
	}
	return items, rows.Err()
}

func (s *Server) loadRole(ctx context.Context, spaceID, roleID uuid.UUID) (*roleRow, error) {
	var r roleRow
	err := s.db.QueryRow(ctx, `SELECT id, name, color, permissions, is_default, position FROM space_roles WHERE id = $1 AND space_id = $2`, roleID, spaceID).
		Scan(&r.ID, &r.Name, &r.Color, &r.Perms, &r.IsDefault, &r.Position)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

type roleInput struct {
	Name        *string `json:"name"`
	Color       *string `json:"color"`
	Permissions *int64  `json:"permissions"`
}

func cleanRoleName(v string) (string, bool) {
	v = strings.TrimSpace(v)
	return v, v != "" && runes(v) <= 40
}

// evictVoiceLosers disconnects people who are still sitting in a voice section of the space
// after a change of roles or section access took their right to connect away.
func (s *Server) evictVoiceLosers(ctx context.Context, spaceID uuid.UUID) {
	rows, err := s.db.Query(ctx, `SELECT id FROM space_channels WHERE space_id = $1 AND type = 'voice'`, spaceID)
	if err != nil {
		return
	}
	var rooms []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if rows.Scan(&id) == nil {
			rooms = append(rooms, id)
		}
	}
	rows.Close()
	for _, roomID := range rooms {
		for _, p := range s.voice.participants(roomID) {
			if _, canConnect := s.channelAccess(ctx, spaceID, roomID, p.UserID); canConnect {
				continue
			}
			if !s.voice.leave(roomID, p.UserID) {
				continue
			}
			s.afterLeave(ctx, roomID, p.UserID)
			// The evicted user is no longer in the room audience, so tell them directly
			// (without revealing who is inside) that they are out.
			s.hub.Publish(p.UserID, Event{Type: "voice_state", Data: map[string]any{
				"id": roomID, "roomId": roomID, "kind": "channel", "spaceId": spaceID,
				"participants": []any{}, "members": 0,
			}})
		}
	}
}

func (s *Server) notifySpace(ctx context.Context, spaceID uuid.UUID, kind string) {
	s.evictVoiceLosers(ctx, spaceID)
	ids, err := s.spaceMemberIDs(ctx, spaceID)
	if err != nil {
		return
	}
	s.publishMany(ids, Event{Type: kind, Data: map[string]any{"spaceId": spaceID}})
}

func (s *Server) createRole(w http.ResponseWriter, r *http.Request, spaceID uuid.UUID, p spacePerms) {
	if !p.Has(permManageRoles) {
		forbidden(w, "Недостаточно прав для управления ролями")
		return
	}
	var in roleInput
	if !decode(w, r, &in) {
		return
	}
	name, ok := "", false
	if in.Name != nil {
		name, ok = cleanRoleName(*in.Name)
	}
	if !ok {
		badRequest(w, "Название роли: от 1 до 40 символов")
		return
	}
	color := defaultRoleColor
	if in.Color != nil && *in.Color != "" {
		if !roleColorRe.MatchString(*in.Color) {
			badRequest(w, "Цвет роли должен быть в формате #rrggbb")
			return
		}
		color = strings.ToLower(*in.Color)
	}
	var perms int64
	if in.Permissions != nil {
		perms = *in.Permissions & allPerms
	}
	if !p.canGrant(perms) {
		forbidden(w, "Нельзя выдать права, которых нет у вас")
		return
	}
	var count int
	if err := s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM space_roles WHERE space_id = $1`, spaceID).Scan(&count); err != nil {
		s.writeError(w, err)
		return
	}
	if count >= maxRolesPerSpace {
		badRequest(w, "Достигнут лимит ролей в группе")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		s.writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var role roleRow
	if p.Admin() {
		err = tx.QueryRow(r.Context(), `
			INSERT INTO space_roles (space_id, name, color, permissions, position)
			VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(position), 0) + 1 FROM space_roles WHERE space_id = $1))
			RETURNING id, name, color, permissions, is_default, position`, spaceID, name, color, perms).
			Scan(&role.ID, &role.Name, &role.Color, &role.Perms, &role.IsDefault, &role.Position)
	} else {
		// A non-admin may only create roles below their own: the new role takes the slot of
		// their top role and everything from that slot upwards moves one step up.
		slot := p.Top
		if slot < 1 {
			slot = 1
		}
		if _, err = tx.Exec(r.Context(), `UPDATE space_roles SET position = position + 1 WHERE space_id = $1 AND NOT is_default AND position >= $2`, spaceID, slot); err == nil {
			err = tx.QueryRow(r.Context(), `
				INSERT INTO space_roles (space_id, name, color, permissions, position)
				VALUES ($1, $2, $3, $4, $5)
				RETURNING id, name, color, permissions, is_default, position`, spaceID, name, color, perms, slot).
				Scan(&role.ID, &role.Name, &role.Color, &role.Perms, &role.IsDefault, &role.Position)
		}
	}
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		s.writeError(w, err)
		return
	}
	s.notifySpace(r.Context(), spaceID, "space_updated")
	writeJSON(w, http.StatusCreated, role.dto())
}

func (s *Server) patchRole(w http.ResponseWriter, r *http.Request, spaceID, roleID uuid.UUID, p spacePerms) {
	if !p.Has(permManageRoles) {
		forbidden(w, "Недостаточно прав для управления ролями")
		return
	}
	role, err := s.loadRole(r.Context(), spaceID, roleID)
	if errors.Is(err, pgx.ErrNoRows) {
		notFound(w, "Роль не найдена")
		return
	}
	if err != nil {
		s.writeError(w, err)
		return
	}
	if !p.canManageRole(*role) {
		forbidden(w, "Эта роль не ниже вашей — менять её нельзя")
		return
	}
	var in roleInput
	if !decode(w, r, &in) {
		return
	}
	if in.Name != nil {
		name, ok := cleanRoleName(*in.Name)
		if !ok {
			badRequest(w, "Название роли: от 1 до 40 символов")
			return
		}
		if role.IsDefault && name != role.Name {
			badRequest(w, "Название базовой роли менять нельзя")
			return
		}
		role.Name = name
	}
	if in.Color != nil && !role.IsDefault {
		if !roleColorRe.MatchString(*in.Color) {
			badRequest(w, "Цвет роли должен быть в формате #rrggbb")
			return
		}
		role.Color = strings.ToLower(*in.Color)
	}
	if in.Permissions != nil {
		perms := *in.Permissions & allPerms
		if !p.canGrant(perms) {
			forbidden(w, "Нельзя выдать права, которых нет у вас")
			return
		}
		role.Perms = perms
	}
	if _, err := s.db.Exec(r.Context(), `UPDATE space_roles SET name = $3, color = $4, permissions = $5 WHERE id = $1 AND space_id = $2`,
		roleID, spaceID, role.Name, role.Color, role.Perms); err != nil {
		s.writeError(w, err)
		return
	}
	s.notifySpace(r.Context(), spaceID, "space_updated")
	writeJSON(w, http.StatusOK, role.dto())
}

func (s *Server) deleteRole(w http.ResponseWriter, r *http.Request, spaceID, roleID uuid.UUID, p spacePerms) {
	if !p.Has(permManageRoles) {
		forbidden(w, "Недостаточно прав для управления ролями")
		return
	}
	role, err := s.loadRole(r.Context(), spaceID, roleID)
	if errors.Is(err, pgx.ErrNoRows) {
		notFound(w, "Роль не найдена")
		return
	}
	if err != nil {
		s.writeError(w, err)
		return
	}
	if role.IsDefault {
		badRequest(w, "Базовую роль удалить нельзя")
		return
	}
	if !p.canManageRole(*role) {
		forbidden(w, "Эта роль не ниже вашей — менять её нельзя")
		return
	}
	if _, err := s.db.Exec(r.Context(), `DELETE FROM space_roles WHERE id = $1 AND space_id = $2 AND NOT is_default`, roleID, spaceID); err != nil {
		s.writeError(w, err)
		return
	}
	s.notifySpace(r.Context(), spaceID, "space_updated")
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// setMemberRoles replaces the (non-default) roles of one member.
func (s *Server) setMemberRoles(w http.ResponseWriter, r *http.Request, spaceID, targetID uuid.UUID, p spacePerms) {
	if !p.Has(permManageRoles) {
		forbidden(w, "Недостаточно прав для управления ролями")
		return
	}
	var in struct {
		RoleIDs []string `json:"roleIds"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !s.isSpaceMember(r.Context(), spaceID, targetID) {
		notFound(w, "Участник не найден")
		return
	}
	var targetIsOwner bool
	var targetTop int
	if err := s.db.QueryRow(r.Context(), `
		SELECT sp.owner_id = $2,
		       COALESCE((SELECT MAX(r.position) FROM space_roles r JOIN space_member_roles mr ON mr.role_id = r.id
		                 WHERE r.space_id = sp.id AND mr.user_id = $2), -1)::int
		FROM spaces sp WHERE sp.id = $1`, spaceID, targetID).Scan(&targetIsOwner, &targetTop); err != nil {
		s.writeError(w, err)
		return
	}
	if !p.memberEditable(targetID, targetIsOwner, targetTop) {
		forbidden(w, "Нельзя менять роли этого участника")
		return
	}
	roles, err := s.loadRoles(r.Context(), spaceID)
	if err != nil {
		s.writeError(w, err)
		return
	}
	known := make(map[uuid.UUID]roleRow, len(roles))
	for _, role := range roles {
		known[role.ID] = role
	}
	want := make(map[uuid.UUID]bool)
	for _, raw := range in.RoleIDs {
		id, err := uuid.Parse(raw)
		if err != nil {
			badRequest(w, "Некорректный ID роли")
			return
		}
		role, ok := known[id]
		if !ok {
			badRequest(w, "Роль не найдена в этой группе")
			return
		}
		if role.IsDefault {
			continue
		}
		want[id] = true
	}
	have := make(map[uuid.UUID]bool)
	rows, err := s.db.Query(r.Context(), `SELECT role_id FROM space_member_roles WHERE space_id = $1 AND user_id = $2`, spaceID, targetID)
	if err != nil {
		s.writeError(w, err)
		return
	}
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			s.writeError(w, err)
			return
		}
		have[id] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		s.writeError(w, err)
		return
	}
	var add, remove []uuid.UUID
	for id := range want {
		if !have[id] {
			add = append(add, id)
		}
	}
	for id := range have {
		if !want[id] {
			remove = append(remove, id)
		}
	}
	for _, id := range append(append([]uuid.UUID{}, add...), remove...) {
		if !p.canManageRole(known[id]) {
			forbidden(w, "Нельзя выдавать или снимать роли, которые не ниже вашей")
			return
		}
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		s.writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	for _, id := range remove {
		if _, err := tx.Exec(r.Context(), `DELETE FROM space_member_roles WHERE user_id = $1 AND role_id = $2`, targetID, id); err != nil {
			s.writeError(w, err)
			return
		}
	}
	for _, id := range add {
		if _, err := tx.Exec(r.Context(), `INSERT INTO space_member_roles (space_id, user_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, spaceID, targetID, id); err != nil {
			s.writeError(w, err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		s.writeError(w, err)
		return
	}
	ids := make([]uuid.UUID, 0, len(want))
	for id := range want {
		ids = append(ids, id)
	}
	s.notifySpace(r.Context(), spaceID, "space_updated")
	writeJSON(w, http.StatusOK, map[string]any{"userId": targetID, "roleIds": ids})
}

// ---- space settings --------------------------------------------------------

func (s *Server) spaceSettings(w http.ResponseWriter, r *http.Request, spaceID uuid.UUID, p spacePerms, name, description, avatarURL string, ownerID uuid.UUID) {
	if !p.CanManage() {
		forbidden(w, "Недостаточно прав для настроек группы")
		return
	}
	ctx := r.Context()
	roles, err := s.loadRoles(ctx, spaceID)
	if err != nil {
		s.writeError(w, err)
		return
	}
	roleItems := make([]map[string]any, 0, len(roles))
	for _, role := range roles {
		item := role.dto()
		item["manageable"] = p.Has(permManageRoles) && p.canManageRole(role)
		roleItems = append(roleItems, item)
	}

	type section struct {
		id         uuid.UUID
		name, typ  string
		restricted bool
	}
	rows, err := s.db.Query(ctx, `SELECT id, name, type, restricted FROM space_channels WHERE space_id = $1 ORDER BY type DESC, created_at`, spaceID)
	if err != nil {
		s.writeError(w, err)
		return
	}
	var secs []section
	for rows.Next() {
		var sec section
		if err := rows.Scan(&sec.id, &sec.name, &sec.typ, &sec.restricted); err != nil {
			rows.Close()
			s.writeError(w, err)
			return
		}
		secs = append(secs, sec)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		s.writeError(w, err)
		return
	}
	access := make(map[uuid.UUID][]map[string]any)
	arows, err := s.db.Query(ctx, `
		SELECT a.channel_id, a.role_id, a.can_view, a.can_write
		FROM space_channel_access a JOIN space_channels c ON c.id = a.channel_id WHERE c.space_id = $1`, spaceID)
	if err != nil {
		s.writeError(w, err)
		return
	}
	for arows.Next() {
		var cid, rid uuid.UUID
		var v, wr bool
		if err := arows.Scan(&cid, &rid, &v, &wr); err != nil {
			arows.Close()
			s.writeError(w, err)
			return
		}
		access[cid] = append(access[cid], map[string]any{"roleId": rid, "canView": v, "canWrite": wr})
	}
	arows.Close()
	if err := arows.Err(); err != nil {
		s.writeError(w, err)
		return
	}
	sectionItems := make([]map[string]any, 0, len(secs))
	for _, sec := range secs {
		list := access[sec.id]
		if list == nil {
			list = []map[string]any{}
		}
		sectionItems = append(sectionItems, map[string]any{
			"id": sec.id, "name": sec.name, "type": sec.typ, "restricted": sec.restricted, "access": list,
		})
	}

	ids, err := s.spaceMemberIDs(ctx, spaceID)
	if err != nil {
		s.writeError(w, err)
		return
	}
	cards := s.userCards(ctx, ids)
	byUser := s.memberRoles(ctx, spaceID)
	members := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		card := cards[id]
		if card == nil {
			continue
		}
		roleIDs := make([]uuid.UUID, 0)
		top := -1
		for _, b := range byUser[id] {
			roleIDs = append(roleIDs, b.ID)
			if b.Position > top {
				top = b.Position
			}
		}
		members = append(members, map[string]any{
			"editable": p.memberEditable(id, id == ownerID, top),
			"id":       id, "userId": id, "username": card["username"], "displayName": card["displayName"],
			"name": card["name"], "avatarUrl": card["avatarUrl"], "avatar": card["avatar"],
			"roleIds": roleIDs, "isOwner": id == ownerID,
		})
	}
	var memberCount int
	_ = s.db.QueryRow(ctx, `SELECT COUNT(*) FROM (SELECT user_id FROM space_members WHERE space_id = $1 UNION SELECT owner_id FROM spaces WHERE id = $1) t`, spaceID).Scan(&memberCount)
	var isPublic bool
	_ = s.db.QueryRow(ctx, `SELECT is_public FROM spaces WHERE id = $1`, spaceID).Scan(&isPublic)
	writeJSON(w, http.StatusOK, map[string]any{
		"space": map[string]any{
			"id": spaceID, "name": name, "description": description, "avatarUrl": avatarURL,
			"ownerId": ownerID, "members": memberCount, "isPublic": isPublic,
		},
		"isOwner":     p.Owner,
		"permissions": p.effective(),
		"can":         p.dto(),
		"roles":       roleItems,
		"sections":    sectionItems,
		"members":     members,
	})
}

func (s *Server) patchSpace(w http.ResponseWriter, r *http.Request, spaceID uuid.UUID, p spacePerms) {
	if !p.Has(permManageSpace) {
		forbidden(w, "Недостаточно прав для изменения группы")
		return
	}
	var in struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		IsPublic    *bool   `json:"isPublic"`
	}
	if !decode(w, r, &in) {
		return
	}
	var name, description *string
	if in.Name != nil {
		v := strings.TrimSpace(*in.Name)
		if v == "" || runes(v) > 80 {
			badRequest(w, "Название группы: от 1 до 80 символов")
			return
		}
		name = &v
	}
	if in.Description != nil {
		v := strings.TrimSpace(*in.Description)
		if runes(v) > 500 {
			badRequest(w, "Описание группы: не более 500 символов")
			return
		}
		description = &v
	}
	var outName, outDesc, outAvatar string
	var outPublic bool
	err := s.db.QueryRow(r.Context(), `
		UPDATE spaces SET name = COALESCE($2, name), description = COALESCE($3, description), is_public = COALESCE($4, is_public)
		WHERE id = $1 RETURNING name, COALESCE(description, ''), COALESCE(avatar_url, ''), is_public`,
		spaceID, name, description, in.IsPublic).Scan(&outName, &outDesc, &outAvatar, &outPublic)
	if err != nil {
		s.writeError(w, err)
		return
	}
	s.notifySpace(r.Context(), spaceID, "space_updated")
	writeJSON(w, http.StatusOK, map[string]any{"id": spaceID, "name": outName, "description": outDesc, "avatarUrl": outAvatar, "avatar_url": outAvatar, "isPublic": outPublic})
}

func (s *Server) deleteSpaceAvatar(w http.ResponseWriter, r *http.Request, spaceID uuid.UUID, p spacePerms) {
	if !p.Has(permManageSpace) {
		forbidden(w, "Недостаточно прав для изменения аватара группы")
		return
	}
	var name, description string
	err := s.db.QueryRow(r.Context(), `UPDATE spaces SET avatar_url = NULL WHERE id = $1 RETURNING name, COALESCE(description, '')`, spaceID).Scan(&name, &description)
	if err != nil {
		s.writeError(w, err)
		return
	}
	_ = os.Remove(spaceAvatarPath(spaceID))
	s.notifySpace(r.Context(), spaceID, "space_updated")
	writeJSON(w, http.StatusOK, map[string]any{"id": spaceID, "name": name, "description": description, "avatarUrl": "", "avatar_url": ""})
}

func (s *Server) channelFileKeys(ctx context.Context, cond string, args ...any) []string {
	rows, err := s.db.Query(ctx, `
		SELECT a.storage_key FROM channel_attachments a
		JOIN channel_messages m ON m.id = a.message_id
		JOIN space_channels c ON c.id = m.channel_id
		WHERE `+cond, args...)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var keys []string
	for rows.Next() {
		var k string
		if rows.Scan(&k) == nil {
			keys = append(keys, k)
		}
	}
	return keys
}

func removeChannelFiles(keys []string) {
	for _, k := range keys {
		_ = os.Remove(filepath.Join(channelAttachmentDir(), filepath.Base(k)))
	}
}

func (s *Server) deleteSpace(w http.ResponseWriter, r *http.Request, spaceID uuid.UUID, p spacePerms) {
	if !p.Owner {
		forbidden(w, "Удалить группу может только владелец")
		return
	}
	ctx := r.Context()
	keys := s.channelFileKeys(ctx, `c.space_id = $1`, spaceID)
	members, _ := s.spaceMemberIDs(ctx, spaceID)
	if _, err := s.db.Exec(ctx, `DELETE FROM spaces WHERE id = $1`, spaceID); err != nil {
		s.writeError(w, err)
		return
	}
	removeChannelFiles(keys)
	_ = os.Remove(spaceAvatarPath(spaceID))
	s.publishMany(members, Event{Type: "space_deleted", Data: map[string]any{"spaceId": spaceID}})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---- sections (text/voice) -------------------------------------------------

type accessInput struct {
	RoleID   string `json:"roleId"`
	CanView  bool   `json:"canView"`
	CanWrite bool   `json:"canWrite"`
}

func (s *Server) patchSection(w http.ResponseWriter, r *http.Request, spaceID, channelID uuid.UUID, p spacePerms) {
	if !p.Has(permManageChannels) {
		forbidden(w, "Недостаточно прав для управления каналами")
		return
	}
	var in struct {
		Name       *string        `json:"name"`
		Restricted *bool          `json:"restricted"`
		Access     *[]accessInput `json:"access"`
	}
	if !decode(w, r, &in) {
		return
	}
	ctx := r.Context()
	var name, typ string
	var restricted bool
	err := s.db.QueryRow(ctx, `SELECT name, type, restricted FROM space_channels WHERE id = $1 AND space_id = $2`, channelID, spaceID).Scan(&name, &typ, &restricted)
	if errors.Is(err, pgx.ErrNoRows) {
		notFound(w, "Канал не найден")
		return
	}
	if err != nil {
		s.writeError(w, err)
		return
	}
	if in.Name != nil {
		v := strings.TrimSpace(*in.Name)
		if v == "" || runes(v) > 80 {
			badRequest(w, "Название канала: от 1 до 80 символов")
			return
		}
		name = v
	}
	if in.Restricted != nil {
		restricted = *in.Restricted
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		s.writeError(w, err)
		return
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `UPDATE space_channels SET name = $3, restricted = $4 WHERE id = $1 AND space_id = $2`, channelID, spaceID, name, restricted); err != nil {
		s.writeError(w, err)
		return
	}
	if in.Access != nil {
		if _, err := tx.Exec(ctx, `DELETE FROM space_channel_access WHERE channel_id = $1`, channelID); err != nil {
			s.writeError(w, err)
			return
		}
		seen := make(map[uuid.UUID]bool)
		for _, entry := range *in.Access {
			roleID, err := uuid.Parse(entry.RoleID)
			if err != nil {
				badRequest(w, "Некорректный ID роли")
				return
			}
			if seen[roleID] {
				continue
			}
			seen[roleID] = true
			canView := entry.CanView
			canWrite := entry.CanWrite && canView
			if !canView {
				continue
			}
			tag, err := tx.Exec(ctx, `
				INSERT INTO space_channel_access (channel_id, role_id, can_view, can_write)
				SELECT $1, r.id, $3, $4 FROM space_roles r WHERE r.id = $2 AND r.space_id = $5`,
				channelID, roleID, canView, canWrite, spaceID)
			if err != nil {
				s.writeError(w, err)
				return
			}
			if tag.RowsAffected() != 1 {
				badRequest(w, "Роль не найдена в этой группе")
				return
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		s.writeError(w, err)
		return
	}
	s.notifySpace(ctx, spaceID, "space_updated")
	writeJSON(w, http.StatusOK, map[string]any{"id": channelID, "name": name, "type": typ, "spaceId": spaceID, "restricted": restricted})
}

func (s *Server) deleteSection(w http.ResponseWriter, r *http.Request, spaceID, channelID uuid.UUID, p spacePerms) {
	if !p.Has(permManageChannels) {
		forbidden(w, "Недостаточно прав для управления каналами")
		return
	}
	ctx := r.Context()
	keys := s.channelFileKeys(ctx, `c.id = $1 AND c.space_id = $2`, channelID, spaceID)
	tag, err := s.db.Exec(ctx, `DELETE FROM space_channels WHERE id = $1 AND space_id = $2`, channelID, spaceID)
	if err != nil {
		s.writeError(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		notFound(w, "Канал не найден")
		return
	}
	removeChannelFiles(keys)
	s.notifySpace(ctx, spaceID, "space_updated")
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// spaceManageRoutes handles settings, roles and section management.
// It reports whether the request was handled; other paths fall through to spaceRoutes.
func (s *Server) spaceManageRoutes(w http.ResponseWriter, r *http.Request, parts []string, spaceID uuid.UUID, p spacePerms, name, description, avatarURL string, ownerID uuid.UUID) bool {
	switch len(parts) {
	case 1:
		switch r.Method {
		case http.MethodPatch:
			s.patchSpace(w, r, spaceID, p)
			return true
		case http.MethodDelete:
			s.deleteSpace(w, r, spaceID, p)
			return true
		}
	case 2:
		switch {
		case parts[1] == "settings" && r.Method == http.MethodGet:
			s.spaceSettings(w, r, spaceID, p, name, description, avatarURL, ownerID)
			return true
		case parts[1] == "roles" && r.Method == http.MethodPost:
			s.createRole(w, r, spaceID, p)
			return true
		case parts[1] == "avatar" && r.Method == http.MethodDelete:
			s.deleteSpaceAvatar(w, r, spaceID, p)
			return true
		}
	case 3:
		id, err := uuid.Parse(parts[2])
		if err != nil {
			return false
		}
		switch {
		case parts[1] == "roles" && r.Method == http.MethodPatch:
			s.patchRole(w, r, spaceID, id, p)
			return true
		case parts[1] == "roles" && r.Method == http.MethodDelete:
			s.deleteRole(w, r, spaceID, id, p)
			return true
		case parts[1] == "members" && r.Method == http.MethodPatch:
			s.setMemberRoles(w, r, spaceID, id, p)
			return true
		case (parts[1] == "channels" || parts[1] == "voice") && r.Method == http.MethodPatch:
			s.patchSection(w, r, spaceID, id, p)
			return true
		case (parts[1] == "channels" || parts[1] == "voice") && r.Method == http.MethodDelete:
			s.deleteSection(w, r, spaceID, id, p)
			return true
		}
	}
	return false
}
