import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/api'
import { session } from '@/api/client'

export default function useVoiceSession(roomId) {
    const currentUser = session.getUser()
    const selfId = String(currentUser?.id || currentUser?.userId || '')
    const [joined, setJoined] = useState(false)
    const [joining, setJoining] = useState(false)
    const [participants, setParticipants] = useState([])
    const [localStream, setLocalStream] = useState(null)
    const [screenStream, setScreenStream] = useState(null)
    const [remoteStreams, setRemoteStreams] = useState({})
    const [muted, setMuted] = useState(false)
    const [deafened, setDeafened] = useState(false)
    const [sharing, setSharing] = useState(false)
    const [cameraEnabled, setCameraEnabled] = useState(false)
    const [error, setError] = useState('')
    const joinedRef = useRef(false)
    const roomIdRef = useRef(roomId)
    const localStreamRef = useRef(null)
    const screenStreamRef = useRef(null)
    const remoteStreamsRef = useRef(new Map())
    const peersRef = useRef(new Map())
    const iceServersRef = useRef([])
    const cameraTrackIdsRef = useRef(new Set())
    const mutedRef = useRef(false)
    const deafenedRef = useRef(false)

    roomIdRef.current = roomId

    const sendSignal = useCallback(async (peerId, type, data) => {
        const currentRoomId = roomIdRef.current
        if (!currentRoomId || !peerId) return
        try {
            await api.sendVoiceSignal(currentRoomId, peerId, type, data)
        } catch (signalError) {
            if (joinedRef.current) setError(signalError?.message || 'Не удалось передать сигнал звонка')
        }
    }, [])

    const closePeer = useCallback((peerId) => {
        const entry = peersRef.current.get(String(peerId))
        if (entry) {
            entry.pc.ontrack = null
            entry.pc.onicecandidate = null
            entry.pc.onnegotiationneeded = null
            entry.pc.close()
            peersRef.current.delete(String(peerId))
        }
        const prefix = `${String(peerId)}::`
        for (const key of remoteStreamsRef.current.keys()) {
            if (key === String(peerId) || key.startsWith(prefix)) remoteStreamsRef.current.delete(key)
        }
        setRemoteStreams((previous) => {
            const next = { ...previous }
            let changed = false
            for (const key of Object.keys(next)) {
                if (key === String(peerId) || key.startsWith(prefix)) {
                    delete next[key]
                    changed = true
                }
            }
            return changed ? next : previous
        })
    }, [])

    const ensurePeer = useCallback(async (rawPeerId) => {
        const peerId = String(rawPeerId || '')
        if (!joinedRef.current || !selfId || !peerId || peerId === selfId) return null
        const existing = peersRef.current.get(peerId)
        if (existing) return existing

        const pc = new RTCPeerConnection({ iceServers: iceServersRef.current })
        const entry = {
            pc,
            polite: selfId.localeCompare(peerId) > 0,
            makingOffer: false,
            ignoreOffer: false,
            isSettingRemoteAnswerPending: false,
            candidates: [],
        }
        peersRef.current.set(peerId, entry)

        const local = localStreamRef.current
        if (local) {
            local.getTracks().forEach((track) => {
                if (!pc.getSenders().some((sender) => sender.track?.id === track.id)) pc.addTrack(track, local)
            })
        }
        const screen = screenStreamRef.current
        if (screen) screen.getTracks().forEach((track) => pc.addTrack(track, screen))

        pc.onicecandidate = (event) => {
            if (event.candidate) sendSignal(peerId, 'candidate', event.candidate.toJSON())
        }
        pc.ontrack = (event) => {
            const incoming = event.streams?.[0]
            const streamKey = incoming ? `${peerId}::${incoming.id}` : peerId
            let stream = incoming || remoteStreamsRef.current.get(streamKey) || new MediaStream()
            if (!incoming && !stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track)
            remoteStreamsRef.current.set(streamKey, stream)
            setRemoteStreams((previous) => ({ ...previous, [streamKey]: stream }))
            event.track.addEventListener('ended', () => {
                if (stream.getTracks().some((track) => track.readyState === 'live')) return
                remoteStreamsRef.current.delete(streamKey)
                setRemoteStreams((previous) => {
                    if (!(streamKey in previous)) return previous
                    const next = { ...previous }
                    delete next[streamKey]
                    return next
                })
            }, { once: true })
        }
        pc.onnegotiationneeded = async () => {
            if (!joinedRef.current || pc.signalingState === 'closed') return
            try {
                entry.makingOffer = true
                await pc.setLocalDescription()
                await sendSignal(peerId, 'offer', pc.localDescription.toJSON())
            } catch (negotiationError) {
                if (joinedRef.current) setError(negotiationError?.message || 'Не удалось установить соединение')
            } finally {
                entry.makingOffer = false
            }
        }
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' && joinedRef.current) {
                setError('Не удалось соединиться с участником. Проверьте сеть или TURN-настройки сервера.')
            }
            if (pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
                if (pc.connectionState === 'closed') closePeer(peerId)
            }
        }
        return entry
    }, [selfId, sendSignal, closePeer])

    const acceptQueuedCandidates = useCallback(async (entry) => {
        const queued = entry.candidates.splice(0)
        for (const candidate of queued) {
            try {
                await entry.pc.addIceCandidate(new RTCIceCandidate(candidate))
            } catch {}
        }
    }, [])

    const handleSignal = useCallback(async (data) => {
        if (!joinedRef.current || String(data?.roomId || '') !== String(roomIdRef.current)) return
        const peerId = String(data.from || '')
        if (!peerId || peerId === selfId) return
        const entry = await ensurePeer(peerId)
        if (!entry) return
        const { pc } = entry
        try {
            if (data.type === 'candidate') {
                if (!pc.remoteDescription) {
                    entry.candidates.push(data.data)
                    return
                }
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(data.data))
                } catch (candidateError) {
                    if (!entry.ignoreOffer) throw candidateError
                }
                return
            }
            if (data.type === 'offer') {
                const readyForOffer = !entry.makingOffer && (pc.signalingState === 'stable' || entry.isSettingRemoteAnswerPending)
                const offerCollision = !readyForOffer
                entry.ignoreOffer = !entry.polite && offerCollision
                if (entry.ignoreOffer) return
                if (offerCollision && entry.polite) await pc.setLocalDescription({ type: 'rollback' })
                await pc.setRemoteDescription(new RTCSessionDescription(data.data))
                await acceptQueuedCandidates(entry)
                await pc.setLocalDescription(await pc.createAnswer())
                await sendSignal(peerId, 'answer', pc.localDescription.toJSON())
                return
            }
            if (data.type === 'answer') {
                entry.isSettingRemoteAnswerPending = true
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.data))
                } finally {
                    entry.isSettingRemoteAnswerPending = false
                }
                await acceptQueuedCandidates(entry)
            }
        } catch (signalError) {
            if (joinedRef.current) setError(signalError?.message || 'Ошибка согласования аудио/видео')
        }
    }, [selfId, ensurePeer, acceptQueuedCandidates, sendSignal])

    useEffect(() => {
        const onEvent = (event) => {
            const { type, data } = event.detail || {}
            const eventRoomId = String(data?.roomId || data?.id || '')
            if (type === 'voice_signal') {
                handleSignal(data)
                return
            }
            if (type !== 'voice_state' || eventRoomId !== String(roomIdRef.current)) return
            const list = Array.isArray(data?.participants) ? data.participants : []
            setParticipants(list)
            if (!joinedRef.current) return
            const present = new Set(list.map((participant) => String(participant.id || participant.userId || '')))
            for (const peerId of peersRef.current.keys()) {
                if (!present.has(peerId)) closePeer(peerId)
            }
            list.forEach((participant) => {
                const id = participant.id || participant.userId
                if (id && String(id) !== selfId) ensurePeer(id)
            })
        }
        window.addEventListener('nebula:event', onEvent)
        return () => window.removeEventListener('nebula:event', onEvent)
    }, [selfId, handleSignal, ensurePeer, closePeer])

    const stopTracks = (stream) => stream?.getTracks().forEach((track) => track.stop())

    const cleanupConnection = useCallback(() => {
        joinedRef.current = false
        for (const peerId of [...peersRef.current.keys()]) closePeer(peerId)
        peersRef.current.clear()
        stopTracks(localStreamRef.current)
        stopTracks(screenStreamRef.current)
        localStreamRef.current = null
        screenStreamRef.current = null
        cameraTrackIdsRef.current.clear()
        remoteStreamsRef.current.clear()
        setLocalStream(null)
        setScreenStream(null)
        setRemoteStreams({})
        setParticipants([])
        setJoined(false)
        setJoining(false)
        setMuted(false)
        setDeafened(false)
        setSharing(false)
        setCameraEnabled(false)
        mutedRef.current = false
        deafenedRef.current = false
    }, [closePeer])

    useEffect(() => () => {
        if (joinedRef.current && roomId) api.leaveVoice(roomId).catch(() => {})
        cleanupConnection()
    }, [roomId, cleanupConnection])

    const join = useCallback(async ({ video = false } = {}) => {
        if (joinedRef.current || joining) return null
        setJoining(true)
        setError('')
        let media
        try {
            if (!navigator.mediaDevices?.getUserMedia) throw new Error('Браузер не поддерживает доступ к микрофону')
            media = await navigator.mediaDevices.getUserMedia({ audio: true, video })
            localStreamRef.current = media
            setLocalStream(media)
            cameraTrackIdsRef.current = new Set(media.getVideoTracks().map((track) => track.id))
            setCameraEnabled(media.getVideoTracks().length > 0)
            const result = await api.joinVoice(roomId, { muted: false, video })
            iceServersRef.current = Array.isArray(result?.iceServers) ? result.iceServers : []
            joinedRef.current = true
            setJoined(true)
            const snapshot = result?.room || result
            setParticipants(Array.isArray(snapshot?.participants) ? snapshot.participants : [])
            for (const peerId of result?.peers || []) await ensurePeer(peerId)
            return result
        } catch (joinError) {
            stopTracks(media)
            localStreamRef.current = null
            setLocalStream(null)
            setError(joinError?.message || 'Не удалось подключиться к голосовой комнате')
            throw joinError
        } finally {
            setJoining(false)
        }
    }, [roomId, joining, ensurePeer])

    const leave = useCallback(async () => {
        const currentRoom = roomIdRef.current
        try {
            if (joinedRef.current && currentRoom) await api.leaveVoice(currentRoom)
        } finally {
            cleanupConnection()
        }
    }, [cleanupConnection])

    const toggleMute = useCallback(async () => {
        const next = !mutedRef.current
        mutedRef.current = next
        setMuted(next)
        localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next })
        try {
            await api.updateVoiceState(roomIdRef.current, { muted: next })
        } catch (stateError) {
            setError(stateError?.message || 'Не удалось обновить состояние микрофона')
        }
    }, [])

    const toggleDeafen = useCallback(async () => {
        const next = !deafenedRef.current
        deafenedRef.current = next
        setDeafened(next)
        try {
            await api.updateVoiceState(roomIdRef.current, { deafened: next })
        } catch (stateError) {
            setError(stateError?.message || 'Не удалось обновить звук')
        }
    }, [])

    const stopScreenShare = useCallback(async () => {
        const stream = screenStreamRef.current
        if (!stream) return
        for (const entry of peersRef.current.values()) {
            for (const sender of entry.pc.getSenders()) {
                if (stream.getTracks().some((track) => sender.track?.id === track.id)) entry.pc.removeTrack(sender)
            }
        }
        stopTracks(stream)
        screenStreamRef.current = null
        setScreenStream(null)
        setSharing(false)
        try {
            await api.updateVoiceState(roomIdRef.current, { sharing: false })
        } catch {}
    }, [])

    const startScreenShare = useCallback(async () => {
        if (!joinedRef.current) throw new Error('Сначала подключитесь к голосовой комнате')
        if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Демонстрация экрана недоступна в этом браузере')
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false })
        screenStreamRef.current = stream
        setScreenStream(stream)
        setSharing(true)
        stream.getVideoTracks().forEach((track) => {
            track.onended = () => { stopScreenShare() }
            for (const entry of peersRef.current.values()) entry.pc.addTrack(track, stream)
        })
        try {
            await api.updateVoiceState(roomIdRef.current, { sharing: true })
        } catch (stateError) {
            setError(stateError?.message || 'Экран передаётся, но состояние не удалось обновить')
        }
    }, [stopScreenShare])

    const toggleCamera = useCallback(async () => {
        if (!joinedRef.current) throw new Error('Сначала подключитесь к голосовой комнате')
        if (cameraTrackIdsRef.current.size) {
            for (const entry of peersRef.current.values()) {
                for (const sender of entry.pc.getSenders()) {
                    if (sender.track && cameraTrackIdsRef.current.has(sender.track.id)) entry.pc.removeTrack(sender)
                }
            }
            const current = localStreamRef.current
            const remaining = current?.getTracks().filter((track) => !cameraTrackIdsRef.current.has(track.id)) || []
            current?.getVideoTracks().filter((track) => cameraTrackIdsRef.current.has(track.id)).forEach((track) => track.stop())
            cameraTrackIdsRef.current.clear()
            const stream = new MediaStream(remaining)
            localStreamRef.current = stream
            setLocalStream(stream)
            setCameraEnabled(false)
            try { await api.updateVoiceState(roomIdRef.current, { video: false }) } catch {}
            return
        }
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        const currentTracks = localStreamRef.current?.getTracks() || []
        const videoTracks = videoStream.getVideoTracks()
        cameraTrackIdsRef.current = new Set(videoTracks.map((track) => track.id))
        const stream = new MediaStream([...currentTracks, ...videoTracks])
        localStreamRef.current = stream
        setLocalStream(stream)
        for (const entry of peersRef.current.values()) videoTracks.forEach((track) => entry.pc.addTrack(track, stream))
        videoTracks.forEach((track) => {
            track.onended = () => { toggleCamera() }
        })
        setCameraEnabled(true)
        try { await api.updateVoiceState(roomIdRef.current, { video: true }) } catch {}
    }, [])

    return {
        joined, joining, participants, localStream, screenStream, remoteStreams,
        muted, deafened, sharing, cameraEnabled, error, setError,
        join, leave, toggleMute, toggleDeafen, startScreenShare, stopScreenShare, toggleCamera,
    }
}
