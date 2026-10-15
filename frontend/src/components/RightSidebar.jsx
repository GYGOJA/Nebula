import { useEffect, useState } from 'react'
import { api } from '@/api'
import Avatar from './Avatar'
import EmptyState from './EmptyState'
import { useI18n } from '@/i18n'
import { rightPanel, useRightPanel } from '@/utils/navPanel'
import Icon from "@/assets/icon/Icon.jsx";

const canHover = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches

const TABS = [
    { id: 'participants', icon: 'users', labelKey: 'rightbar.participants' },
    { id: 'threads', icon: 'git-branch', labelKey: 'rightbar.threads' },
    { id: 'files', icon: 'folder', labelKey: 'rightbar.files' },
]

export default function RightSidebar({ roomId }) {
    const { t } = useI18n()
    const [tab, setTab] = useState('participants')
    const [room, setRoom] = useState(null)
    const [participants, setParticipants] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const panelOpen = useRightPanel()
    const tabIndex = Math.max(TABS.findIndex((item) => item.id === tab), 0)

    useEffect(() => {
        rightPanel.close()
    }, [])

    useEffect(() => {
        if (!panelOpen) return undefined

        const onKeyDown = (event) => {
            if (event.key === 'Escape') rightPanel.close()
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [panelOpen])

    useEffect(() => {
        let active = true

        async function loadRoom() {
            setLoading(true)
            setError('')

            try {
                const rooms = await api.getVoiceRooms()
                if (!active) return

                const selected = roomId
                    ? rooms.find((item) => String(item.id) === String(roomId))
                    : null

                setRoom(selected || null)
                setParticipants(selected?.participants || [])
            } catch (err) {
                if (active) {
                    setRoom(null)
                    setParticipants([])
                    setError(err?.message || t('rightbar.loadFailed'))
                }
            } finally {
                if (active) setLoading(false)
            }
        }

        loadRoom()

        return () => {
            active = false
        }
    }, [roomId])

    const selectTab = (id) => {
        setTab(id)

        if (!canHover()) rightPanel.set(true)
    }

    return (
        <>
        <button
            type="button"
            className={`rightbar-backdrop${panelOpen ? ' is-open' : ''}`}
            aria-label={t('rightbar.close')}
            tabIndex={-1}
            onClick={rightPanel.close}
        />

        <aside
            className={`rightbar${panelOpen ? ' rightbar--open' : ''}`}
            style={{ '--i': tabIndex, '--n': TABS.length }}
            onMouseLeave={() => {
                if (canHover()) {
                    rightPanel.close()

                    const active = document.activeElement
                    if (active instanceof HTMLElement && active.closest('.rightbar')) {
                        active.blur()
                    }
                }
            }}
        >
            <button
                type="button"
                className="rightbar__handle"
                onClick={rightPanel.toggle}
                aria-label={t('rightbar.open')}
                aria-expanded={panelOpen}
            >
                <Icon name="users" />
            </button>

            <div className="rightbar__panel">
            <div className="rightbar__body">
            <h2 className="rightbar__title">
                {t(TABS[tabIndex].labelKey)}
                <button
                    type="button"
                    className="rightbar__close"
                    onClick={rightPanel.close}
                    aria-label={t('rightbar.close')}
                >
                    <Icon name="x" />
                </button>
            </h2>

            {loading && <p className="muted">{t('common.loading')}</p>}

            {!loading && error && (
                <div className="rightbar__content">
                    <p className="auth-inline-error">{error}</p>
                </div>
            )}

            {!loading && !error && tab === 'participants' && (
                <div className="rightbar__content">
                    {room && (
                        <div className="rightbar__section-title">
                            {t('rightbar.inVoice', { count: participants.length })}
                        </div>
                    )}

                    {!room && (
                        <EmptyState
                            icon="volume-2"
                            title={t('rightbar.noRoomTitle')}
                            description={t('rightbar.noRoomDesc')}
                        />
                    )}

                    {room && participants.length === 0 && (
                        <EmptyState
                            icon="users"
                            title={t('common.noOneYet')}
                            description={t('rightbar.emptyRoomDesc')}
                        />
                    )}

                    {room && participants.length > 0 && (
                        <ul className="rightbar__users">
                            {participants.map((participant) => {
                                const user = typeof participant === 'object'
                                    ? participant
                                    : { id: participant, name: '' }

                                return (
                                    <li
                                        className="rightbar__user"
                                        key={user.id}
                                    >
                                        <Avatar
                                            src={user.avatarUrl || user.avatar}
                                            label={user.name}
                                            size={36}
                                        />

                                        <span className="rightbar__user-name">
                                            {user.displayName || user.name || t('common.user')}
                                        </span>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
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
                <EmptyState
                    icon="folder"
                    title={t('rightbar.noFilesTitle')}
                    description={t('rightbar.noFilesDesc')}
                />
            )}
            </div>

            <div className="rightbar__rail" role="tablist" aria-orientation="vertical">
                <span className="rightbar__slider" aria-hidden="true" />

                {TABS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === item.id}
                        title={t(item.labelKey)}
                        className={`rightbar__rail-btn${
                            tab === item.id ? ' is-active' : ''
                        }`}
                        onClick={() => selectTab(item.id)}
                    >
                        <Icon name={item.icon} />
                        <span className="rightbar__rail-label">{t(item.labelKey)}</span>
                    </button>
                ))}
            </div>
            </div>
        </aside>
        </>
    )
}
