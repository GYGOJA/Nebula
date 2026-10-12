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
                                            {conversation.last?.text || t('dm.noMessages')}
                                        </div>
                                    </div>
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

const POLL_MS = 4000

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

    // Пока нет WebSocket, подтягиваем новые сообщения периодическим опросом.
    useEffect(() => {
        if (loading || error) return undefined

        let alive = true

        const timer = setInterval(async () => {
            try {
                const result = await api.getDmMessages(userId)

                if (!alive || !Array.isArray(result)) return

                setMessages((previous) => {
                    const lastNew = result[result.length - 1]?.id
                    const lastOld = previous[previous.length - 1]?.id

                    if (lastNew === lastOld && result.length === previous.length) {
                        return previous
                    }

                    return result.map(normalize)
                })
            } catch {
                // временная ошибка сети: попробуем в следующий тик
            }
        }, POLL_MS)

        return () => {
            alive = false
            clearInterval(timer)
        }
    }, [userId, loading, error])

    useEffect(() => {
        const lastId = messages[messages.length - 1]?.id

        if (lastId !== lastIdRef.current) {
            lastIdRef.current = lastId
            bottomRef.current?.scrollIntoView({ block: 'end' })
        }
    }, [messages])

    const send = async (text) => {
        setSendError('')

        try {
            const message = await api.sendDm(userId, text)

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
                />
            </main>

            <RightSidebar />
        </div>
    )
}
