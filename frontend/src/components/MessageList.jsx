import MessageItem from './MessageItem'
import { useI18n } from '@/i18n'

export default function MessageList({
                                        messages,
                                        authorsById = {},
                                        loading,
                                        error,
                                        onRetry,
                                    }) {
    const { t } = useI18n()

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
                    author={authorsById[m.authorId]}
                />
            ))}
        </div>
    )
}
