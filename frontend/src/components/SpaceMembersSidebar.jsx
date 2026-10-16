import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { api } from '@/api'
import { useI18n } from '@/i18n'
import { useNotifications } from '@/context/NotificationsContext'
import { useAppEvent } from '@/hooks/useAppEvent'
import Avatar from './Avatar'
import EmptyState from './EmptyState'
import RightPanel from './RightPanel'
import SpaceFilesPanel from './SpaceFilesPanel'
import SpaceThreadsPanel from './SpaceThreadsPanel'

const REFRESH_MS = 30000
const OWNER_COLOR = '#ffb020'
const EVERYONE_COLOR = '#6f6f6f'

const TABS = [
    { id: 'members', icon: 'users', labelKey: 'rightbar.participants' },
    { id: 'threads', icon: 'git-branch', labelKey: 'rightbar.threads' },
    { id: 'files', icon: 'folder', labelKey: 'rightbar.files' },
]

// Roles come from the server ordered from the highest to the lowest.
function memberRoles(member) {
    return Array.isArray(member.roles) ? member.roles : []
}

// Members are listed under their highest role. The owner without any role gets an
// "Owner" label of their own, and members without roles fall under the base role.
function groupByRole(members, t) {
    const groups = new Map()

    for (const member of members) {
        const top = memberRoles(member)[0]
        let key = 'everyone'
        let group = { label: t('ss.everyone'), color: EVERYONE_COLOR, rank: -1 }

        if (top) {
            key = top.id
            group = { label: top.name, color: top.color || EVERYONE_COLOR, rank: Number(top.position) || 0 }
        } else if (member.role === 'owner') {
            key = 'owner'
            group = { label: t('members.owner'), color: OWNER_COLOR, rank: Number.MAX_SAFE_INTEGER }
        }

        if (!groups.has(key)) groups.set(key, { key, ...group, members: [] })
        groups.get(key).members.push(member)
    }

    return Array.from(groups.values()).sort((a, b) => b.rank - a.rank)
}

function RolePopover({ member, rect }) {
    const { t } = useI18n()
    const roles = memberRoles(member)
    const name = member.displayName || member.name || member.username
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - 200))

    return createPortal(
        <div
            className="member-pop"
            role="tooltip"
            style={{ top, right: Math.max(8, window.innerWidth - rect.left + 10) }}
        >
            <div className="member-pop__head">
                <strong style={member.color ? { color: member.color } : undefined}>{name}</strong>
                {member.username && <span>@{member.username}</span>}
            </div>

            <div className="member-pop__title">{t('members.roles')}</div>

            <ul className="member-pop__roles">
                {member.role === 'owner' && (
                    <li className="member-pop__role member-pop__role--owner">
                        <i style={{ background: OWNER_COLOR }} />
                        {t('members.owner')}
                    </li>
                )}

                {roles.map((role) => (
                    <li key={role.id} className="member-pop__role">
                        <i style={{ background: role.color || EVERYONE_COLOR }} />
                        {role.name}
                    </li>
                ))}

                {roles.length === 0 && member.role !== 'owner' && (
                    <li className="member-pop__role">
                        <i style={{ background: EVERYONE_COLOR }} />
                        {t('ss.everyone')}
                    </li>
                )}
            </ul>
        </div>,
        document.body
    )
}

function MemberRow({ member, offline }) {
    const { t } = useI18n()
    const ref = useRef(null)
    const [rect, setRect] = useState(null)
    const name = member.displayName || member.name || member.username

    const show = () => {
        if (ref.current) setRect(ref.current.getBoundingClientRect())
    }
    const hide = () => setRect(null)

    return (
        <>
            <Link
                ref={ref}
                to={`/app/users/${member.id}`}
                className={`space-members__user${offline ? ' is-offline' : ''}`}
                onMouseEnter={show}
                onMouseLeave={hide}
                onFocus={show}
                onBlur={hide}
            >
                <span className="space-members__avatar">
                    <Avatar src={member.avatarUrl || member.avatar} label={name} size={36} />
                    <i className={`space-members__dot${offline ? '' : ' is-online'}`} />
                </span>

                <div>
                    <strong style={member.color ? { color: member.color } : undefined}>{name}</strong>
                    {member.username && <span>@{member.username}</span>}
                    {member.role === 'owner' && <span className="space-members__owner">{t('members.owner')}</span>}
                </div>
            </Link>

            {rect && <RolePopover member={member} rect={rect} />}
        </>
    )
}

function MemberGroups({ members, offline }) {
    const { t } = useI18n()
    const groups = useMemo(() => groupByRole(members, t), [members, t])

    return groups.map((group) => (
        <div className="space-members__role-group" key={group.key}>
            <div className="space-members__role">
                <i style={{ background: group.color }} />
                <span>{group.label}</span>
                <em>{group.members.length}</em>
            </div>

            {group.members.map((member) => (
                <MemberRow key={member.id} member={member} offline={offline} />
            ))}
        </div>
    ))
}

// `channelId` limits the list to the people who can see that channel.
export default function SpaceMembersSidebar({ space, channelId }) {
    const { t } = useI18n()
    const { subscribe } = useNotifications()
    const [tab, setTab] = useState('members')
    const [members, setMembers] = useState([])
    const [loading, setLoading] = useState(true)
    const spaceId = space?.id
    // Voice rooms have no files or threads of their own, so "this channel" only applies to text channels.
    const textChannelId = space?.channels?.some((item) => item.id === channelId) ? channelId : undefined

    const load = useCallback(async () => {
        if (!spaceId) return

        try {
            const result = await api.getSpaceMembers(spaceId, channelId)

            setMembers(Array.isArray(result) ? result : [])
        } catch {
            return
        } finally {
            setLoading(false)
        }
    }, [spaceId, channelId])

    useEffect(() => {
        load()

        const timer = setInterval(load, REFRESH_MS)

        return () => clearInterval(timer)
    }, [load])

    useEffect(() => subscribe((event) => {
        if (event.type === 'reconnected') load()
    }), [subscribe, load])

    useAppEvent(['space_updated'], load)

    const online = useMemo(() => members.filter((m) => m.online), [members])
    const offline = useMemo(() => members.filter((m) => !m.online), [members])

    return (
        <RightPanel tabs={TABS} tab={tab} onTabChange={setTab} className="rightbar--members">
            {tab === 'members' && (
                <div className="rightbar__content space-members__content">
                    {loading && <p className="muted">{t('common.loading')}</p>}

                    {!loading && members.length === 0 && (
                        <EmptyState
                            icon="users"
                            title={t('common.noOneYet')}
                            description={t('members.empty')}
                        />
                    )}

                    {online.length > 0 && (
                        <>
                            <div className="rightbar__section-title">{t('members.online', { count: online.length })}</div>
                            <MemberGroups members={online} />
                        </>
                    )}

                    {offline.length > 0 && (
                        <>
                            <div className="rightbar__section-title">{t('members.offline', { count: offline.length })}</div>
                            <MemberGroups members={offline} offline />
                        </>
                    )}
                </div>
            )}

            {tab === 'threads' && spaceId && (
                <SpaceThreadsPanel spaceId={spaceId} channelId={textChannelId} />
            )}

            {tab === 'files' && spaceId && (
                <SpaceFilesPanel spaceId={spaceId} channelId={textChannelId} />
            )}
        </RightPanel>
    )
}
