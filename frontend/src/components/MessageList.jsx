import { useEffect, useRef } from 'react'
import MessageItem from './MessageItem'
import { useI18n } from '@/i18n'

export default function MessageList({
                                        messages,
                                        authorsById = {},
                                        loading,
                                        error,
                                        onRetry,
                                        onReply,
                                        onEdit,
                                        onDelete,
                                    }) {
    const { t } = useI18n()
    const bottomRef = useRef(null)
    const count = messages.length

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ block: 'end' })
    }, [count, loading])

    if (loading) {
        return (
            <div className="chat__messages">
                <p className="muted">{t('messages.loading')}</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="chat__messages">
                <p className="auth-inline-error">{error}</p>

                {onRetry && (
                    <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={onRetry}
                    >
                        {t('common.retry')}
                    </button>
                )}
            </div>
        )
    }

    if (!messages.length) {
        return (
            <div className="chat__messages">
                <p className="muted">
                    {t('messages.empty')}
                </p>
            </div>
        )
    }

    return (
        <div className="chat__messages">
            {messages.map((m) => (
                <MessageItem
                    key={m.id}
                    message={m}
                    author={authorsById[m.authorId] || m.author}
                    onReply={onReply}
                    onEdit={onEdit}
                    onDelete={onDelete}
                />
            ))}
            <div ref={bottomRef} />
        </div>
    )
}
