import { useEffect, useRef } from 'react'
import { useI18n } from '@/i18n'
import { useCall } from '@/context/CallContext'
import Avatar from '@/components/Avatar'
import Icon from '@/assets/icon/Icon.jsx'

function StreamVideo({ stream, muted }) {
    const ref = useRef(null)

    useEffect(() => {
        const element = ref.current

        if (!element) return undefined

        element.srcObject = stream
        element.play().catch(() => {})

        return () => {
            element.srcObject = null
        }
    }, [stream])

    return <video ref={ref} className="voice-tile__video" autoPlay playsInline muted={muted} />
}

export function CallControls({ variant = 'stage' }) {
    const { t } = useI18n()
    const {
        active, status, muted, deafened, sharing, camera,
        toggleMute, toggleDeafen, toggleScreen, toggleCamera, leave,
    } = useCall()

    if (!active) return null

    const isCall = active.kind === 'call'
    const ringing = status === 'ringing'

    return (
        <div className={`call-controls call-controls--${variant}`}>
            <button
                type="button"
                className={`call-controls__btn${muted ? ' is-off' : ''}`}
                onClick={toggleMute}
                disabled={deafened}
                title={muted ? t('voice.unmute') : t('voice.mute')}
                aria-label={muted ? t('voice.unmute') : t('voice.mute')}
                aria-pressed={muted}
            >
                <Icon name={muted ? 'mic-off' : 'mic'} />
            </button>

            <button
                type="button"
                className={`call-controls__btn${deafened ? ' is-off' : ''}`}
                onClick={toggleDeafen}
                title={deafened ? t('voice.undeafen') : t('voice.deafen')}
                aria-label={deafened ? t('voice.undeafen') : t('voice.deafen')}
                aria-pressed={deafened}
            >
                <Icon name={deafened ? 'headphones-off' : 'headphones'} />
            </button>

            {!ringing && (
                <button
                    type="button"
                    className={`call-controls__btn${sharing ? ' is-on' : ''}`}
                    onClick={toggleScreen}
                    title={sharing ? t('voice.stopShare') : t('voice.shareScreen')}
                    aria-label={sharing ? t('voice.stopShare') : t('voice.shareScreen')}
                    aria-pressed={sharing}
                >
                    <Icon name={sharing ? 'monitor-off' : 'monitor'} />
                </button>
            )}

            {variant === 'stage' && !ringing && (
                <button
                    type="button"
                    className={`call-controls__btn${camera ? ' is-on' : ''}`}
                    onClick={toggleCamera}
                    title={camera ? t('voice.cameraOff') : t('voice.camera')}
                    aria-label={camera ? t('voice.cameraOff') : t('voice.camera')}
                    aria-pressed={camera}
                >
                    <Icon name="video" />
                </button>
            )}

            <button
                type="button"
                className="call-controls__btn call-controls__btn--leave"
                onClick={leave}
                title={isCall ? t('call.end') : t('voice.leave')}
                aria-label={isCall ? t('call.end') : t('voice.leave')}
            >
                <Icon name="phone-off" />
            </button>
        </div>
    )
}

function Tile({ person, self, stream, speaking, focus }) {
    const { t } = useI18n()
    const { deafened } = useCall()
    const ref = useRef(null)
    const name = person.displayName || person.name || person.username || t('common.user')
    const showVideo = Boolean(stream) && (person.sharing || person.video)

    const fullscreen = () => {
        const el = ref.current

        if (!el) return

        if (document.fullscreenElement) document.exitFullscreen?.()
        else el.requestFullscreen?.()
    }

    return (
        <div
            ref={ref}
            className={[
                'voice-tile',
                speaking ? 'voice-tile--speaking' : '',
                focus ? 'voice-tile--focus' : '',
                showVideo ? 'voice-tile--video' : '',
            ].filter(Boolean).join(' ')}
        >
            {showVideo ? (
                <StreamVideo stream={stream} muted={self || deafened} />
            ) : (
                <Avatar src={person.avatarUrl || person.avatar} label={name} size={focus ? 96 : 72} />
            )}

            <div className="voice-tile__label">
                {person.muted && <Icon name="mic-off" className="voice-tile__flag" />}
                {person.sharing && <Icon name="monitor" className="voice-tile__flag" />}
                <span>{self ? `${name} (${t('voice.you')})` : name}</span>
            </div>

            {showVideo && (
                <button
                    type="button"
                    className="voice-tile__fullscreen"
                    onClick={fullscreen}
                    title={t('voice.fullscreen')}
                    aria-label={t('voice.fullscreen')}
                >
                    <Icon name="monitor" />
                </button>
            )}
        </div>
    )
}

export default function VoiceStage({ roomId }) {
    const { t } = useI18n()
    const { active, participants, remote, localVideo, speaking, myId, status } = useCall()

    if (!active || active.roomId !== roomId) return null

    const list = participants.length ? participants : []
    const sharer = list.find((p) => p.sharing || p.video)

    const streamFor = (person) => {
        const id = String(person.id)

        if (id === myId) return localVideo

        return (remote[id] || []).find((stream) => stream.getVideoTracks().length > 0) || null
    }

    return (
        <section className="voice-stage" aria-label={active.name}>
            {status === 'ringing' && (
                <p className="voice-stage__status">{t('call.calling', { name: active.name })}</p>
            )}

            {status === 'connecting' && (
                <p className="voice-stage__status">{t('call.connecting')}</p>
            )}

            {sharer && (
                <p className="voice-stage__status">
                    {t('voice.sharing', { name: sharer.displayName || sharer.name })}
                </p>
            )}

            <div className={`voice-stage__grid${sharer ? ' voice-stage__grid--focus' : ''}`}>
                {list.map((person) => (
                    <Tile
                        key={person.id}
                        person={person}
                        self={String(person.id) === myId}
                        stream={streamFor(person)}
                        speaking={Boolean(speaking[String(person.id)])}
                        focus={sharer ? sharer.id === person.id : false}
                    />
                ))}
            </div>

            <CallControls variant="stage" />
        </section>
    )
}
