import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/api'
import { session } from '@/api/client'
import Avatar from './Avatar'
import EmptyState from './EmptyState'
import Icon from '@/assets/icon/Icon.jsx'
import { useI18n } from '@/i18n'
import { useCall } from '@/context/CallContext'
import { formatBytes } from '@/utils/format'
import { clearDownloads, readDownloads, saveAttachment } from '@/utils/downloads'
import RightPanel from './RightPanel'

const TABS = [
    { id: 'participants', icon: 'users', labelKey: 'rightbar.participants' },
    { id: 'threads', icon: 'git-branch', labelKey: 'rightbar.threads' },
    { id: 'files', icon: 'folder', labelKey: 'rightbar.files' },
]

const POLL_MS = 5000

export default function RightSidebar({ roomId }) {
    const { t, language } = useI18n()
    const [tab, setTab] = useState('participants')
    const [rooms, setRooms] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [downloads, setDownloads] = useState(readDownloads)
    const { active: activeCall, participants: callPeople } = useCall()
    const selfId = String(session.getUser()?.id || session.getUser()?.userId || '')
    const dmCall = activeCall?.kind === 'call' ? activeCall : null

    useEffect(() => {
        let active = true

        async function loadRooms(first) {
            if (first) setLoading(true)

            try {
                const all = await api.getVoiceRooms()
                if (!active) return

                setRooms(all.filter((room) =>
                    (room.participants || []).length > 0 || (roomId && String(room.id) === String(roomId))
                ))
                setError('')
            } catch (err) {
                if (active) {
                    setRooms([])
                    setError(err?.message || t('rightbar.loadFailed'))
                }
            } finally {
                if (active && first) setLoading(false)
            }
        }

        loadRooms(true)
        const timer = window.setInterval(() => loadRooms(false), POLL_MS)

        return () => {
            active = false
            window.clearInterval(timer)
        }
    }, [roomId])

    useEffect(() => {
        const refresh = () => setDownloads(readDownloads())
        window.addEventListener('nebula:downloads', refresh)
        return () => window.removeEventListener('nebula:downloads', refresh)
    }, [])

    const isMine = useCallback((room) =>
        (room.participants || []).some((p) => String(typeof p === 'object' ? p.id : p) === selfId),
    [selfId])

    // The room the person is in goes first.
    const sorted = [...rooms].sort((a, b) => Number(isMine(b)) - Number(isMine(a)))

    return (
        <RightPanel tabs={TABS} tab={tab} onTabChange={setTab}>
            {loading && <p className="muted">{t('common.loading')}</p>}

            {!loading && error && (
                <div className="rightbar__content">
                    <p className="auth-inline-error">{error}</p>
                </div>
            )}

            {!loading && !error && tab === 'participants' && (
                <div className="rightbar__content">
                    {sorted.length === 0 && !dmCall && (
                        <EmptyState
                            icon="headphones"
                            title={t('rightbar.noRoomTitle')}
                            description={t('rightbar.noRoomDesc')}
                        />
                    )}

                    {dmCall && (
                        <section className="rightbar-voice rightbar-voice--mine">
                            <Link to={`/app/dm/${dmCall.peer?.id}`} className="rightbar-voice__head">
                                <span className="rightbar-voice__icon"><Icon name="headphones" /></span>
                                <span className="rightbar-voice__title">
                                    <strong>{dmCall.name || t('rightbar.call')}</strong>
                                    <small>{t('rightbar.call')}</small>
                                </span>
                                <span className="rightbar-voice__badge">{t('rightbar.youAreHere')}</span>
                            </Link>

                            <ul className="rightbar__users">
                                {(callPeople.length ? callPeople : [dmCall.peer].filter(Boolean)).map((user) => (
                                    <li className="rightbar__user" key={user.id}>
                                        <Avatar src={user.avatarUrl || user.avatar} label={user.name} size={32} />
                                        <span className="rightbar__user-name">
                                            {user.displayName || user.name || t('common.user')}
                                        </span>
                                        {user.sharing && <Icon name="monitor" className="rightbar__user-flag" />}
                                        {user.muted && <Icon name="mic-off" className="rightbar__user-flag" />}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {sorted.map((room) => {
                        const people = room.participants || []
                        const mine = isMine(room)

                        return (
                            <section key={room.id} className={`rightbar-voice${mine ? ' rightbar-voice--mine' : ''}`}>
                                <Link to={`/app/voice/${room.id}`} className="rightbar-voice__head">
                                    <span className="rightbar-voice__icon"><Icon name="headphones" /></span>
                                    <span className="rightbar-voice__title">
                                        <strong>{room.name}</strong>
                                        <small>{room.spaceName || t('rightbar.inVoice', { count: people.length })}</small>
                                    </span>
                                    {mine
                                        ? <span className="rightbar-voice__badge">{t('rightbar.youAreHere')}</span>
                                        : <span className="rightbar-voice__count">{people.length}</span>}
                                </Link>

                                {people.length === 0 ? (
                                    <p className="rightbar-voice__empty">{t('rightbar.emptyRoomDesc')}</p>
                                ) : (
                                    <ul className="rightbar__users">
                                        {people.map((participant) => {
                                            const user = typeof participant === 'object'
                                                ? participant
                                                : { id: participant, name: '' }

                                            return (
                                                <li className="rightbar__user" key={user.id}>
                                                    <Avatar
                                                        src={user.avatarUrl || user.avatar}
                                                        label={user.name}
                                                        size={32}
                                                    />
                                                    <span className="rightbar__user-name">
                                                        {user.displayName || user.name || t('common.user')}
                                                    </span>
                                                    {user.sharing && <Icon name="monitor" className="rightbar__user-flag" />}
                                                    {user.muted && <Icon name="mic-off" className="rightbar__user-flag" />}
                                                </li>
                                            )
                                        })}
                                    </ul>
                                )}
                            </section>
                        )
                    })}
                </div>
            )}

            {!loading && !error && tab === 'threads' && (
                <EmptyState
                    icon="git-branch"
                    title={t('rightbar.noThreadsTitle')}
                    description={t('rightbar.noThreadsDesc')}
                />
            )}

            {!loading && !error && tab === 'files' && (
                downloads.length === 0 ? (
                    <EmptyState
                        icon="folder"
                        title={t('rightbar.noFilesTitle')}
                        description={t('rightbar.noFilesDesc')}
                    />
                ) : (
                    <div className="rightbar__content">
                        <div className="rightbar__section-title rightbar__section-title--row">
                            <span>{t('rightbar.downloaded')}</span>
                            <button type="button" className="rightbar__clear" onClick={clearDownloads}>
                                {t('rightbar.clearFiles')}
                            </button>
                        </div>
                        <ul className="rightbar-files">
                            {downloads.map((file) => (
                                <li key={file.id} className="rightbar-file-item">
                                    <button
                                        type="button"
                                        className="rightbar-file"
                                        title={t('attach.download')}
                                        disabled={!file.url}
                                        onClick={() => saveAttachment(file).catch(() => {})}
                                    >
                                        <span className="rightbar-file__ext">
                                            {(file.name.split('.').pop() || '').slice(0, 4).toUpperCase() || '•'}
                                        </span>
                                        <span className="rightbar-file__info">
                                            <span className="rightbar-file__name">{file.name}</span>
                                            <span className="rightbar-file__meta">
                                                {formatBytes(file.size, language)} · {new Date(file.at).toLocaleString(language, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )
            )}
        </RightPanel>
    )
}
