import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n'
import Icon from '@/assets/icon/Icon.jsx'
import { assetUrl } from '@/api/client'
import MessageAttachments from './MessageAttachment'
import InviteCard, { extractInviteCodes } from './InviteCard'

export default function MessageItem({ message, author, onReply, onEdit, onDelete, maxLength = 20000 }) {
    const { t } = useI18n()
    const [failedAvatar, setFailedAvatar] = useState(null)
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(message.text || '')
    const [busy, setBusy] = useState(false)
    const [actionError, setActionError] = useState('')
    const [menuOpen, setMenuOpen] = useState(false)
    const menuRef = useRef(null)

    useEffect(() => {
        if (!menuOpen) return undefined
        const close = (event) => {
            if (event.type === 'keydown' && event.key !== 'Escape') return
            if (event.type === 'mousedown' && menuRef.current?.contains(event.target)) return
            setMenuOpen(false)
        }
        document.addEventListener('mousedown', close)
        document.addEventListener('keydown', close)
        return () => {
            document.removeEventListener('mousedown', close)
            document.removeEventListener('keydown', close)
        }
    }, [menuOpen])
    const isSelf = Boolean(message.self || message.authorId === 'me')
    const name = author?.name || author?.displayName || t('common.unknownAuthor')
    const avatar = author?.avatarUrl || author?.avatar || ''
    const inviteCodes = extractInviteCodes(message.text)

    const saveEdit = async (event) => {
        event.preventDefault()
        if (!draft.trim() || draft.trim() === message.text || busy) {
            if (draft.trim() === message.text) setEditing(false)
            return
        }
        setBusy(true)
        setActionError('')
        try {
            await onEdit?.(message.id, draft.trim())
            setEditing(false)
        } catch (error) {
            setActionError(error?.message || t('messages.editFailed'))
        } finally {
            setBusy(false)
        }
    }

    const removeMessage = async () => {
        if (busy || !onDelete) return
        if (!window.confirm(t('messages.confirmDelete'))) return
        setBusy(true)
        setActionError('')
        try { await onDelete(message.id) } catch (error) {
            setActionError(error?.message || t('messages.deleteFailed'))
        } finally { setBusy(false) }
    }

    const jumpToReply = () => {
        const target = document.getElementById(`message-${message.replyTo?.id}`)
        if (!target) return
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        target.classList.remove('message--highlight')
        void target.offsetWidth
        target.classList.add('message--highlight')
        window.setTimeout(() => target.classList.remove('message--highlight'), 1800)
    }

    const menuNode = (
        <div className={`message__menu${menuOpen ? ' is-open' : ''}`} ref={menuRef}>
            <button
                type="button"
                className="message__menu-btn"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={t('common.more')}
                title={t('common.more')}
                disabled={busy}
            >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
                </svg>
            </button>
            {menuOpen && (
                <div className="message__menu-list" role="menu">
                    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onReply?.(message) }}>
                        <Icon name="message-square" /> <span>{t('messages.reply')}</span>
                    </button>
                    {isSelf && (
                        <>
                            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setDraft(message.text || ''); setEditing(true) }}>
                                <Icon name="pencil" /> <span>{t('messages.edit')}</span>
                            </button>
                            <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenuOpen(false); removeMessage() }}>
                                <Icon name="trash" /> <span>{t('messages.delete')}</span>
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    )

    return (
        <div id={`message-${message.id}`} className={`message ${isSelf ? 'message--self' : ''}`}>
            <div className="message__avatar">
                {avatar && avatar !== failedAvatar ? (
                    <img src={assetUrl(avatar)} alt="" onError={() => setFailedAvatar(avatar)} />
                ) : (
                    <Icon name="user" />
                )}
            </div>

            <div className="message__body">
                <div className="message__head">
                    <span className="message__author">{name}</span>
                    {message.time && <span className="message__time">{message.time}</span>}
                    {isSelf && message.status && (
                        <span
                            className={`message__status message__status--head ${message.status === 'read' ? 'message__status--read' : ''}`}
                            title={message.status === 'read' ? t('attach.statusRead') : t('attach.statusSent')}
                            aria-label={message.status === 'read' ? t('attach.statusRead') : t('attach.statusSent')}
                        >{message.status === 'read' ? '✓✓' : '✓'}</span>
                    )}
                    {message.editedAt && <span className="message__edited">{t('messages.edited')}</span>}
                </div>

                {message.replyTo && (
                    <div
                        className="message__reply-reference message__reply-reference--link"
                        role="button"
                        tabIndex={0}
                        onClick={jumpToReply}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); jumpToReply() } }}
                    >
                        <span>{t('messages.replyingTo')} {message.replyTo.author || t('common.unknownAuthor')}</span>
                        <p>{message.replyTo.text}</p>
                    </div>
                )}

                {editing ? (
                    <form className="message__edit-form" onSubmit={saveEdit}>
                        <textarea autoFocus value={draft} maxLength={maxLength} onChange={(event) => setDraft(event.target.value)} aria-label={t('messages.edit')} />
                        <div>
                            <button type="button" className="btn btn--ghost" onClick={() => { setEditing(false); setDraft(message.text || '') }} disabled={busy}>{t('common.cancel')}</button>
                            <button type="submit" className="btn btn--primary" disabled={busy || !draft.trim()}>{busy ? t('common.saving') : t('common.save')}</button>
                        </div>
                    </form>
                ) : (
                    (message.text || !message.attachments?.length) ? (
                        <div className="message__line">
                            {message.text ? <div className="message__text">{message.text}</div> : null}
                            {menuNode}
                        </div>
                    ) : null
                )}

                {actionError && <p className="auth-inline-error" role="alert">{actionError}</p>}
                {inviteCodes.map((code) => <InviteCard key={code} code={code} />)}
                {!editing && !message.text && message.attachments?.length ? (
                    <div className="message__attach-wrap">
                        <MessageAttachments attachments={message.attachments} />
                        {menuNode}
                    </div>
                ) : (
                    <MessageAttachments attachments={message.attachments} />
                )}

                {message.code && <pre className="code">{message.code}</pre>}

                {message.reactions?.length > 0 && (
                    <div className="reactions">
                        {message.reactions.map((reaction, index) => (
                            <span key={reaction.id ?? index} className="reaction"><Icon name="smile" /> {reaction.count}</span>
                        ))}
                    </div>
                )}

                {message.thread && <span className="thread-link">{t('messages.replies', { count: message.thread.replies })}</span>}

            </div>
        </div>
    )
}
