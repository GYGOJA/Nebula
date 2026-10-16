import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api'
import { fetchBlob } from '@/api/client'
import { useI18n } from '@/i18n'
import { useAppEvent } from '@/hooks/useAppEvent'
import usePagedList from '@/hooks/usePagedList'
import { saveAttachment } from '@/utils/downloads'
import { formatBytes, formatRelative } from '@/utils/format'
import Icon from '@/assets/icon/Icon.jsx'
import EmptyState from './EmptyState'
import PanelScope from './PanelScope'

const PAGE = 30

const KINDS = [
    { id: '', labelKey: 'spacefiles.all' },
    { id: 'image', labelKey: 'spacefiles.images' },
    { id: 'video', labelKey: 'spacefiles.video' },
    { id: 'audio', labelKey: 'spacefiles.audio' },
    { id: 'file', labelKey: 'spacefiles.docs' },
]

function extension(name) {
    const ext = String(name || '').split('.').pop() || ''

    return (ext.length <= 4 ? ext : ext.slice(0, 4)).toUpperCase() || '•'
}

function FileThumb({ file }) {
    const [src, setSrc] = useState('')

    useEffect(() => {
        if (file.kind !== 'image') return undefined

        let alive = true

        fetchBlob(file.url).then((url) => alive && setSrc(url)).catch(() => {})

        return () => {
            alive = false
        }
    }, [file.url, file.kind])

    if (src) return <img className="spanel-file__thumb" src={src} alt="" />

    return <span className="spanel-file__ext">{extension(file.name)}</span>
}

function FileRow({ file, showChannel, onJump }) {
    const { t, locale } = useI18n()
    const [busy, setBusy] = useState(false)
    const author = file.author?.displayName || file.author?.name || t('common.user')

    const open = async () => {
        if (busy) return

        setBusy(true)

        try {
            if (file.kind === 'image') {
                window.open(await fetchBlob(file.url), '_blank', 'noopener')
            } else {
                await saveAttachment(file)
            }
        } catch {
            // The error banner of the main request handles auth problems; nothing to show here.
        } finally {
            setBusy(false)
        }
    }

    return (
        <li className="spanel-file">
            <button type="button" className="spanel-file__main" onClick={open} title={file.name} disabled={busy}>
                <FileThumb file={file} />

                <span className="spanel-file__info">
                    <span className="spanel-file__name">{file.name}</span>
                    <span className="spanel-file__meta">
                        {formatBytes(file.size, locale)} · {author} · {formatRelative(file.createdAt, locale)}
                    </span>
                    {showChannel && (
                        <span className="spanel-chip"><Icon name="hash" />{file.channelName}</span>
                    )}
                </span>
            </button>

            <button
                type="button"
                className="spanel-file__jump"
                onClick={() => onJump(file)}
                title={t('panel.goToMessage')}
                aria-label={t('panel.goToMessage')}
            >
                <Icon name="message-square" />
            </button>
        </li>
    )
}

export default function SpaceFilesPanel({ spaceId, channelId }) {
    const { t } = useI18n()
    const navigate = useNavigate()
    const [kind, setKind] = useState('')
    const [scope, setScope] = useState('space')
    const channelFilter = scope === 'channel' && channelId ? channelId : ''

    const fetchPage = useCallback(
        (offset) => api.getSpaceFiles(spaceId, { kind, channelId: channelFilter, offset, limit: PAGE }),
        [spaceId, kind, channelFilter]
    )

    const list = usePagedList(fetchPage, [spaceId, kind, channelFilter])

    useAppEvent(['channel_message', 'channel_message_deleted'], list.scheduleReload)

    const jump = (file) => navigate(`/app/channels/${file.channelId}?message=${file.messageId}`)

    return (
        <div className="rightbar__content spanel">
            {channelId && <PanelScope scope={scope} onChange={setScope} />}

            <div className="spanel-filters" role="tablist">
                {KINDS.map((item) => (
                    <button
                        key={item.id || 'all'}
                        type="button"
                        role="tab"
                        aria-selected={kind === item.id}
                        className={`spanel-filter${kind === item.id ? ' is-active' : ''}`}
                        onClick={() => setKind(item.id)}
                    >
                        {t(item.labelKey)}
                    </button>
                ))}
            </div>

            {list.loading && <p className="muted">{t('common.loading')}</p>}

            {!list.loading && list.error && (
                <div>
                    <p className="auth-inline-error">{t('spacefiles.loadFailed')}</p>
                    <button type="button" className="btn btn--ghost" onClick={() => list.reload()}>
                        {t('common.retry')}
                    </button>
                </div>
            )}

            {!list.loading && !list.error && list.items.length === 0 && (
                <EmptyState
                    icon="folder"
                    title={t(kind ? 'spacefiles.emptyFilteredTitle' : 'spacefiles.emptyTitle')}
                    description={t(kind ? 'spacefiles.emptyFilteredDesc' : 'spacefiles.emptyDesc')}
                />
            )}

            {!list.loading && !list.error && list.items.length > 0 && (
                <ul className="spanel-list">
                    {list.items.map((file) => (
                        <FileRow key={file.id} file={file} showChannel={!channelFilter} onJump={jump} />
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
