import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api'
import { useI18n } from '@/i18n'
import { useAppEvent } from '@/hooks/useAppEvent'
import usePagedList from '@/hooks/usePagedList'
import { formatRelative } from '@/utils/format'
import Icon from '@/assets/icon/Icon.jsx'
import Avatar from './Avatar'
import EmptyState from './EmptyState'
import PanelScope from './PanelScope'

const PAGE = 20

function authorName(user, fallback) {
    return user?.displayName || user?.name || fallback
}

// A thread is a message that people have replied to. The panel lists the most recently
// active threads of the group; opening one scrolls the channel to the original message.
function ThreadCard({ thread, showChannel, onOpen }) {
    const { t, locale } = useI18n()
    const name = authorName(thread.author, t('common.user'))
    const lastName = authorName(thread.lastReplyAuthor, t('common.user'))

    return (
        <li>
            <button type="button" className="spanel-thread" onClick={() => onOpen(thread)}>
                <span className="spanel-thread__head">
                    <Avatar src={thread.author?.avatarUrl} label={name} size={26} />
                    <strong>{name}</strong>
                    {showChannel && (
                        <span className="spanel-chip"><Icon name="hash" />{thread.channelName}</span>
                    )}
                </span>

                <span className="spanel-thread__text">
                    {thread.text || (thread.hasAttachment ? t('threads.attachment') : '…')}
                </span>

                <span className="spanel-thread__stats">
                    <Icon name="git-branch" />
                    <b>{t('threads.replies', { count: thread.replies })}</b>
                    {thread.participants > 1 && <span>· {t('threads.participants', { count: thread.participants })}</span>}
                    <span className="spanel-thread__time">{formatRelative(thread.lastReplyAt, locale)}</span>
                </span>

                {thread.lastReplyText && (
                    <span className="spanel-thread__last">
                        <em>{lastName}:</em> {thread.lastReplyText}
                    </span>
                )}
            </button>
        </li>
    )
}

export default function SpaceThreadsPanel({ spaceId, channelId }) {
    const { t } = useI18n()
    const navigate = useNavigate()
    const [scope, setScope] = useState('space')
    const channelFilter = scope === 'channel' && channelId ? channelId : ''

    const fetchPage = useCallback(
        (offset) => api.getSpaceThreads(spaceId, { channelId: channelFilter, offset, limit: PAGE }),
        [spaceId, channelFilter]
    )

    const list = usePagedList(fetchPage, [spaceId, channelFilter])

    useAppEvent(['channel_message', 'channel_message_deleted'], list.scheduleReload)

    const open = (thread) => navigate(`/app/channels/${thread.channelId}?message=${thread.messageId}`)

    return (
        <div className="rightbar__content spanel">
            {channelId && <PanelScope scope={scope} onChange={setScope} />}

            {list.loading && <p className="muted">{t('common.loading')}</p>}

            {!list.loading && list.error && (
                <div>
                    <p className="auth-inline-error">{t('threads.loadFailed')}</p>
                    <button type="button" className="btn btn--ghost" onClick={() => list.reload()}>
                        {t('common.retry')}
                    </button>
                </div>
            )}

            {!list.loading && !list.error && list.items.length === 0 && (
                <EmptyState
                    icon="git-branch"
                    title={t('threads.emptyTitle')}
                    description={t('threads.emptyDesc')}
                />
            )}

            {!list.loading && !list.error && list.items.length > 0 && (
                <ul className="spanel-list">
                    {list.items.map((thread) => (
                        <ThreadCard key={thread.id} thread={thread} showChannel={!channelFilter} onOpen={open} />
                    ))}
                </ul>
            )}

            {list.hasMore && !list.loading && (
                <button type="button" className="btn btn--ghost spanel-more" onClick={list.loadMore} disabled={list.loadingMore}>
                    {list.loadingMore ? t('common.loading') : t('panel.loadMore')}
                </button>
            )}
        </div>
    )
}
