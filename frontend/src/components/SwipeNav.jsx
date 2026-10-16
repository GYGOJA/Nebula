import { useEffect } from 'react'
import { menuPanel, rightPanel } from '@/utils/navPanel'

const OPEN_DIST = 64
const CLOSE_DIST = 48
const RATIO = 1.5

const PHONE = '(max-width: 767px)'

// Touches that start on these keep their own behaviour (text selection, sliders, scrolling lists...).
const IGNORE = 'input, textarea, select, [contenteditable="true"], audio, video, canvas, .attach-voice__track, [data-no-swipe]'

// Only content that really scrolls sideways keeps its touches (code, tables, tile strips).
const H_SCROLLERS = 'pre, table, .voice-stage__strip, [data-hscroll]'

function insideHorizontalScroll(node) {
    const scroller = node.closest(H_SCROLLERS)
    return Boolean(scroller && scroller.scrollWidth > scroller.clientWidth + 1)
}

// Phones only: swipe right opens the left menu (spaces and direct messages),
// swipe left opens the right panel (participants, threads, files).
// An open panel is closed by swiping it back.
export default function SwipeNav() {
    useEffect(() => {
        const media = window.matchMedia(PHONE)
        let start = null

        const onStart = (event) => {
            if (!media.matches || event.touches.length !== 1) {
                start = null
                return
            }

            const target = event.target instanceof Element ? event.target : null
            const insidePanel = Boolean(target?.closest('.mmenu, .rightbar__panel'))

            if (!insidePanel && target && (target.closest(IGNORE) || insideHorizontalScroll(target))) {
                start = null
                return
            }

            const { clientX, clientY } = event.touches[0]
            start = { x: clientX, y: clientY }
        }

        const onEnd = (event) => {
            const begin = start
            start = null
            if (!begin || !media.matches) return

            const { clientX, clientY } = event.changedTouches[0]
            const dx = clientX - begin.x
            const dy = clientY - begin.y

            if (Math.abs(dx) < Math.abs(dy) * RATIO) return

            const menuOpen = menuPanel.get()
            const rightOpen = rightPanel.get()

            if (menuOpen) {
                if (dx < -CLOSE_DIST) menuPanel.close()
                return
            }

            if (rightOpen) {
                if (dx > CLOSE_DIST) rightPanel.close()
                return
            }

            if (dx > OPEN_DIST) menuPanel.set(true)
            else if (dx < -OPEN_DIST) rightPanel.set(true)
        }

        const onCancel = () => { start = null }

        window.addEventListener('touchstart', onStart, { passive: true })
        window.addEventListener('touchend', onEnd, { passive: true })
        window.addEventListener('touchcancel', onCancel, { passive: true })

        return () => {
            window.removeEventListener('touchstart', onStart)
            window.removeEventListener('touchend', onEnd)
            window.removeEventListener('touchcancel', onCancel)
        }
    }, [])

    return null
}
