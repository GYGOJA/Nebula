import { useState } from 'react'
import { useI18n } from '@/i18n'
import Icon from '@/assets/icon/Icon.jsx'

export default function MessageItem({ message, author }) {
    const { t } = useI18n()
    const [failedAvatar, setFailedAvatar] = useState(null)
    const isSelf = message.self || message.authorId === 'me'
    const name = author?.name || author?.displayName || t('common.unknownAuthor')
    const avatar = author?.avatar || ''

    return (
        <div className={`message ${isSelf ? 'message--self' : ''}`}>
            <div className="message__avatar">
                {avatar && avatar !== failedAvatar ? (
                    <img
                        src={avatar}
                        alt=""
                        onError={() => setFailedAvatar(avatar)}
                    />
                ) : (
                    <Icon name="user" />
                )}
            </div>

            <div className="message__body">
                <div className="message__head">
                    <span className="message__author">{name}</span>

                    {message.time && (
                        <span className="message__time">{message.time}</span>
                    )}
                </div>

                {message.text && (
                    <div className="message__text">{message.text}</div>
                )}

                {message.code && (
                    <pre className="code">{message.code}</pre>
                )}

                {message.reactions?.length > 0 && (
                    <div className="reactions">
                        {message.reactions.map((reaction, index) => (
                            <span
                                key={reaction.id ?? index}
                                className="reaction"
                            >
                                <Icon name="smile" />
                                {' '}
                                {reaction.count}
                            </span>
                        ))}
                    </div>
                )}

                {message.thread && (
                    <span className="thread-link">
                        {t('messages.replies', { count: message.thread.replies })}
                    </span>
                )}
            </div>
        </div>
    )
}
