import { useState } from 'react'
import { useI18n } from '@/i18n'

export default function MessageComposer({
                                            placeholder,
                                            onSend,
                                            disabled = false,
                                        }) {
    const { t } = useI18n()
    const resolvedPlaceholder = placeholder ?? t('messages.placeholder')
    const [text, setText] = useState('')
    const [sending, setSending] = useState(false)

    const handleSend = async () => {
        const value = text.trim()

        if (!value || sending || disabled) return

        setSending(true)

        try {
            await onSend(value)
            setText('')
        } catch {
        } finally {
            setSending(false)
        }
    }

    const handleKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            handleSend()
        }
    }

    return (
        <div className="chat__composer">
            <div className="chat__composer-inner">
                <textarea
                    className="chat__composer-input"
                    placeholder={resolvedPlaceholder}
                    value={text}
                    disabled={disabled || sending}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    aria-label={resolvedPlaceholder}
                />

                <button
                    type="button"
                    className="chat__composer-send"
                    onClick={handleSend}
                    disabled={disabled || sending || !text.trim()}
                    title={t('messages.send')}
                    aria-label={t('messages.sendLabel')}
                >
                    <span className="icon-placeholder" aria-hidden="true" />
                </button>
            </div>
        </div>
    )
}