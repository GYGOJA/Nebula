import { useEffect, useRef, useState } from 'react'
import mascot from '@/assets/mascot/oska.apng'

const CYCLE_MS = 24 * 84
const HOLD_MS = 120
const FADE_MS = 520
const MAX_WAIT_MS = 9000
const PRELOAD = ['/logo_static.svg', '/logo_animation.svg']

const preloadImage = (src) =>
    new Promise((resolve) => {
        const image = new Image()
        image.onload = image.onerror = () => resolve()
        image.src = src
    })

const documentLoaded = () =>
    new Promise((resolve) => {
        if (document.readyState === 'complete') resolve()
        else window.addEventListener('load', () => resolve(), { once: true })
    })

export default function SplashScreen({ onReady }) {
    const [mascotPlayed, setMascotPlayed] = useState(false)
    const [assetsReady, setAssetsReady] = useState(false)
    const [leaving, setLeaving] = useState(false)
    const [playing, setPlaying] = useState(false)
    const [gone, setGone] = useState(false)
    const timer = useRef(null)

    useEffect(() => {
        let alive = true

        Promise.all([
            documentLoaded(),
            document.fonts?.ready ?? Promise.resolve(),
            ...PRELOAD.map(preloadImage),
        ])
            .catch(() => {})
            .then(() => {
                if (alive) setAssetsReady(true)
            })

        const safety = setTimeout(() => {
            if (!alive) return
            setMascotPlayed(true)
            setAssetsReady(true)
        }, MAX_WAIT_MS)

        return () => {
            alive = false
            clearTimeout(safety)
            clearTimeout(timer.current)
        }
    }, [])

    const startCycle = (event) => {
        const begin = () => {
            setPlaying(true)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => setMascotPlayed(true), CYCLE_MS + HOLD_MS)
        }

        const image = event.currentTarget
        if (image?.decode) image.decode().catch(() => {}).finally(begin)
        else begin()
    }

    useEffect(() => {
        if (!mascotPlayed || !assetsReady || leaving) return

        setLeaving(true)
        onReady?.()
    }, [mascotPlayed, assetsReady, leaving, onReady])

    useEffect(() => {
        if (!leaving) return undefined

        const id = setTimeout(() => setGone(true), FADE_MS)
        return () => clearTimeout(id)
    }, [leaving])

    if (gone) return null

    return (
        <div
            className={`splash${leaving ? ' splash--leaving' : ''}`}
            role="status"
            aria-live="polite"
            aria-label="Nebula"
        >
            <div className="splash__inner">
                <div className="splash__mascot-track" aria-hidden="true">
                    <img
                        className={`splash__mascot${playing ? ' is-playing' : ''}`}
                        src={mascot}
                        alt=""
                        draggable={false}
                        style={{ '--walk-ms': `${CYCLE_MS}ms` }}
                        onLoad={startCycle}
                        onError={() => setMascotPlayed(true)}
                    />
                </div>

                <div className="splash__brand">Nebula</div>

                <div className="splash__bar" aria-hidden="true">
                    <span style={{ animationDuration: `${CYCLE_MS}ms` }} />
                </div>
            </div>
        </div>
    )
}
