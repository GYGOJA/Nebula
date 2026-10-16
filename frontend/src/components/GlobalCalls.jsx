import { useCallback, useEffect, useRef, useState } from 'react'
import Avatar from '@/components/Avatar'
import Icon from '@/assets/icon/Icon.jsx'
import StreamTile from '@/components/StreamTile'
import useVoiceSession from '@/hooks/useVoiceSession'
import { api } from '@/api'

function peerInfo(call) {
    return call?.peer || call?.user || call?.participant || {}
}

function ActiveCallPanel({ call, onEnd }) {
    const voice = useVoiceSession(call.roomId || call.id)
    const joinedCallRef = useRef('')
    const peer = peerInfo(call)
    const peerId = String(peer.id || peer.userId || (call.callerId === call.userId ? call.calleeId : call.callerId) || '')

    useEffect(() => {
        const callKey = String(call.id || '')
        if (!callKey || call.callState !== 'active' || joinedCallRef.current === callKey) return
        joinedCallRef.current = callKey
        voice.join({ video: Boolean(call.video) }).catch(() => {})
    }, [call.id, call.callState])

    const handleEnd = async () => {
        await onEnd(call)
    }

    const participantsById = Object.fromEntries(voice.participants.map((participant) => [String(participant.id || participant.userId), participant]))
    const tiles = Object.entries(voice.remoteStreams).map(([id, stream]) => {
        const peerId = id.includes('::') ? id.slice(0, id.indexOf('::')) : id
        const participant = participantsById[peerId] || peer
        const sharing = Boolean(participant.sharing && stream.getVideoTracks().length && !stream.getAudioTracks().length)
        return { id, stream, participant, sharing }
    })
    const localHasVideo = voice.localStream?.getVideoTracks().some((track) => track.readyState === 'live')

    return (
        <div className="call-overlay">
            <section className="call-panel" role="dialog" aria-modal="true" aria-label="Звонок">
                <header className="call-panel__header">
                    <Avatar src={peer.avatarUrl || peer.avatar} label={peer.displayName || peer.name || peer.username} size={42} />
                    <div className="call-panel__identity">
                        <strong>{peer.displayName || peer.name || peer.username || 'Звонок'}</strong>
                        <span>{voice.joining ? 'Подключение…' : voice.joined ? 'Соединение установлено' : 'Подключаем аудио и видео'}</span>
                    </div>
                    {call.video && <span className="call-type"><Icon name="video" /> Видеозвонок</span>}
                </header>
                {voice.error && <p className="auth-inline-error call-panel__error">{voice.error}</p>}
                <div className={`call-stage ${call.video || tiles.some((tile) => tile.stream.getVideoTracks().length) ? 'call-stage--video' : ''}`}>
                    {localHasVideo ? (
                        <StreamTile stream={voice.localStream} label="Вы" local />
                    ) : (
                        <div className="call-person">
                            <Avatar src={undefined} label="Вы" size={76} />
                            <span>Вы</span>
                        </div>
                    )}
                    {tiles.map(({ id, stream, participant, sharing }) => (
                        <StreamTile
                            key={id}
                            stream={stream}
                            label={participant.displayName || participant.name || participant.username || 'Участник'}
                            avatar={participant.avatarUrl || participant.avatar}
                            muted={voice.deafened}
                            sharing={sharing}
                        />
                    ))}
                    {!tiles.length && (
                        <div className="call-stage__waiting">
                            <span className="call-stage__pulse" />
                            <span>{voice.joined ? 'Ожидаем подключение собеседника…' : 'Подключаемся к звонку…'}</span>
                        </div>
                    )}
                    {voice.screenStream && <StreamTile stream={voice.screenStream} label="Ваш экран" local sharing />}
                </div>
                <div className="call-controls">
                    <button type="button" className={`call-control ${voice.muted ? 'call-control--active' : ''}`} onClick={voice.toggleMute} disabled={!voice.joined} title={voice.muted ? 'Включить микрофон' : 'Выключить микрофон'}><Icon name={voice.muted ? 'mic-off' : 'mic'} /><span>{voice.muted ? 'Включить микрофон' : 'Микрофон'}</span></button>
                    <button type="button" className={`call-control ${voice.deafened ? 'call-control--active' : ''}`} onClick={voice.toggleDeafen} disabled={!voice.joined} title={voice.deafened ? 'Включить звук' : 'Выключить звук'}><Icon name={voice.deafened ? 'volume-off' : 'volume-2'} /><span>{voice.deafened ? 'Включить звук' : 'Звук'}</span></button>
                    <button type="button" className={`call-control ${voice.sharing ? 'call-control--active' : ''}`} onClick={() => (voice.sharing ? voice.stopScreenShare() : voice.startScreenShare().catch((error) => voice.setError(error?.message || 'Не удалось запустить демонстрацию экрана')))} disabled={!voice.joined} title={voice.sharing ? 'Остановить демонстрацию' : 'Демонстрация экрана'}><Icon name="monitor" /><span>{voice.sharing ? 'Остановить экран' : 'Экран'}</span></button>
                    {call.video && <button type="button" className={`call-control ${voice.cameraEnabled ? '' : 'call-control--active'}`} onClick={() => voice.toggleCamera().catch((error) => voice.setError(error?.message || 'Не удалось переключить камеру'))} disabled={!voice.joined} title={voice.cameraEnabled ? 'Выключить камеру' : 'Включить камеру'}><Icon name="video" /><span>{voice.cameraEnabled ? 'Камера' : 'Включить камеру'}</span></button>}
                    <button type="button" className="call-control call-control--end" onClick={handleEnd} title="Завершить звонок"><Icon name="phone-off" /><span>Завершить</span></button>
                </div>
            </section>
        </div>
    )
}

