import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import NavigationRail from '@/components/NavigationRail'
import Sidebar from '@/components/Sidebar'
import RightSidebar from '@/components/RightSidebar'
import PageHeader from '@/components/PageHeader'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'
import { api } from '@/api'
import { useI18n } from '@/i18n'

export default function VoiceRoom() {
    const { t } = useI18n()
    const { roomId } = useParams()
    const [rooms, setRooms] = useState([])
    const [room, setRoom] = useState(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        setError('')

        try {
            const result = await api.getVoiceRooms()
            const list = Array.isArray(result) ? result : []

            setRooms(list)
            setRoom(
                list.find((item) => String(item.id) === String(roomId)) || null
            )
        } catch (err) {
            setError(err?.message || t('voice.loadFailed'))
        } finally {
            setLoading(false)
        }
    }, [roomId])

    useEffect(() => {
        load()
    }, [load])

    const join = async () => {
        setBusy(true)
        setError('')
        setNotice('')

        try {
            const updated = await api.joinVoice(roomId)
            setRoom(updated)
            setNotice(
                t('voice.joined')
            )
        } catch (err) {
            setError(err?.message || t('voice.connectFailed'))
        } finally {
            setBusy(false)
        }
    }

    const leave = async () => {
        setBusy(true)
        setError('')
        setNotice('')

        try {
            await api.leaveVoice(roomId)
            await load()
            setNotice(t('voice.left'))
        } catch (err) {
            setError(err?.message || t('voice.leaveFailed'))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="app-layout">
            <NavigationRail />
            <Sidebar />

            <main className="main">
                <div className="main__content">
                    <PageHeader title={room?.name || t('voice.roomTitle')} />

                    {loading && <p className="muted">{t('common.loading')}</p>}
                    {error && <p className="auth-inline-error">{error}</p>}
                    {notice && <p className="form-notice">{notice}</p>}

                    {!loading && !error && !room && (
                        <EmptyState
                            title={t('voice.notFoundTitle')}
                            description={t('voice.notFoundDesc')}
                        />
                    )}

                    {!loading && !error && room && (
                        <section className="voice-room">
                            <div className="voice-room__status">
                                <span className="icon-placeholder" aria-hidden="true" />
                                <span>
                                    {t('voice.participantsCount', {
                                        count:
                                            room.members ??
                                            room.participants?.length ??
                                            0,
                                    })}
                                </span>
                            </div>

                            <p className="muted">
                                {t('voice.notice')}
                            </p>

                            <div className="voice-room__actions">
                                <button
                                    type="button"
                                    className="btn btn--primary"
                                    onClick={join}
                                    disabled={busy}
                                >
                                    {busy ? t('voice.connecting') : t('voice.connect')}
                                </button>

                                <button
                                    type="button"
                                    className="btn btn--ghost"
                                    onClick={leave}
                                    disabled={busy}
                                >
                                    {t('common.disconnect')}
                                </button>
                            </div>

                            <h2 className="section-title">{t('voice.rooms')}</h2>

                            {rooms.length === 0 ? (
                                <EmptyState
                                    title={t('voice.noRoomsTitle')}
                                    description={t('voice.noRoomsDesc')}
                                />
                            ) : (
                                <div className="space-channel-list">
                                    {rooms.map((item) => (
                                        <Link
                                            key={item.id}
                                            className="space-channel"
                                            to={`/app/voice/${item.id}`}
                                        >
                                            <span className="icon-placeholder" aria-hidden="true" />
                                            <span>{item.name}</span>
                                        </Link>
                                    ))}
                                </div>
                            )}

                            <h2 className="section-title">{t('voice.participants')}</h2>

                            {!room.participants?.length ? (
                                <p className="muted">
                                    {t('voice.noParticipantData')}
                                </p>
                            ) : (
                                <div className="friend-list">
                                    {room.participants.map((participant) => {
                                        const user = typeof participant === 'object'
                                            ? participant
                                            : { id: participant, name: '' }

                                        return (
                                            <div
                                                className="friend-row"
                                                key={user.id}
                                            >
                                                <Avatar
                                                    src={user.avatarUrl || user.avatar}
                                                    label={user.name}
                                                    size={40}
                                                />
                                                <span>
                                                    {user.displayName ||
                                                        user.name ||
                                                        t('common.user')}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </section>
                    )}
                </div>
            </main>

            <RightSidebar roomId={roomId} />
        </div>
    )
}