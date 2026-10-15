import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import RightSidebar from '@/components/RightSidebar'
import InviteDialog from '@/components/InviteDialog'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'
import { api } from '@/api'
import { useI18n } from '@/i18n'
import { useAppEvent } from '@/hooks/useAppEvent'
import Icon from '@/assets/icon/Icon.jsx'
import { sortByRecentVisit } from '@/utils/recentVisits'

export default function Home() {
    const { t } = useI18n()
    const navigate = useNavigate()
    const [query, setQuery] = useState('')
    const [channels, setChannels] = useState([])
    const [spaces, setSpaces] = useState([])
    const [friends, setFriends] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [inviteOpen, setInviteOpen] = useState(false)
    const [visitTick, setVisitTick] = useState(0)

    const load = async () => {
        setLoading(true)
        setError('')

        try {
            const [c, s, f] = await Promise.all([
                api.getChannels(),
                api.getSpaces(),
                api.getFriends(),
            ])

            setChannels(c)
            setSpaces(s)
            setFriends(f)
        } catch (e) {
            setError(e?.message || t('home.loadFailed'))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
        const updateVisits = () => setVisitTick((value) => value + 1)
        window.addEventListener('nebula:recent-visits-updated', updateVisits)
        window.addEventListener('storage', updateVisits)
        return () => {
            window.removeEventListener('nebula:recent-visits-updated', updateVisits)
            window.removeEventListener('storage', updateVisits)
        }
    }, [])

    useAppEvent(['space_updated', 'space_deleted'], async () => {
        try {
            const [c, s] = await Promise.all([api.getChannels(), api.getSpaces()])
            setChannels(c)
            setSpaces(s)
        } catch {
            return
        }
    })

    const spaceById = useMemo(() => {
        const map = {}
        for (const item of spaces) map[item.id] = item
        return map
    }, [spaces])

    const term = query.trim()
    const needle = term.toLowerCase()

    const shown = useMemo(() => {
        if (!needle) return {
            channels: sortByRecentVisit(channels, 'channels').slice(0, 8),
            spaces: sortByRecentVisit(spaces, 'spaces').slice(0, 8),
            friends,
        }

        const has = (...values) =>
            values.some((value) => String(value ?? '').toLowerCase().includes(needle))

        return {
            channels: sortByRecentVisit(channels.filter((item) => has(item.name, item.desc, spaces.find((sp) => String(sp.id) === String(item.spaceId))?.description)), 'channels').slice(0, 8),
            spaces: sortByRecentVisit(spaces.filter((item) => has(item.name, item.description)), 'spaces').slice(0, 8),
            friends: friends.filter((item) => has(item.name, item.username)),
        }
    }, [needle, channels, spaces, friends, visitTick])

    const nothingFound =
        Boolean(needle) &&
        !loading &&
        shown.channels.length + shown.spaces.length + shown.friends.length === 0

    const openFullSearch = (event) => {
        event?.preventDefault()
        if (!term) return
        navigate(`/app/search?q=${encodeURIComponent(term)}`)
    }

    return (
        <div className="app-layout">

            <main className="main">
                <div className="main__topbar">
                    <form
                        className="main__search-form"
                        role="search"
                        onSubmit={openFullSearch}
                    >
                        <input
                            className="main__search"
                            type="search"
                            enterKeyHint="search"
                            autoComplete="off"
                            placeholder={t('home.searchPlaceholder')}
                            aria-label={t('home.searchPlaceholder')}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </form>

                    <nav className="main__tabs">
                        <span className="main__tab main__tab--active">
                            {t('nav.home')}
                        </span>
                        <Link to="/app/spaces" className="main__tab">
                            {t('nav.spaces')}
                        </Link>
                        <Link to="/app/friends" className="main__tab">
                            {t('home.tabPeople')}
                        </Link>
                    </nav>
                </div>

                <div className="main__content">
                    <h1 className="main__hello">{t('home.greeting')}</h1>

                    {term && (
                        <div className="feed-search-note" role="status">
                            <span>{t('home.searchResults', { query: term })}</span>

                            <button
                                type="button"
                                className="feed-search-note__btn"
                                onClick={openFullSearch}
                            >
                                {t('home.searchEverywhere')}
                            </button>
                        </div>
                    )}

                    {nothingFound && (
                        <EmptyState
                            icon="search"
                            title={t('home.searchNothingTitle')}
                            description={t('home.searchNothingDesc')}
                        />
                    )}

                    {loading && <p className="muted">{t('common.loading')}</p>}

                    {error && (
                        <>
                            <p className="auth-inline-error">{error}</p>
                            <button
                                className="btn btn--ghost"
                                onClick={load}
                            >
                                {t('common.retry')}
                            </button>
                        </>
                    )}

                    {!loading && !error && !needle && channels.length === 0 && (
                        <EmptyState
                            icon="hash"
                            title={t('home.noChannelsTitle')}
                            description={t('home.noChannelsDesc')}
                        />
                    )}

                    {!loading && !error && shown.channels.length > 0 && (
                        <div className="channels">
                            {shown.channels.slice(0, 8).map((ch) => (
                                <Link
                                    key={ch.id}
                                    to={`/app/channels/${ch.id}`}
                                    className="channel-card"
                                >
                                    <div className="channel-card__body">
                                        <div className="channel-card__name">{ch.name}</div>
                                        <div className="channel-card__desc">
                                            {spaceById[ch.spaceId]?.description || ch.desc || spaceById[ch.spaceId]?.name}
                                        </div>
                                    </div>
                                    <div className={`channel-card__icon${spaceById[ch.spaceId]?.avatarUrl ? ' channel-card__icon--avatar' : ''}`}>
                                        {spaceById[ch.spaceId]?.avatarUrl ? (
                                            <Avatar src={spaceById[ch.spaceId].avatarUrl} label={spaceById[ch.spaceId].name} size={24} />
                                        ) : <Icon name="hash" />}
                                    </div>

                                    {ch.unread > 0 && (
                                        <span className="channel-card__badge">
                                            {ch.unread}
                                        </span>
                                    )}
                                </Link>
                            ))}
                        </div>
                    )}

                    {(!needle || shown.spaces.length > 0) && (
                    <>
                    <div className="section-head">
                        <h2 className="section-title">{t('home.spacesForYou')}</h2>
                        <Link to="/app/spaces" className="section-more">
                            {t('home.showAll')}
                        </Link>
                    </div>

                    {!loading && !error && !needle && spaces.length === 0 && (
                        <p className="muted">{t('home.noSpaces')}</p>
                    )}

                    {!loading && !error && shown.spaces.length > 0 && (
                        <div className="spaces">
                            {shown.spaces.slice(0, 8).map((sp) => (
                                <Link
                                    key={sp.id}
                                    to={`/app/spaces/${sp.id}`}
                                    className="space-card"
                                >
                                    <div className="space-card__art">
                                        {sp.avatarUrl || sp.avatar_url ? (
                                            <Avatar src={sp.avatarUrl || sp.avatar_url} label={sp.name} size={44} />
                                        ) : (
                                            sp.emoji || <Icon name="users" />
                                        )}
                                    </div>
                                    <div className="space-card__info">
                                        <div className="space-card__name">{sp.name}</div>
                                        {sp.description && (
                                            <div className="space-card__desc">{sp.description}</div>
                                        )}
                                        <div className="space-card__members">
                                            {t('home.members', { count: sp.members })}
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}

                    </>
                    )}

                    {(!needle || shown.friends.length > 0) && (
                    <>
                    <h2 className="section-title" style={{ marginTop: 24 }}>
                        {t('nav.friends')}
                    </h2>

                    {!loading && !error && !needle && friends.length === 0 && (
                        <p className="muted">{t('friends.emptyTitle')}</p>
                    )}

                    {!loading && !error && shown.friends.length > 0 && (
                        <div className="friends">
                            {shown.friends.map((f) => (
                                <Link
                                    key={f.id}
                                    to={`/app/dm/${f.id}`}
                                    className="friend-card"
                                >
                                    <Avatar src={f.avatarUrl || f.avatar_url || f.avatar} label={f.displayName || f.name} size={80} />
                                    <div className="friend-card__name">{f.name}</div>
                                    <div className={`friend-card__status friend-card__status--${f.status}`}>
                                        {f.status === 'voice'
                                            ? t('status.voice')
                                            : f.status === 'online'
                                                ? t('status.online')
                                                : t('status.offline')}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                    </>
                    )}
                </div>
            </main>

            <RightSidebar />

            <InviteDialog
                open={inviteOpen}
                spaceId={spaces[0]?.id}
                onClose={() => setInviteOpen(false)}
            />
        </div>
    )
}