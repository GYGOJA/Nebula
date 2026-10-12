import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import NavigationRail from '@/components/NavigationRail'
import Sidebar from '@/components/Sidebar'
import RightSidebar from '@/components/RightSidebar'
import PageHeader from '@/components/PageHeader'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'
import MessageItem from '@/components/MessageItem'
import MessageComposer from '@/components/MessageComposer'
import { api } from '@/api'
import { useNotifications } from '@/context/NotificationsContext'
import { useI18n } from '@/i18n'

export function DmList() {
    const { t } = useI18n()
    const [conversations, setConversations] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        setError('')

        try {
            const result = await api.getDmConversations()
            setConversations(Array.isArray(result) ? result : [])
        } catch (err) {
            setError(err?.message || t('dm.loadFailed'))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    // Новые сообщения и «прочитано» обновляют список без перезагрузки страницы.
    const { subscribe, unread } = useNotifications()

    useEffect(() => subscribe((event) => {
        if (event.type === 'message' || event.type === 'reconnected') {
            api.getDmConversations()
                .then((result) => Array.isArray(result) && setConversations(result))
                .catch(() => {})
        }
    }), [subscribe])

    const lastLabel = (last) => {
        if (!last) return t('dm.noMessages')
        if (last.text) return last.text

        switch (last.attachmentKind) {
            case 'voice': return t('attach.voiceMessage')
            case 'image': return t('attach.photo')
            case 'video': return t('attach.video')
            case 'audio': return t('attach.audio')
            case 'file': return t('attach.file')
            default: return t('dm.noMessages')
        }
    }

    return (
        <div className="app-layout">
            <NavigationRail />
            <Sidebar />

            <main className="main">
                <div className="main__content">
                    <PageHeader title={t('nav.directMessages')} />

                    {loading && <p className="muted">{t('common.loading')}</p>}

                    {!loading && error && (
                        <div>
                            <p className="auth-inline-error">{error}</p>
                            <button
                                type="button"
                                className="btn btn--ghost"
                                onClick={load}
                            >
                                {t('common.retry')}
                            </button>
                        </div>
                    )}

                    {!loading && !error && conversations.length === 0 && (
                        <EmptyState
                            title={t('dm.emptyTitle')}
                            description={t('dm.emptyDesc')}
                        />
                    )}

                    {!loading && !error && conversations.length > 0 && (
                        <div className="friend-list">
                            {conversations.map((conversation) => (
                                <Link
                                    key={conversation.userId}
                                    to={`/app/dm/${conversation.userId}`}
                                    className="friend-row friend-row--link"
                                >
                                    <Avatar
                                        src={conversation.avatarUrl || conversation.avatar}
                                        label={conversation.name}
                                        size={44}
                                    />

                                    <div className="friend-row__info">
                                        <div className="friend-row__name">
                                            {conversation.displayName || conversation.name}
                                        </div>
                                        <div className="friend-row__status">
                                            {conversation.last?.fromMe ? `${t('dm.you')}: ` : ''}
                                            {lastLabel(conversation.last)}
                                        </div>
                                    </div>

                                    {(unread[conversation.userId] ?? conversation.unread) > 0 && (
                                        <span className="badge" aria-label={t('dm.unread')}>
                                            {unread[conversation.userId] ?? conversation.unread}
                                        </span>
                                    )}
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            <RightSidebar />
        </div>
    )
}

// Запасной опрос на случай, когда поток событий недоступен.
const POLL_MS = 15000

const formatTime = (message) => {
    if (!message?.createdAt) return message?.time || ''

    const date = new Date(message.createdAt)

    if (Number.isNaN(date.getTime())) return message.time || ''

    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const normalize = (message) => ({ ...message, time: formatTime(message) })

export function DmChat() {
    const { t } = useI18n()
    const { userId } = useParams()
    const [messages, setMessages] = useState([])
    const [peer, setPeer] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [sendError, setSendError] = useState('')
    const bottomRef = useRef(null)
    const lastIdRef = useRef(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError('')
        setMessages([])
        setPeer(null)
        lastIdRef.current = null

        try {
            const [peerInfo, result] = await Promise.all([
                api.getDmPeer(userId).catch(() => null),
                api.getDmMessages(userId),
            ])

            setPeer(peerInfo)
            setMessages(Array.isArray(result) ? result.map(normalize) : [])
        } catch (err) {
            setError(err?.message || t('dm.chatLoadFailed'))
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => {
        load()
    }, [load])

    const { subscribe, markRead, connected } = useNotifications()

    const refetch = useCallback(async () => {
        try {
            const result = await api.getDmMessages(userId)

            if (!Array.isArray(result)) return

            setMessages((previous) => {
                const same =
                    result.length === previous.length &&
                    result.every((m, i) => m.id === previous[i].id && m.status === previous[i].status)

                return same ? previous : result.map(normalize)
            })
        } catch {
            // временная ошибка сети: попробуем позже
        }
    }, [userId])

    // Входящие сообщения и отметки «прочитано» приходят по SSE.
    useEffect(() => subscribe((event) => {
        if (event.type === 'reconnected') {
            refetch()
            return
        }

        if (event.type === 'message') {
            const { message } = event.data || {}
            const peerId = message?.authorId === 'me' ? message?.recipientId : message?.senderId

            if (!message || peerId !== userId) return

            setMessages((previous) =>
                previous.some((item) => item.id === message.id)
                    ? previous
                    : [...previous, normalize(message)]
            )
        }

        if (event.type === 'read' && event.data?.peerId === userId) {
            const ids = new Set(event.data.ids)

            setMessages((previous) =>
                previous.map((m) =>
                    ids.has(m.id) ? { ...m, status: 'read', readAt: event.data.readAt } : m
                )
            )
        }
    }), [subscribe, userId, refetch])

    // Открыли чат — всё, что пришло, считается прочитанным (и при возврате на вкладку).
    useEffect(() => {
        if (loading || error) return undefined

        const mark = () => {
            if (document.visibilityState === 'visible') markRead(userId)
        }

        mark()
        window.addEventListener('focus', mark)
        document.addEventListener('visibilitychange', mark)

        return () => {
            window.removeEventListener('focus', mark)
            document.removeEventListener('visibilitychange', mark)
        }
    }, [userId, loading, error, markRead])

    useEffect(() => {
        if (loading || error || connected) return undefined

        const timer = setInterval(refetch, POLL_MS)

        return () => clearInterval(timer)
    }, [loading, error, connected, refetch])

    useEffect(() => {
        const lastId = messages[messages.length - 1]?.id

        if (lastId !== lastIdRef.current) {
            lastIdRef.current = lastId
            bottomRef.current?.scrollIntoView({ block: 'end' })
        }
    }, [messages])

    const send = async (text, options) => {
        setSendError('')

        try {
            const message = await api.sendDm(userId, text, options)

            setMessages((previous) =>
                previous.some((item) => item.id === message.id)
                    ? previous
                    : [...previous, normalize(message)]
            )
        } catch (err) {
            setSendError(err?.message || t('dm.sendFailed'))
            throw err
        }
    }

    const peerName = peer?.displayName || peer?.name

    return (
        <div className="app-layout">
            <NavigationRail />
            <Sidebar />

            <main className="chat">
                <header className="chat__header">
                    <Link to={`/app/users/${userId}`}>
                        <Avatar
                            src={peer?.avatarUrl || peer?.avatar}
                            label={peerName}
                            size={40}
                        />
                    </Link>

                    <div className="chat__title-wrap">
                        <div className="chat__title">
                            <Link to={`/app/users/${userId}`}>
                                {peerName || t('nav.directMessages')}
                            </Link>
                        </div>
                        {peer?.username && (
                            <div className="chat__sub">@{peer.username}</div>
                        )}
                    </div>
                </header>

                <div className="chat__messages">
                    {loading && <p className="muted">{t('common.loading')}</p>}

                    {!loading && error && (
                        <div>
                            <p className="auth-inline-error">{error}</p>
                            <button
                                type="button"
                                className="btn btn--ghost"
                                onClick={load}
                            >
                                {t('common.retry')}
                            </button>
                        </div>
                    )}

                    {!loading && !error && messages.length === 0 && (
                        <EmptyState
                            title={t('dm.chatEmptyTitle')}
                            description={t('dm.chatEmptyDesc')}
                        />
                    )}

                    {!loading && !error && messages.map((message) => (
                        <MessageItem
                            key={message.id}
                            message={message}
                            author={message.author}
                        />
                    ))}

                    {sendError && (
                        <p className="auth-inline-error">{sendError}</p>
                    )}

                    <div ref={bottomRef} />
                </div>

                <MessageComposer
                    placeholder={t('messages.placeholder')}
                    onSend={send}
                    disabled={loading || !!error}
                    allowAttachments
                />
            </main>

            <RightSidebar />
        </div>
    )
}