export default function GlobalCalls() {
    const [incoming, setIncoming] = useState(null)
    const [activeCall, setActiveCall] = useState(null)
    const [error, setError] = useState('')
    const acceptedIdsRef = useRef(new Set())
    const busyRef = useRef(false)

    useEffect(() => {
        const onRealtime = (event) => {
            const { type, data } = event.detail || {}
            if (type === 'call_incoming') {
                setIncoming(data?.call || null)
                setError('')
            }
            if (type === 'call_accepted') {
                const id = String(data?.id || data?.roomId || '')
                if (id) acceptedIdsRef.current.add(id)
                setActiveCall((previous) => previous && String(previous.id) === id
                    ? { ...previous, callState: 'active', active: true }
                    : previous)
            }
            if (type === 'call_handled') {
                const id = String(data?.id || '')
                setIncoming((previous) => previous && String(previous.id) === id ? null : previous)
            }
            if (type === 'call_ended') {
                const id = String(data?.id || data?.roomId || '')
                setIncoming((previous) => previous && String(previous.id) === id ? null : previous)
                setActiveCall((previous) => previous && String(previous.id) === id ? null : previous)
            }
        }
        const onStartCall = async (event) => {
            const detail = event.detail || {}
            if (!detail.userId || busyRef.current || activeCall || incoming) return
            busyRef.current = true
            setError('')
            try {
                const result = await api.startCall(detail.userId, Boolean(detail.video))
                setActiveCall({ ...result, peer: result.peer || detail.peer, outgoing: true, callState: acceptedIdsRef.current.has(String(result.id)) ? 'active' : 'ringing' })
            } catch (callError) {
                setError(callError?.message || 'Не удалось начать звонок')
                window.setTimeout(() => setError(''), 6000)
            } finally {
                busyRef.current = false
            }
        }
        window.addEventListener('nebula:event', onRealtime)
        window.addEventListener('nebula:start-call', onStartCall)
        return () => {
            window.removeEventListener('nebula:event', onRealtime)
            window.removeEventListener('nebula:start-call', onStartCall)
        }
    }, [activeCall, incoming])

    useEffect(() => {
        let alive = true
        api.getPendingCalls().then((result) => {
            if (!alive) return
            if (Array.isArray(result?.incoming) && result.incoming.length) setIncoming(result.incoming[0])
            if (result?.active) setActiveCall({ ...result.active, callState: 'active' })
        }).catch(() => {})
        return () => { alive = false }
    }, [])

    const accept = async () => {
        if (!incoming) return
        const current = incoming
        try {
            const result = await api.acceptCall(current.id)
            setIncoming(null)
            setActiveCall({ ...result, peer: result.peer || current.peer, callState: 'active', outgoing: false })
        } catch (callError) {
            setError(callError?.message || 'Не удалось принять звонок')
        }
    }

    const decline = async () => {
        if (!incoming) return
        try {
            await api.declineCall(incoming.id)
        } catch (callError) {
            setError(callError?.message || 'Не удалось отклонить звонок')
        } finally {
            setIncoming(null)
        }
    }

    const cancel = async (call) => {
        try {
            await api.cancelCall(call.id)
        } catch (callError) {
            setError(callError?.message || 'Не удалось отменить звонок')
        } finally {
            setActiveCall(null)
        }
    }

    const end = async (call) => {
        try {
            await api.endCall(call.id)
        } catch (callError) {
            setError(callError?.message || 'Не удалось завершить звонок')
        } finally {
            setActiveCall(null)
        }
    }

    const peer = peerInfo(incoming)

    return (
        <>
            {error && !activeCall && <div className="call-toast" role="alert">{error}<button type="button" onClick={() => setError('')}><Icon name="x" /></button></div>}
            {incoming && !activeCall && (
                <div className="call-overlay">
                    <section className="incoming-call" role="dialog" aria-modal="true" aria-label="Входящий звонок">
                        <div className="incoming-call__avatar"><Avatar src={peer.avatarUrl || peer.avatar} label={peer.displayName || peer.name || peer.username} size={78} /><span className="incoming-call__pulse" /></div>
                        <p className="incoming-call__eyebrow">Входящий {incoming.video ? 'видеозвонок' : 'звонок'}</p>
                        <h2>{peer.displayName || peer.name || peer.username || 'Пользователь Nebula'}</h2>
                        <p className="muted">Вас приглашают к разговору</p>
                        <div className="incoming-call__actions">
                            <button type="button" className="call-answer" onClick={accept}><Icon name="phone" /> Принять</button>
                            <button type="button" className="call-decline" onClick={decline}><Icon name="phone-off" /> Отклонить</button>
                        </div>
                    </section>
                </div>
            )}
            {activeCall?.callState === 'ringing' && (
                <div className="call-overlay">
                    <section className="incoming-call outgoing-call" role="dialog" aria-modal="true" aria-label="Исходящий звонок">
                        <div className="incoming-call__avatar"><Avatar src={peerInfo(activeCall).avatarUrl || peerInfo(activeCall).avatar} label={peerInfo(activeCall).displayName || peerInfo(activeCall).name} size={78} /><span className="incoming-call__pulse" /></div>
                        <p className="incoming-call__eyebrow">Исходящий {activeCall.video ? 'видеозвонок' : 'звонок'}</p>
                        <h2>{peerInfo(activeCall).displayName || peerInfo(activeCall).name || peerInfo(activeCall).username || 'Пользователь Nebula'}</h2>
                        <p className="muted">Ожидание ответа…</p>
                        <div className="incoming-call__actions"><button type="button" className="call-decline" onClick={() => cancel(activeCall)}><Icon name="phone-off" /> Отменить</button></div>
                    </section>
                </div>
            )}
            {activeCall?.callState === 'active' && <ActiveCallPanel key={activeCall.id} call={activeCall} onEnd={end} />}
        </>
    )
}
