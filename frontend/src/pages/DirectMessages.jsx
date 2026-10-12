import { useCallback, useEffect, useState } from 'react'
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

export function DmChat() {
    const { t } = useI18n()
    const { userId } = useParams()
    const [messages, setMessages] = useState([])
    const [conversation, setConversation] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [sendError, setSendError] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        setError('')

        try {
            const [allConversations, result] = await Promise.all([
                api.getDmConversations(),
                api.getDmMessages(userId),
            ])

            setConversation(
                allConversations.find(
                    (item) => String(item.userId) === String(userId)
                ) || null
            )
            setMessages(Array.isArray(result) ? result : [])
        } catch (err) {
            setError(err?.message || t('dm.chatLoadFailed'))
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => {
        load()
    }, [load])

    const send = async (text) => {
        setSendError('')

        try {
            const message = await api.sendDm(userId, text)
            setMessages((previous) => [...previous, message])
        } catch (err) {
            setSendError(err?.message || t('dm.sendFailed'))
            throw err
        }
    }

    return (
        <div className="app-layout">
            <NavigationRail />
            <Sidebar />

            <main className="chat">
                <header className="chat__header">
                    <Avatar
                        src={conversation?.avatarUrl || conversation?.avatar}
                        label={conversation?.name}
                        size={40}
                    />

                    <div className="chat__title-wrap">
                        <div className="chat__title">
                            {conversation?.displayName ||
                                conversation?.name ||
                                t('nav.directMessages')}
                        </div>
                        <div className="chat__sub">
                            {conversation?.status === 'online'
                                ? t('friends.statusOnline')
                                : t('friends.statusUnavailable')}
                        </div>
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