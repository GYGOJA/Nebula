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
    const label = (text) => <span className="call-controls__label">{text}</span>

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
                {label(t('voice.lbl.mic'))}
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
                {label(t('voice.lbl.sound'))}
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
                    {label(t('voice.lbl.screen'))}
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
                    {label(t('voice.lbl.camera'))}
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
                {label(isCall ? t('voice.lbl.endCall') : t('voice.lbl.leave'))}
            </button>
        </div>
    )
}

function Tile({ person, self, stream, speaking, focus, small, ringing, compact }) {
    const { t } = useI18n()
    const { deafened } = useCall()
    const ref = useRef(null)
    const name = person.displayName || person.name || person.username || t('common.user')
    const showVideo = Boolean(stream) && (person.sharing || person.video)
    const avatarSize = small ? 44 : compact ? 56 : focus ? 96 : 84

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
                small ? 'voice-tile--small' : '',
                ringing ? 'voice-tile--ringing' : '',
                showVideo ? 'voice-tile--video' : '',
                showVideo && person.sharing ? 'voice-tile--screen' : '',
            ].filter(Boolean).join(' ')}
        >
            {showVideo ? (
                <StreamVideo stream={stream} muted={self || deafened} />
            ) : (
                <span className="voice-tile__avatar">
                    <Avatar src={person.avatarUrl || person.avatar} label={name} size={avatarSize} />
                </span>
            )}

            <div className="voice-tile__label">
                {person.muted && <Icon name="mic-off" className="voice-tile__flag" />}
                {person.sharing && <Icon name="monitor" className="voice-tile__flag voice-tile__flag--on" />}
                <span>{self ? `${name} (${t('voice.you')})` : name}</span>
            </div>

            {showVideo && !small && (
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

// `compact` is used when the stage sits above a direct-message conversation.
export default function VoiceStage({ roomId, compact = false }) {
    const { t } = useI18n()
    const { active, participants, remote, localVideo, speaking, myId, status } = useCall()

    if (!active || active.roomId !== roomId) return null

    let list = participants.length ? participants : []
    const sharer = list.find((p) => p.sharing || p.video)

    // While a call is still ringing, show who is being called instead of only yourself.
    const ringingPeer = active.kind === 'call' && status === 'ringing' && active.peer
        && !list.some((p) => String(p.id) !== myId)
        ? active.peer
        : null

    if (ringingPeer) list = [{ ...ringingPeer, id: ringingPeer.id, __ringing: true }, ...list]

    const streamFor = (person) => {
        const id = String(person.id)

        if (id === myId) return localVideo

        return (remote[id] || []).find((stream) => stream.getVideoTracks().length > 0) || null
    }

    const renderTile = (person, extra = {}) => (
        <Tile
            key={person.id}
            person={person}
            self={String(person.id) === myId}
            stream={streamFor(person)}
            speaking={Boolean(speaking[String(person.id)])}
            ringing={Boolean(person.__ringing)}
            compact={compact}
            {...extra}
        />
    )

    const statusText = status === 'ringing'
        ? t('call.calling', { name: active.name })
        : status === 'connecting'
            ? t('call.connecting')
            : sharer
                ? t('voice.sharing', { name: sharer.displayName || sharer.name })
                : ''

    return (
        <section
            className={`voice-stage${compact ? ' voice-stage--compact' : ''}${sharer ? ' voice-stage--focus' : ''}`}
            aria-label={active.name}
        >
            {statusText && (
                <p className={`voice-stage__status${status === 'ringing' ? ' is-ringing' : ''}`}>
                    <i aria-hidden="true" />
                    {statusText}
                </p>
            )}

            <div className="voice-stage__body">
                {sharer ? (
                    <>
                        <div className="voice-stage__main">
                            {renderTile(sharer, { focus: true })}
                        </div>

                        {list.length > 1 && (
                            <div className="voice-stage__strip">
                                {list
                                    .filter((person) => person.id !== sharer.id)
                                    .map((person) => renderTile(person, { small: true }))}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="voice-stage__grid" data-count={Math.min(list.length, 7)}>
                        {list.map((person) => renderTile(person))}
                    </div>
                )}
            </div>

            <CallControls variant="stage" />
        </section>
    )
}
