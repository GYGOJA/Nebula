import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api'
import { USE_MOCK } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/i18n'
import { useNotifications } from '@/context/NotificationsContext'
import CallOverlay from '@/components/CallOverlay'

const CallCtx = createContext(null)

const SPEAKING_THRESHOLD = 14
const NOTICE_MS = 4500

function toDescription(description) {
    return { type: description.type, sdp: description.sdp }
}

function hasVideo(stream) {
    return stream.getVideoTracks().length > 0
}

function RemoteAudio({ stream, muted }) {
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

    return <audio ref={ref} autoPlay muted={muted} />
}

export function CallProvider({ children }) {
    const { user } = useAuth()
    const { t } = useI18n()
    const navigate = useNavigate()
    const { subscribe } = useNotifications()

    const myId = user?.id ? String(user.id) : ''

    const [active, setActive] = useState(null)
    const [status, setStatus] = useState('idle')
    const [participants, setParticipants] = useState([])
    const [roomsLive, setRoomsLive] = useState({})
    const [incoming, setIncoming] = useState(null)
    const [muted, setMuted] = useState(false)
    const [deafened, setDeafened] = useState(false)
    const [sharing, setSharing] = useState(false)
    const [camera, setCamera] = useState(false)
    const [localVideo, setLocalVideo] = useState(null)
    const [remote, setRemote] = useState({})
    const [speaking, setSpeaking] = useState({})
    const [notice, setNotice] = useState('')
    const [, setTick] = useState(0)

    const activeRef = useRef(null)
    const incomingRef = useRef(null)
    const pcsRef = useRef(new Map())
    const micRef = useRef(null)
    const videoRef = useRef(null)
    const iceRef = useRef([])
    const mutedRef = useRef(false)
    const deafenedRef = useRef(false)
    const mutedBeforeDeafenRef = useRef(false)
    const joinedAtRef = useRef(0)
    const statusRef = useRef('idle')
    const metersRef = useRef(new Map())
    const audioCtxRef = useRef(null)
    const meterTimerRef = useRef(null)
    const ringTimerRef = useRef(null)
    const noticeTimerRef = useRef(null)
    const tRef = useRef(t)
    const handlersRef = useRef({})

    useEffect(() => {
        tRef.current = t
    }, [t])

    const bump = useCallback(() => setTick((n) => n + 1), [])

    const updateStatus = useCallback((value) => {
        statusRef.current = value
        setStatus(value)
    }, [])

    const showNotice = useCallback((text) => {
        setNotice(text)
        clearTimeout(noticeTimerRef.current)
        noticeTimerRef.current = setTimeout(() => setNotice(''), NOTICE_MS)
    }, [])

    const stopRing = useCallback(() => {
        clearInterval(ringTimerRef.current)
        ringTimerRef.current = null
    }, [])

    const startRing = useCallback(() => {
        stopRing()

        const play = () => {
            try {
                const Ctx = window.AudioContext || window.webkitAudioContext

                if (!Ctx) return

                audioCtxRef.current = audioCtxRef.current || new Ctx()

                const ctx = audioCtxRef.current

                if (ctx.state === 'suspended') ctx.resume()

                const now = ctx.currentTime
                const gain = ctx.createGain()
                gain.connect(ctx.destination)
                gain.gain.setValueAtTime(0.0001, now)
                gain.gain.exponentialRampToValueAtTime(0.18, now + 0.03)
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9)

                ;[440, 554].forEach((freq, i) => {
                    const osc = ctx.createOscillator()
                    osc.type = 'sine'
                    osc.frequency.value = freq
                    osc.connect(gain)
                    osc.start(now + i * 0.32)
                    osc.stop(now + i * 0.32 + 0.3)
                })
            } catch {
                return
            }
        }

        play()
        ringTimerRef.current = setInterval(play, 2000)
    }, [stopRing])

    const getAudioContext = () => {
        const Ctx = window.AudioContext || window.webkitAudioContext

        if (!Ctx) return null

        audioCtxRef.current = audioCtxRef.current || new Ctx()

        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()

        return audioCtxRef.current
    }

    const watchStream = useCallback((key, stream) => {
        if (!stream.getAudioTracks().length) return

        const existing = metersRef.current.get(key)

        if (existing && existing.streamId === stream.id) return

        const ctx = getAudioContext()

        if (!ctx) return

        try {
            const source = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
            const analyser = ctx.createAnalyser()
            analyser.fftSize = 256
            source.connect(analyser)
            metersRef.current.set(key, {
                streamId: stream.id,
                source,
                analyser,
                data: new Uint8Array(analyser.frequencyBinCount),
            })
        } catch {
            return
        }

        if (meterTimerRef.current) return

        meterTimerRef.current = setInterval(() => {
            const next = {}

            metersRef.current.forEach((meter, id) => {
                meter.analyser.getByteFrequencyData(meter.data)

                let sum = 0
                for (let i = 0; i < meter.data.length; i += 1) sum += meter.data[i]

                if (sum / meter.data.length > SPEAKING_THRESHOLD) next[id] = true
            })

            if (mutedRef.current) delete next[myId]

            setSpeaking((prev) => {
                const prevKeys = Object.keys(prev)
                const nextKeys = Object.keys(next)

                if (prevKeys.length === nextKeys.length && nextKeys.every((k) => prev[k])) {
                    return prev
                }

                return next
            })
        }, 200)
    }, [myId])

    const unwatchStream = useCallback((key) => {
        const meter = metersRef.current.get(key)

        if (!meter) return

        try {
            meter.source.disconnect()
        } catch {
            return
        } finally {
            metersRef.current.delete(key)
        }
    }, [])

    const stopMeters = useCallback(() => {
        Array.from(metersRef.current.keys()).forEach(unwatchStream)
        clearInterval(meterTimerRef.current)
        meterTimerRef.current = null
        setSpeaking({})
    }, [unwatchStream])

    const sendSignal = useCallback((entry, userId, type, data) => {
        const cur = activeRef.current

        if (!cur) return

        entry.queue = entry.queue
            .then(() => api.sendVoiceSignal(cur.roomId, { to: userId, type, data }))
            .catch(() => {})
    }, [])

    const addRemote = useCallback((userId, stream) => {
        setRemote((map) => {
            const list = map[userId] || []

            if (list.some((item) => item.id === stream.id)) return map

            return { ...map, [userId]: [...list, stream] }
        })

        watchStream(userId, stream)
    }, [watchStream])

    const removePeer = useCallback((userId) => {
        const entry = pcsRef.current.get(userId)

        if (entry) {
            try {
                entry.pc.close()
            } catch {
                pcsRef.current.delete(userId)
            }

            pcsRef.current.delete(userId)
        }

        unwatchStream(userId)

        setRemote((map) => {
            if (!map[userId]) return map

            const next = { ...map }
            delete next[userId]

            return next
        })
    }, [unwatchStream])

    const createPeer = useCallback((userId) => {
        const existing = pcsRef.current.get(userId)

        if (existing) return existing

        const pc = new RTCPeerConnection({ iceServers: iceRef.current })
        const entry = {
            pc,
            polite: myId < userId,
            makingOffer: false,
            ignoreOffer: false,
            pending: [],
            queue: Promise.resolve(),
            chain: Promise.resolve(),
            videoSenders: [],
        }

        pcsRef.current.set(userId, entry)

        if (micRef.current) {
            micRef.current.getAudioTracks().forEach((track) => pc.addTrack(track, micRef.current))
        }

        if (videoRef.current) {
            const { stream } = videoRef.current
            entry.videoSenders = stream.getTracks().map((track) => pc.addTrack(track, stream))
        }

        pc.onicecandidate = (event) => {
            if (event.candidate) sendSignal(entry, userId, 'candidate', event.candidate.toJSON())
        }

        pc.onnegotiationneeded = async () => {
            try {
                entry.makingOffer = true
                await pc.setLocalDescription()
                sendSignal(entry, userId, 'offer', toDescription(pc.localDescription))
            } catch {
                return
            } finally {
                entry.makingOffer = false
            }
        }

        pc.ontrack = (event) => {
            const stream = event.streams[0] || new MediaStream([event.track])

            addRemote(userId, stream)

            event.track.onmute = bump
            event.track.onunmute = bump
            event.track.onended = bump
            stream.onremovetrack = bump
            stream.onaddtrack = bump
        }

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') {
                if (statusRef.current !== 'ringing') updateStatus('connected')
            }

            if (pc.connectionState === 'failed') pc.restartIce()
        }

        return entry
    }, [myId, sendSignal, addRemote, bump, updateStatus])

    const handleSignal = useCallback((data) => {
        const cur = activeRef.current

        if (!cur || cur.roomId !== data.roomId) return

        const from = String(data.from)
        const entry = createPeer(from)
        const { pc } = entry

        entry.chain = entry.chain.then(async () => {
            try {
                if (data.type === 'candidate') {
                    if (!pc.remoteDescription) {
                        entry.pending.push(data.data)
                        return
                    }

                    await pc.addIceCandidate(data.data).catch(() => {})

                    return
                }

                const collision =
                    data.type === 'offer' &&
                    (entry.makingOffer || pc.signalingState !== 'stable')

                entry.ignoreOffer = !entry.polite && collision

                if (entry.ignoreOffer) return

                await pc.setRemoteDescription(data.data)

                const queued = entry.pending.splice(0)

                for (const candidate of queued) {
                    await pc.addIceCandidate(candidate).catch(() => {})
                }

                if (data.type === 'offer') {
                    await pc.setLocalDescription()
                    sendSignal(entry, from, 'answer', toDescription(pc.localDescription))
                }
            } catch {
                return
            }
        })
    }, [createPeer, sendSignal])

    const stopStream = (stream) => {
        if (stream) stream.getTracks().forEach((track) => track.stop())
    }

    const teardown = useCallback(() => {
        Array.from(pcsRef.current.keys()).forEach(removePeer)

        stopStream(micRef.current)
        micRef.current = null

        if (videoRef.current) stopStream(videoRef.current.stream)
        videoRef.current = null

        stopMeters()

        activeRef.current = null
        mutedRef.current = false
        deafenedRef.current = false

        setActive(null)
        setParticipants([])
        setRemote({})
        setMuted(false)
        setDeafened(false)
        setSharing(false)
        setCamera(false)
        setLocalVideo(null)
        updateStatus('idle')
    }, [removePeer, stopMeters, updateStatus])

    const acquireMic = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        })

        micRef.current = stream

        return stream
    }

    const leave = useCallback(async () => {
        const cur = activeRef.current
        const wasRinging = statusRef.current === 'ringing'

        teardown()

        if (!cur) return

        try {
            if (cur.callId) {
                if (wasRinging) await api.cancelCall(cur.callId)
                else await api.endCall(cur.callId)
            } else {
                await api.leaveVoice(cur.roomId)
            }
        } catch {
            return
        }
    }, [teardown])

    const join = useCallback(async (roomId, meta = {}) => {
        if (activeRef.current?.roomId === roomId) return true

        if (activeRef.current) await leave()

        updateStatus('connecting')

        try {
            const stream = await acquireMic()
            watchStream(myId, stream)
        } catch {
            teardown()
            showNotice(tRef.current('voice.micFailed'))

            return false
        }

        try {
            const result = await api.joinVoice(roomId, { muted: false, video: false })

            iceRef.current = result.iceServers || []
            joinedAtRef.current = Date.now()

            const room = result.room || {}
            const next = {
                roomId,
                kind: room.kind || 'channel',
                name: meta.name || room.name || '',
                peer: meta.peer || null,
                callId: meta.callId || null,
                spaceId: room.spaceId || null,
                video: Boolean(meta.video),
            }

            activeRef.current = next
            setActive(next)
            setParticipants(room.participants || [])

            ;(result.peers || []).forEach((id) => createPeer(String(id)))

            if (next.kind === 'call' && !(result.peers || []).length) updateStatus('ringing')
            else if (next.kind === 'channel') updateStatus('connected')
            else updateStatus('connecting')

            return true
        } catch (err) {
            teardown()
            showNotice(err?.message || tRef.current('voice.connectFailed'))

            return false
        }
    }, [leave, teardown, updateStatus, watchStream, myId, createPeer, showNotice])

    const pushState = useCallback((patch) => {
        const cur = activeRef.current

        if (cur) api.setVoiceState(cur.roomId, patch).catch(() => {})
    }, [])

    const applyMute = useCallback((value) => {
        mutedRef.current = value
        setMuted(value)

        if (micRef.current) {
            micRef.current.getAudioTracks().forEach((track) => {
                track.enabled = !value
            })
        }
    }, [])

    const toggleMute = useCallback(() => {
        if (deafenedRef.current) return

        const value = !mutedRef.current

        applyMute(value)
        pushState({ muted: value })
    }, [applyMute, pushState])

    const toggleDeafen = useCallback(() => {
        const value = !deafenedRef.current

        deafenedRef.current = value
        setDeafened(value)

        if (value) {
            mutedBeforeDeafenRef.current = mutedRef.current
            applyMute(true)
            pushState({ deafened: true, muted: true })
        } else {
            const restore = mutedBeforeDeafenRef.current

            applyMute(restore)
            pushState({ deafened: false, muted: restore })
        }
    }, [applyMute, pushState])

    const attachVideo = useCallback((stream, kind) => {
        if (videoRef.current) {
            pcsRef.current.forEach((entry) => {
                entry.videoSenders.forEach((sender) => {
                    try {
                        entry.pc.removeTrack(sender)
                    } catch {
                        return
                    }
                })
                entry.videoSenders = []
            })

            stopStream(videoRef.current.stream)
        }

        videoRef.current = stream ? { stream, kind } : null

        if (stream) {
            pcsRef.current.forEach((entry) => {
                entry.videoSenders = stream.getTracks().map((track) => entry.pc.addTrack(track, stream))
            })

            const [track] = stream.getVideoTracks()

            if (track) {
                track.onended = () => {
                    if (videoRef.current?.stream === stream) {
                        attachVideo(null, null)
                        setSharing(false)
                        setCamera(false)
                        setLocalVideo(null)
                        pushState({ sharing: false, video: false })
                    }
                }
            }
        }

        setLocalVideo(stream)
    }, [pushState])

    const toggleScreen = useCallback(async () => {
        if (!activeRef.current) return

        if (videoRef.current?.kind === 'screen') {
            attachVideo(null, null)
            setSharing(false)
            pushState({ sharing: false, video: false })

            return
        }

        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 30 },
                audio: true,
            })

            attachVideo(stream, 'screen')
            setSharing(true)
            setCamera(false)
            pushState({ sharing: true, video: false })
        } catch (err) {
            if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') {
                showNotice(tRef.current('voice.screenFailed'))
            }
        }
    }, [attachVideo, pushState, showNotice])

    const toggleCamera = useCallback(async () => {
        if (!activeRef.current) return

        if (videoRef.current?.kind === 'camera') {
            attachVideo(null, null)
            setCamera(false)
            pushState({ video: false })

            return
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            })

            attachVideo(stream, 'camera')
            setCamera(true)
            setSharing(false)
            pushState({ video: true, sharing: false })
        } catch {
            showNotice(tRef.current('voice.cameraFailed'))
        }
    }, [attachVideo, pushState, showNotice])

    const startCall = useCallback(async (peer, video = false) => {
        if (!peer?.id || activeRef.current) return

        try {
            const call = await api.startCall(String(peer.id), video)
            const name = peer.displayName || peer.name || ''
            const ok = await join(call.roomId, { callId: call.id, peer, name, video })

            if (!ok) {
                await api.cancelCall(call.id).catch(() => {})

                return
            }

            if (video) await toggleCamera()
        } catch (err) {
            showNotice(err?.message || tRef.current('call.failed'))
        }
    }, [join, toggleCamera, showNotice])

    const acceptIncoming = useCallback(async () => {
        const call = incomingRef.current

        if (!call) return

        incomingRef.current = null
        setIncoming(null)
        stopRing()

        try {
            await api.acceptCall(call.id)
        } catch (err) {
            showNotice(err?.message || tRef.current('call.acceptFailed'))

            return
        }

        const name = call.peer?.displayName || call.peer?.name || ''
        const ok = await join(call.roomId, { callId: call.id, peer: call.peer, name, video: call.video })

        if (!ok) {
            api.endCall(call.id).catch(() => {})

            return
        }

        navigate(`/app/dm/${call.peer.id}`)

        if (call.video) toggleCamera()
    }, [join, navigate, stopRing, showNotice, toggleCamera])

    const declineIncoming = useCallback(async () => {
        const call = incomingRef.current

        if (!call) return

        incomingRef.current = null
        setIncoming(null)
        stopRing()

        await api.declineCall(call.id).catch(() => {})
    }, [stopRing])

    const setIncomingCall = useCallback((call) => {
        incomingRef.current = call
        setIncoming(call)

        if (call) startRing()
        else stopRing()
    }, [startRing, stopRing])

    const endedMessage = (reason) => {
        const tr = tRef.current

        switch (reason) {
            case 'declined': return tr('call.declined')
            case 'missed': return tr('call.missed')
            case 'cancelled': return tr('call.cancelled')
            default: return tr('call.ended')
        }
    }

    handlersRef.current = {
        onEvent(event) {
            const data = event.data || {}

            switch (event.type) {
                case 'voice_state': {
                    setRoomsLive((map) => ({ ...map, [data.roomId]: data.participants || [] }))

                    const cur = activeRef.current

                    if (!cur || cur.roomId !== data.roomId) return

                    const list = data.participants || []
                    const ids = new Set(list.map((p) => String(p.id)))

                    setParticipants(list)

                    Array.from(pcsRef.current.keys()).forEach((id) => {
                        if (!ids.has(id)) removePeer(id)
                    })

                    if (!ids.has(myId) && Date.now() - joinedAtRef.current > 3000) teardown()

                    return
                }

                case 'voice_signal':
                    handleSignal(data)

                    return

                case 'call_incoming': {
                    const call = data.call

                    if (!call || activeRef.current) {
                        if (call) api.declineCall(call.id).catch(() => {})

                        return
                    }

                    setIncomingCall({
                        id: call.id,
                        roomId: call.roomId,
                        video: call.video,
                        peer: call.peer,
                    })

                    return
                }

                case 'call_accepted':
                    if (activeRef.current?.callId === data.id) updateStatus('connecting')

                    return

                case 'call_handled':
                    if (incomingRef.current?.id === data.id) setIncomingCall(null)

                    return

                case 'call_ended': {
                    if (incomingRef.current?.id === data.id) {
                        setIncomingCall(null)
                        showNotice(endedMessage(data.reason))
                    }

                    if (activeRef.current?.callId === data.id) {
                        teardown()
                        showNotice(endedMessage(data.reason))
                    }

                    return
                }

                case 'reconnected':
                    resync()

                    return

                default:
            }
        },
    }

    const resync = useCallback(async () => {
        try {
            const pending = await api.getPendingCalls()

            if (!incomingRef.current && !activeRef.current && pending?.incoming?.length) {
                const call = pending.incoming[0]

                setIncomingCall({ id: call.id, roomId: call.roomId, video: call.video, peer: call.peer })
            }

            const cur = activeRef.current

            if (cur) {
                const room = await api.getVoiceRoom(cur.roomId)
                const ids = new Set((room.participants || []).map((p) => String(p.id)))

                if (!ids.has(myId) && Date.now() - joinedAtRef.current > 3000) teardown()
            }
        } catch {
            return
        }
    }, [myId, setIncomingCall, teardown])

    useEffect(() => {
        if (USE_MOCK || !myId) return undefined

        return subscribe((event) => handlersRef.current.onEvent(event))
    }, [subscribe, myId])

    useEffect(() => {
        if (USE_MOCK || !myId) return undefined

        let alive = true

        const boot = async () => {
            try {
                const pending = await api.getPendingCalls()

                if (pending?.active) await api.endCall(pending.active.id).catch(() => {})

                if (alive && pending?.incoming?.length) {
                    const call = pending.incoming[0]

                    setIncomingCall({ id: call.id, roomId: call.roomId, video: call.video, peer: call.peer })
                }
            } catch {
                return
            }

            try {
                const rooms = await api.getVoiceRooms()
                const live = {}

                for (const room of Array.isArray(rooms) ? rooms : []) {
                    const ghost = (room.participants || []).some((p) => String(p.id) === myId)

                    if (ghost && !activeRef.current) {
                        await api.leaveVoice(room.id).catch(() => {})
                        live[room.id] = (room.participants || []).filter((p) => String(p.id) !== myId)
                    } else {
                        live[room.id] = room.participants || []
                    }
                }

                if (alive) setRoomsLive((map) => ({ ...live, ...map }))
            } catch {
                return
            }
        }

        boot()

        return () => {
            alive = false
        }
    }, [myId, setIncomingCall])

    useEffect(() => () => {
        stopRing()
        clearTimeout(noticeTimerRef.current)
        stopStream(micRef.current)

        if (videoRef.current) stopStream(videoRef.current.stream)

        pcsRef.current.forEach((entry) => entry.pc.close())
        pcsRef.current.clear()
    }, [stopRing])

    const audioStreams = useMemo(() => {
        const list = []

        Object.entries(remote).forEach(([userId, streams]) => {
            streams.forEach((stream) => {
                if (!hasVideo(stream)) list.push({ key: `${userId}:${stream.id}`, stream })
            })
        })

        return list
    }, [remote])

    const value = useMemo(
        () => ({
            active,
            status,
            participants,
            roomsLive,
            incoming,
            muted,
            deafened,
            sharing,
            camera,
            localVideo,
            remote,
            speaking,
            notice,
            myId,
            join,
            leave,
            startCall,
            acceptIncoming,
            declineIncoming,
            toggleMute,
            toggleDeafen,
            toggleScreen,
            toggleCamera,
            dismissNotice: () => setNotice(''),
        }),
        [
            active, status, participants, roomsLive, incoming, muted, deafened, sharing, camera,
            localVideo, remote, speaking, notice, myId, join, leave, startCall, acceptIncoming,
            declineIncoming, toggleMute, toggleDeafen, toggleScreen, toggleCamera,
        ]
    )

    return (
        <CallCtx.Provider value={value}>
            {children}

            {audioStreams.map((item) => (
                <RemoteAudio key={item.key} stream={item.stream} muted={deafened} />
            ))}

            <CallOverlay />
        </CallCtx.Provider>
    )
}

export function useCall() {
    const ctx = useContext(CallCtx)

    if (!ctx) {
        return {
            active: null,
            status: 'idle',
            participants: [],
            roomsLive: {},
            incoming: null,
            muted: false,
            deafened: false,
            sharing: false,
            camera: false,
            localVideo: null,
            remote: {},
            speaking: {},
            notice: '',
            myId: '',
            join: async () => false,
            leave: async () => {},
            startCall: async () => {},
            acceptIncoming: async () => {},
            declineIncoming: async () => {},
            toggleMute: () => {},
            toggleDeafen: () => {},
            toggleScreen: async () => {},
            toggleCamera: async () => {},
            dismissNotice: () => {},
        }
    }

    return ctx
}
