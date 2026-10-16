import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import SpaceChannelSidebar from '@/components/SpaceChannelSidebar'
import SpaceMembersSidebar from '@/components/SpaceMembersSidebar'
import SpaceNavButton from '@/components/SpaceNavButton'
import VoiceStage from '@/components/VoiceStage'
import Avatar from '@/components/Avatar'
import Icon from '@/assets/icon/Icon.jsx'
import { api } from '@/api'
import { useI18n } from '@/i18n'
import { useCall } from '@/context/CallContext'
import { useAppEvent } from '@/hooks/useAppEvent'

export default function VoiceRoom() {
    const { t } = useI18n()
    const { roomId } = useParams()
    const navigate = useNavigate()
    const { active, status, roomsLive, join } = useCall()
    const [room, setRoom] = useState(null)
    const [space, setSpace] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        setError('')

        try {
            const result = await api.getVoiceRoom(roomId)

            setRoom(result)

            if (result.spaceId) {
                try {
                    setSpace(await api.getSpace(result.spaceId))
                } catch {
                    setSpace(null)
                }
            }
        } catch (err) {
            setError(err?.message || t('voice.loadFailed'))
        } finally {
            setLoading(false)
        }
    }, [roomId])

    useEffect(() => {
        load()
    }, [load])

    // Roles or channel access changed: leave this room if access was taken away.
    useAppEvent(['space_updated', 'space_deleted'], async () => {
        try {
            const result = await api.getVoiceRoom(roomId)

            if (result?.spaceId) setSpace(await api.getSpace(result.spaceId))
        } catch {
            navigate(room?.spaceId ? `/app/spaces/${room.spaceId}` : '/app', { replace: true })
        }
    })

    if (room?.kind === 'call') return <Navigate to="/app/dm" replace />

    const connected = active?.roomId === roomId
    const people = roomsLive[roomId] || room?.participants || []

    const connect = async () => {
        setBusy(true)

        await join(roomId, { name: room?.name })

        setBusy(false)
    }

    return (
        <div className="app-layout app-layout--space">
            {room?.spaceId ? (
                <SpaceChannelSidebar spaceId={room.spaceId} activeChannelId={roomId} spaceName={space?.name} />
            ) : (
                <div />
            )}

            <main className="chat chat--space voice-page">
                <header className="chat__header">
                    {room?.spaceId && <SpaceNavButton />}
                    <div className="chat__title-wrap">
                        <div className="chat__title">
                            <Icon name="volume-2" className="voice-page__icon" /> {room?.name || t('voice.roomTitle')}
                        </div>
                        <div className="chat__sub">{t('voice.participantsCount', { count: people.length })}</div>
                    </div>
                </header>

                <div className="voice-page__body">
                    {loading && <p className="muted">{t('common.loading')}</p>}
                    {!loading && error && <p className="auth-inline-error">{error}</p>}

                    {!loading && !error && connected && <VoiceStage roomId={roomId} />}

                    {!loading && !error && !connected && (
                        <div className="voice-join">
                            <div className="voice-join__card">
                                <span className="voice-join__icon"><Icon name="volume-2" /></span>
                                <h2 className="voice-join__title">{room?.name || t('voice.roomTitle')}</h2>
                                <p className="voice-join__sub">
                                    {people.length === 0
                                        ? t('voice.empty')
                                        : t('voice.participantsCount', { count: people.length })}
                                </p>

                                {people.length > 0 && (
                                    <div className="voice-join__people">
                                        {people.map((person) => (
                                            <div key={person.id} className="voice-join__person">
                                                <Avatar
                                                    src={person.avatarUrl || person.avatar}
                                                    label={person.displayName || person.name}
                                                    size={52}
                                                />
                                                <span>{person.displayName || person.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <button
                                    type="button"
                                    className="btn btn--primary"
                                    onClick={connect}
                                    disabled={busy || status === 'connecting'}
                                >
                                    {busy ? t('voice.connecting') : t('voice.joinRoom')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <SpaceMembersSidebar space={space} channelId={roomId} />
        </div>
    )
}
