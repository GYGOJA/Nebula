import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '@/api'
import { subscribeEvents, USE_MOCK } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/i18n'

const NotificationsCtx = createContext(null)

const TOAST_MS = 5000
const MAX_TOASTS = 4

function readPrefs() {
    try {
        const saved = JSON.parse(localStorage.getItem('nebula_settings') || '{}')
        return { desktop: true, sounds: true, ...(saved.notifications || {}) }
    } catch {
        return { desktop: true, sounds: true }
    }
}

let audioContext = null

function playBeep() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext

        if (!Ctx) return

        audioContext = audioContext || new Ctx()
        if (audioContext.state === 'suspended') audioContext.resume()

        const now = audioContext.currentTime
        const gain = audioContext.createGain()
        gain.connect(audioContext.destination)
        gain.gain.setValueAtTime(0.0001, now)
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)

        ;[880, 1175].forEach((freq, i) => {
            const osc = audioContext.createOscillator()
            osc.type = 'sine'
            osc.frequency.value = freq
            osc.connect(gain)
            osc.start(now + i * 0.12)
            osc.stop(now + i * 0.12 + 0.2)
        })
    } catch {

    }
}

export function NotificationsProvider({ children }) {
    const { isAuthenticated, user } = useAuth()
    const { t } = useI18n()
    const navigate = useNavigate()
    const location = useLocation()

    const [unread, setUnread] = useState({})
    const [toasts, setToasts] = useState([])
    const [connected, setConnected] = useState(false)

    const listeners = useRef(new Set())
    const locationRef = useRef(location.pathname)
    const tRef = useRef(t)
    const seenRef = useRef(new Set())

    useEffect(() => {
        locationRef.current = location.pathname
    }, [location.pathname])

    useEffect(() => {
        tRef.current = t
    }, [t])

    const subscribe = useCallback((handler) => {
        listeners.current.add(handler)
        return () => listeners.current.delete(handler)
    }, [])

    const dismiss = useCallback((id) => {
        setToasts((list) => list.filter((item) => item.id !== id))
    }, [])

    const pushToast = useCallback((toast) => {
        setToasts((list) => [...list.slice(-(MAX_TOASTS - 1)), toast])
        setTimeout(() => dismiss(toast.id), TOAST_MS)
    }, [dismiss])

    const markRead = useCallback((peerId) => {
        setUnread((map) => {
            if (!map[peerId]) return map
            const next = { ...map }
            delete next[peerId]
            return next
        })

        return api.markDmRead(peerId).catch(() => {})
    }, [])

    const refreshUnread = useCallback(async () => {
        try {
            const result = await api.getDmUnread()
            setUnread(result?.byUser || {})
        } catch {

        }
    }, [])

    const describe = useCallback((message) => {
        const tr = tRef.current
        const first = message.attachments?.[0]

        if (message.text) return message.text
        if (!first) return ''
        if (first.kind === 'voice') return tr('attach.voiceMessage')
        if (first.kind === 'image') return tr('attach.photo')
        if (first.kind === 'video') return tr('attach.video')

        return first.name || tr('attach.file')
    }, [])

    const handleMessage = useCallback(({ message, peer }) => {
        if (!message || message.authorId === 'me' || seenRef.current.has(message.id)) return

        seenRef.current.add(message.id)
        if (seenRef.current.size > 500) seenRef.current = new Set([...seenRef.current].slice(-200))

        const peerId = message.senderId
        const inThisChat = locationRef.current === `/app/dm/${peerId}`
        const visible = document.visibilityState === 'visible' && document.hasFocus()

        if (inThisChat && visible) {
            api.markDmRead(peerId).catch(() => {})
            return
        }

        setUnread((map) => ({ ...map, [peerId]: (map[peerId] || 0) + 1 }))

        const prefs = readPrefs()
        const title = peer?.displayName || peer?.name || message.author?.name || ''
        const body = describe(message)

        if (prefs.sounds) playBeep()

        if (document.visibilityState === 'visible') {
            pushToast({ id: message.id, peerId, title, body, avatar: peer?.avatarUrl || peer?.avatar || '' })
        }

        if (
            prefs.desktop &&
            document.visibilityState !== 'visible' &&
            typeof Notification !== 'undefined' &&
            Notification.permission === 'granted'
        ) {
            try {
                const notification = new Notification(title, {
                    body,
                    tag: `dm-${peerId}`,
                    silent: true,
                })

                notification.onclick = () => {
                    window.focus()
                    navigate(`/app/dm/${peerId}`)
                    notification.close()
                }
            } catch {

            }
        }
    }, [describe, navigate, pushToast])

    useEffect(() => {
        if (!isAuthenticated || USE_MOCK) return undefined

        refreshUnread()

        const stop = subscribeEvents(
            (event) => {
                window.dispatchEvent(new CustomEvent('nebula:event', { detail: { type: event.type, data: event.data } }))
                if (event.type === 'message') handleMessage(event.data)
                if (event.type === 'channel_message') window.dispatchEvent(new CustomEvent('nebula:channel-message', { detail: event.data }))

                if (event.type === 'read_self') {
                    setUnread((map) => {
                        const next = { ...map }
                        delete next[event.data.peerId]
                        return next
                    })
                }

                listeners.current.forEach((handler) => handler(event))
            },
            (online) => {
                setConnected(online)

                if (online) {
                    refreshUnread()
                    listeners.current.forEach((handler) => handler({ type: 'reconnected' }))
                }
            }
        )

        return stop
    }, [isAuthenticated, user?.id, handleMessage, refreshUnread])

    useEffect(() => {
        if (!isAuthenticated || typeof Notification === 'undefined') return undefined
        if (Notification.permission !== 'default' || !readPrefs().desktop) return undefined

        const ask = () => {
            Notification.requestPermission().catch(() => {})
            window.removeEventListener('pointerdown', ask)
        }

        window.addEventListener('pointerdown', ask, { once: true })

        return () => window.removeEventListener('pointerdown', ask)
    }, [isAuthenticated])

    const totalUnread = useMemo(
        () => Object.values(unread).reduce((sum, n) => sum + n, 0),
        [unread]
    )

    useEffect(() => {
        const base = document.title.replace(/^\(\d+\)\s*/, '')
        document.title = totalUnread ? `(${totalUnread}) ${base}` : base
    }, [totalUnread])

    const value = useMemo(
        () => ({ unread, totalUnread, connected, subscribe, markRead, refreshUnread }),
        [unread, totalUnread, connected, subscribe, markRead, refreshUnread]
    )

    return (
        <NotificationsCtx.Provider value={value}>
            {children}

            <div className="toasts" role="region" aria-live="polite">
                {toasts.map((toast) => (
                    <button
                        key={toast.id}
                        type="button"
                        className="toast"
                        onClick={() => {
                            dismiss(toast.id)
                            navigate(`/app/dm/${toast.peerId}`)
                        }}
                    >
                        <span className="toast__title">{toast.title}</span>
                        <span className="toast__body">{toast.body}</span>
                    </button>
                ))}
            </div>
        </NotificationsCtx.Provider>
    )
}

export function useNotifications() {
    const ctx = useContext(NotificationsCtx)

    if (!ctx) {
        return {
            unread: {},
            totalUnread: 0,
            connected: false,
            subscribe: () => () => {},
            markRead: async () => {},
            refreshUnread: async () => {},
        }
    }

    return ctx
}
