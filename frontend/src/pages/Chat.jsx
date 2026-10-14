import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import RightSidebar from '@/components/RightSidebar'
import MessageList from '@/components/MessageList'
import MessageComposer from '@/components/MessageComposer'
import InviteDialog from '@/components/InviteDialog'
import { api } from '@/api'
import { useI18n } from '@/i18n'

export default function Chat() {
    const { t, language } = useI18n()
    const { channelId } = useParams()

    const [channel, setChannel] = useState(null)
    const [messages, setMessages] = useState([])
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [inviteOpen, setInviteOpen] = useState(false)

    const authorsById = useMemo(() => {
        const map = {
            me: { name: t('common.you'), avatar: '' },
        }
        for (const u of users) map[u.id] = u
        return map
    }, [users, language])

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
            setMessages(msgs)
            setUsers(friends)
        } catch (e) {
            setError(e?.message || t('chat.loadFailed'))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadAll()
    }, [channelId])

    if (!loading && !channel) return <Navigate to="/app" replace />

    const send = async (text) => {
        const msg = await api.sendMessage(channelId, text)
        setMessages((prev) => [...prev, msg])
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
                />

                <MessageComposer
                    placeholder={t('chat.messageTo', {
                        name: channel?.name || channelId,
                    })}
                    onSend={send}
                    disabled={loading || !!error}
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