import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_MS = 15 * 60 * 1000

const MIME_CANDIDATES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
]

export const canRecordVoice = () =>
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia

// Запись голоса: start() -> stop() даёт { file, duration }, cancel() выбрасывает запись.
export function useVoiceRecorder() {
    const [recording, setRecording] = useState(false)
    const [elapsed, setElapsed] = useState(0)
    const [error, setError] = useState('')

    const recorderRef = useRef(null)
    const streamRef = useRef(null)
    const chunksRef = useRef([])
    const startedRef = useRef(0)
    const timerRef = useRef(null)
    const finishRef = useRef(null)

    const cleanup = useCallback(() => {
        clearInterval(timerRef.current)
        streamRef.current?.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        recorderRef.current = null
        chunksRef.current = []
        setRecording(false)
        setElapsed(0)
    }, [])

    const start = useCallback(async () => {
        setError('')

        if (!canRecordVoice()) {
            setError('unsupported')
            return false
        }

        let stream

        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        } catch (err) {
            setError(err?.name === 'NotAllowedError' ? 'denied' : 'unavailable')
            return false
        }

        const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported?.(type))
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

        chunksRef.current = []
        recorder.ondataavailable = (event) => {
            if (event.data?.size) chunksRef.current.push(event.data)
        }

        streamRef.current = stream
        recorderRef.current = recorder
        startedRef.current = Date.now()
        recorder.start(250)

        setRecording(true)
        setElapsed(0)

        timerRef.current = setInterval(() => {
            const ms = Date.now() - startedRef.current
            setElapsed(ms)
            if (ms >= MAX_MS) finishRef.current?.(true)
        }, 200)

        return true
    }, [])

    // keep=false — отмена. Возвращает Promise<{ file, duration } | null>.
    const finish = useCallback((keep) => new Promise((resolve) => {
        const recorder = recorderRef.current

        if (!recorder) {
            resolve(null)
            return
        }

        const duration = Date.now() - startedRef.current
        const type = recorder.mimeType || 'audio/webm'

        recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type })
            cleanup()

            if (!keep || !blob.size) {
                resolve(null)
                return
            }

            const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'

            resolve({ file: new File([blob], `voice.${ext}`, { type }), duration })
        }

        if (recorder.state !== 'inactive') recorder.stop()
        else recorder.onstop()
    }), [cleanup])

    finishRef.current = finish

    useEffect(() => () => {
        const recorder = recorderRef.current

        if (recorder && recorder.state !== 'inactive') {
            recorder.onstop = null
            recorder.stop()
        }

        clearInterval(timerRef.current)
        streamRef.current?.getTracks().forEach((track) => track.stop())
    }, [])

    return {
        recording,
        elapsed,
        error,
        start,
        stop: () => finish(true),
        cancel: () => finish(false),
    }
}
