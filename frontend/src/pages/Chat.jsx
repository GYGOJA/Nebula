import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import RightSidebar from '@/components/RightSidebar'
import SpaceChannelSidebar from '@/components/SpaceChannelSidebar'
import SpaceMembersSidebar from '@/components/SpaceMembersSidebar'
import SpaceNavButton from '@/components/SpaceNavButton'
import MessageList from '@/components/MessageList'
import MessageComposer from '@/components/MessageComposer'
import InviteDialog from '@/components/InviteDialog'
import { api } from '@/api'
import { useI18n } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/context/NotificationsContext'
import { useAppEvent } from '@/hooks/useAppEvent'

export default function Chat() {
    const { t, language } = useI18n()
    const { channelId } = useParams()
    const { user } = useAuth()
    const { subscribe } = useNotifications()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const targetMessageId = searchParams.get('message')

    const [channel, setChannel] = useState(null)
    const [space, setSpace] = useState(null)
    const [messages, setMessages] = useState([])
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [inviteOpen, setInviteOpen] = useState(false)
    const [replyTo, setReplyTo] = useState(null)

    const section = space?.channels?.find((item) => item.id === channelId)
    const canWrite = section ? section.canWrite !== false : true

    const authorsById = useMemo(() => {
        const map = {}
        for (const u of users) map[u.id] = u
        map.me = {
            id: user?.id,
            name: user?.displayName || user?.name || user?.username || t('common.you'),
            displayName: user?.displayName || user?.name || user?.username || t('common.you'),
            avatarUrl: user?.avatarUrl || user?.avatar_url || user?.avatar || '',
        }
        return map
    }, [users, user, language])

    const loadAll = async () => {
        setLoading(true)
        setError('')

        try {
            const [channels, msgs, friends] = await Promise.all([
                api.getChannels(),
                api.getMessages(channelId),
                api.getFriends(),
            ])

            const ch = channels.find((c) => c.id === channelId)
            setChannel(ch || null)
            let members = []
            if (ch?.spaceId) {
                try { setSpace(await api.getSpace(ch.spaceId)) } catch { setSpace(null) }
                try {
                    const list = await api.getSpaceMembers(ch.spaceId)
                    members = Array.isArray(list) ? list : []
                } catch {
                    members = []
                }
            } else {
                setSpace(null)
            }
            setMessages(msgs)
            setUsers([...friends, ...members])
        } catch (e) {
            setError(e?.message || t('chat.loadFailed'))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadAll()
    }, [channelId])

    // Opened from the Files / Threads panel: scroll to the message and highlight it.
    useEffect(() => {
        if (!targetMessageId || loading) return undefined

        const timer = window.setTimeout(() => {
            const target = document.getElementById(`message-${targetMessageId}`)

            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' })
                target.classList.remove('message--highlight')
                void target.offsetWidth
                target.classList.add('message--highlight')
                window.setTimeout(() => target.classList.remove('message--highlight'), 1800)
            }

            setSearchParams((params) => {
                params.delete('message')
                return params
            }, { replace: true })
        }, 150)

        return () => window.clearTimeout(timer)
    }, [targetMessageId, loading, channelId])

    const refetchMessages = useCallback(async () => {
        try {
            const result = await api.getMessages(channelId)

            if (Array.isArray(result)) setMessages(result)
        } catch {
            return
        }
    }, [channelId])

    useEffect(() => subscribe((event) => {
        if (event.type === 'reconnected') {
            refetchMessages()

            return
        }

        const data = event.data || {}
        const id = data.channelId
        if (String(id) !== String(channelId)) return

        if (event.type === 'channel_message_updated') {
            setMessages((previous) => previous.map((item) => String(item.id) === String(data.messageId)
                ? { ...item, text: data.text, content: data.text, editedAt: data.editedAt } : item))
            return
        }
        if (event.type === 'channel_message_deleted') {
            setMessages((previous) => previous.filter((item) => String(item.id) !== String(data.messageId)))
            return
        }
        if (event.type !== 'channel_message') return
        const { message } = data
        if (!message) return
        setMessages((previous) => previous.some((item) => item.id === message.id) ? previous : [...previous, message])
    }), [subscribe, channelId, refetchMessages])

    // Roles or channel access changed: refresh permissions, and leave if access was taken away.
    useAppEvent(['space_updated', 'space_deleted'], async () => {
        try {
            const channels = await api.getChannels()
            const current = channels.find((item) => item.id === channelId)

            if (!current) {
                navigate(channel?.spaceId ? `/app/spaces/${channel.spaceId}` : '/app', { replace: true })
                return
            }

            if (current.spaceId) setSpace(await api.getSpace(current.spaceId))
        } catch {
            return
        }
    })

    if (!loading && !channel) return <Navigate to="/app" replace />

    const send = async (text, options = {}) => {
        const msg = await api.sendMessage(channelId, text, options)
        setMessages((prev) => (prev.some((item) => item.id === msg.id) ? prev : [...prev, msg]))
    }

    const editMessage = async (messageId, text) => {
        const result = await api.editMessage(channelId, messageId, text)
        setMessages((prev) => prev.map((item) => String(item.id) === String(messageId)
            ? { ...item, text: result.text || text, content: result.text || text, editedAt: result.editedAt } : item))
    }

    const deleteMessage = async (messageId) => {
        await api.deleteMessage(channelId, messageId)
        setMessages((prev) => prev.filter((item) => String(item.id) !== String(messageId)))
    }

    const beginReply = (message) => setReplyTo({
        id: message.id,
        text: message.text || message.attachments?.[0]?.name || '',
        authorName: message.author?.displayName || message.author?.name || authorsById[message.authorId]?.name || t('common.unknownAuthor'),
    })

    if (channel?.spaceId) {
        return (
            <div className="app-layout app-layout--space">
                <SpaceChannelSidebar spaceId={channel.spaceId} activeChannelId={channelId} spaceName={space?.name} />
                <main className="chat chat--space">
                    <header className="chat__header">
                        <SpaceNavButton />
                        <div className="chat__title-wrap">
                            <div className="chat__title"><span className="chat__title-hash">#</span> {channel?.name || channelId}</div>
                            <div className="chat__sub">Общайтесь с участниками пространства</div>
                        </div>
                        <div className="chat__header-spacer" />
                        <button type="button" className="main__invite" onClick={() => setInviteOpen(true)}>{t('common.invite')}</button>
                    </header>
                    <MessageList messages={messages} authorsById={authorsById} loading={loading} error={error} onRetry={loadAll} onReply={beginReply} onEdit={editMessage} onDelete={deleteMessage} />
                    <MessageComposer placeholder={canWrite ? `Написать в #${channel?.name || ''}` : t('chat.noWrite')} onSend={send} disabled={loading || !!error || !canWrite} allowAttachments replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />
                </main>
                <SpaceMembersSidebar space={space} channelId={channelId} />
                <InviteDialog open={inviteOpen} spaceId={channel?.spaceId} onClose={() => setInviteOpen(false)} />
            </div>
        )
    }

    return (
        <div className="app-layout">

            <main className="chat">
                <header className="chat__header">
                    <div className="chat__title-wrap">
                        <div className="chat__title">
                            # {channel?.name || channelId}
                        </div>
                        <div className="chat__sub">
                            {channel?.desc || t('chat.channel')}
                        </div>
                    </div>

                    <input
                        className="chat__search"
                        placeholder={t('chat.searchPlaceholder')}
                        readOnly
                    />

                    <button
                        type="button"
                        className="main__invite"
                        onClick={() => setInviteOpen(true)}
                    >
                        {t('common.invite')}
                    </button>
                </header>

                <MessageList
                    messages={messages}
                    authorsById={authorsById}
                    loading={loading}
                    error={error}
                    onRetry={loadAll}
                    onReply={beginReply}
                    onEdit={editMessage}
                    onDelete={deleteMessage}
                />

                <MessageComposer
                    placeholder={t('chat.messageTo', {
                        name: channel?.name || channelId,
                    })}
                    onSend={send}
                    disabled={loading || !!error}
                    allowAttachments
                    replyTo={replyTo}
                    onCancelReply={() => setReplyTo(null)}
                />
            </main>

            <RightSidebar />

            <InviteDialog
                open={inviteOpen}
                spaceId={channel?.spaceId}
                onClose={() => setInviteOpen(false)}
            />
        </div>
    )
}
