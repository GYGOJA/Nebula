import { useEffect, useMemo, useRef, useState } from 'react'
import { recordDownload } from '@/utils/downloads'
import { fetchBlob } from '@/api/client'
import { useI18n } from '@/i18n'
import { formatBytes, formatDuration } from '@/utils/format'

function useBlobUrl(url, enabled = true) {
    const [state, setState] = useState({ src: '', error: false })

    useEffect(() => {
        if (!enabled) return undefined

        let alive = true

        fetchBlob(url)
            .then((src) => alive && setState({ src, error: false }))
            .catch(() => alive && setState({ src: '', error: true }))

        return () => {
            alive = false
        }
    }, [url, enabled])

    return state
}

async function saveFile(attachment) {
    const href = await fetchBlob(attachment.url, { download: true })
    const link = document.createElement('a')

    link.href = href
    link.download = attachment.name || 'file'
    document.body.appendChild(link)
    link.click()
    link.remove()
    recordDownload(attachment)
}

function ImageAttachment({ attachment }) {
    const { t } = useI18n()
    const { src, error } = useBlobUrl(attachment.url)

    if (error) return <FileAttachment attachment={attachment} />

    return (
        <a
            className="attach-image"
            href={src || undefined}
            target="_blank"
            rel="noreferrer"
            title={attachment.name}
            aria-label={t('attach.openImage', { name: attachment.name })}
        >
            {src ? <img src={src} alt={attachment.name} /> : <span className="attach-image__ph" />}
        </a>
    )
}

function VideoAttachment({ attachment }) {
    const [active, setActive] = useState(false)
    const { src, error } = useBlobUrl(attachment.url, active)

    if (error) return <FileAttachment attachment={attachment} />

    if (!active) {
        return (
            <button type="button" className="attach-video" onClick={() => setActive(true)}>
                <span className="attach-video__play" aria-hidden="true">▶</span>
                <span className="attach-video__name">{attachment.name}</span>
                <span className="attach-video__size">{formatBytes(attachment.size)}</span>
            </button>
        )
    }

    return (
        <video className="attach-video-player" src={src || undefined} controls autoPlay playsInline />
    )
}

const WAVE_BARS = 44

function waveformHeights(seedText) {
    let seed = 2166136261
    for (const ch of String(seedText || 'voice')) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0
    return Array.from({ length: WAVE_BARS }, (_, index) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        const noise = (seed >>> 8) / 16777215
        const envelope = 0.55 + 0.45 * Math.sin((index / WAVE_BARS) * Math.PI * 2.4 + (seed % 7))
        return Math.round(18 + 82 * Math.min(1, Math.max(0.08, noise * 0.7 + envelope * 0.35)))
    })
}

function VoiceAttachment({ attachment }) {
    const { t } = useI18n()
    const [active, setActive] = useState(false)
    const [playing, setPlaying] = useState(false)
    const [position, setPosition] = useState(0)
    const [duration, setDuration] = useState(attachment.durationMs || 0)
    const [failed, setFailed] = useState(false)
    const audioRef = useRef(null)
    const { src, error } = useBlobUrl(attachment.url, active)

    useEffect(() => {
        if (src && active) audioRef.current?.play().catch(() => setPlaying(false))
    }, [src, active])

    const toggle = () => {
        const audio = audioRef.current

        if (!active) {
            setActive(true)
            return
        }

        if (!audio) return

        if (audio.paused) audio.play().catch(() => setFailed(true))
        else audio.pause()
    }

    const seek = (event) => {
        const audio = audioRef.current

        if (!audio || !duration) return

        const rect = event.currentTarget.getBoundingClientRect()
        const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))

        audio.currentTime = (ratio * duration) / 1000
        setPosition(ratio * duration)
    }

    const progress = duration ? Math.min(1, position / duration) : 0
    const bars = useMemo(() => waveformHeights(attachment.id || attachment.url), [attachment.id, attachment.url])

    return (
        <div className="attach-voice">
            <button
                type="button"
                className="attach-voice__btn"
                onClick={toggle}
                aria-label={playing ? t('attach.pause') : t('attach.play')}
            >
                {playing ? '❚❚' : '▶'}
            </button>

            <div
                className="attach-voice__track"
                onClick={seek}
                role="slider"
                aria-label={t('attach.voiceMessage')}
                aria-valuemin={0}
                aria-valuemax={Math.round(duration / 1000)}
                aria-valuenow={Math.round(position / 1000)}
            >
                {bars.map((height, index) => (
                    <span
                        key={index}
                        className={`attach-voice__bar${(index + 0.5) / WAVE_BARS <= progress ? ' is-played' : ''}`}
                        style={{ height: `${height}%` }}
                    />
                ))}
            </div>

            <span className="attach-voice__time">
                {formatDuration(playing || position ? position : duration)}
            </span>

            {(error || failed) && <span className="attach-voice__err">{t('attach.loadFailed')}</span>}

            {active && src && (
                <audio
                    ref={audioRef}
                    src={src}
                    preload="metadata"
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => {
                        setPlaying(false)
                        setPosition(0)
                    }}
                    onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime * 1000)}
                    onLoadedMetadata={(e) => {
                        const d = e.currentTarget.duration

                        if (Number.isFinite(d) && d > 0) setDuration(d * 1000)
                    }}
                    onError={() => setFailed(true)}
                />
            )}
        </div>
    )
}

function AudioAttachment({ attachment }) {
    const [active, setActive] = useState(false)
    const { src, error } = useBlobUrl(attachment.url, active)

    if (error) return <FileAttachment attachment={attachment} />

    if (!active) {
        return (
            <button type="button" className="attach-video" onClick={() => setActive(true)}>
                <span className="attach-video__play" aria-hidden="true">♪</span>
                <span className="attach-video__name">{attachment.name}</span>
                <span className="attach-video__size">{formatBytes(attachment.size)}</span>
            </button>
        )
    }

    return <audio className="attach-audio" src={src || undefined} controls autoPlay />
}

function FileAttachment({ attachment }) {
    const { t, language } = useI18n()
    const [busy, setBusy] = useState(false)
    const [failed, setFailed] = useState(false)
    const ext = (attachment.name.split('.').pop() || '').slice(0, 4).toUpperCase()

    const download = async () => {
        setBusy(true)
        setFailed(false)

        try {
            await saveFile(attachment)
        } catch {
            setFailed(true)
        } finally {
            setBusy(false)
        }
    }

    return (
        <button type="button" className="attach-file" onClick={download} disabled={busy} title={t('attach.download')}>
            <span className="attach-file__icon" aria-hidden="true">{ext || '•'}</span>
            <span className="attach-file__info">
                <span className="attach-file__name">{attachment.name}</span>
                <span className="attach-file__meta">
                    {failed ? t('attach.loadFailed') : formatBytes(attachment.size, language)}
                </span>
            </span>
            <span className="attach-file__dl" aria-hidden="true">{busy ? '…' : '↓'}</span>
        </button>
    )
}

export default function MessageAttachments({ attachments }) {
    if (!attachments?.length) return null

    return (
        <div className="attachments">
            {attachments.map((attachment) => {
                switch (attachment.kind) {
                    case 'image':
                        return <ImageAttachment key={attachment.id} attachment={attachment} />
                    case 'video':
                        return <VideoAttachment key={attachment.id} attachment={attachment} />
                    case 'voice':
                        return <VoiceAttachment key={attachment.id} attachment={attachment} />
                    case 'audio':
                        return <AudioAttachment key={attachment.id} attachment={attachment} />
                    default:
                        return <FileAttachment key={attachment.id} attachment={attachment} />
                }
            })}
        </div>
    )
}
