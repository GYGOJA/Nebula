import { useEffect, useRef } from 'react'
import Avatar from './Avatar'

export default function StreamTile({ stream, label, avatar, muted = false, local = false, sharing = false }) {
    const videoRef = useRef(null)
    const audioRef = useRef(null)
    const hasVideo = Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live'))

    useEffect(() => {
        if (videoRef.current && stream) videoRef.current.srcObject = stream
        if (audioRef.current && stream) audioRef.current.srcObject = stream
        return () => {
            if (videoRef.current) videoRef.current.srcObject = null
            if (audioRef.current) audioRef.current.srcObject = null
        }
    }, [stream, hasVideo])

    if (hasVideo) {
        return (
            <div className={`stream-tile ${sharing ? 'stream-tile--sharing' : ''}`}>
                <video ref={videoRef} autoPlay playsInline muted={muted || local} />
                <span className="stream-tile__label">{label}{local ? ' · вы' : ''}{sharing ? ' · экран' : ''}</span>
            </div>
        )
    }

    return (
        <div className="stream-tile stream-tile--audio">
            <audio ref={audioRef} autoPlay playsInline muted={muted} />
            <Avatar src={avatar} label={label} size={64} />
            <span className="stream-tile__label">{label}{local ? ' · вы' : ''}</span>
        </div>
    )
}
