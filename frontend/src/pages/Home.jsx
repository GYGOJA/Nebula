import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import NavigationRail from '@/components/NavigationRail'
import RightSidebar from '@/components/RightSidebar'
import InviteDialog from '@/components/InviteDialog'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'
import { api } from '@/api'
import { useI18n } from '@/i18n'
import Icon from "@/assets/icon/Icon.jsx";

export default function Home() {
    const { t } = useI18n()
    const [channels, setChannels] = useState([])
    const [spaces, setSpaces] = useState([])
    const [friends, setFriends] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [inviteOpen, setInviteOpen] = useState(false)

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
    }, [])

    return (
        <div className="app-layout">
            <NavigationRail />
            <Sidebar />

            <main className="main">
                <div className="main__topbar">
                    <input
                        className="main__search"
                        placeholder={t('home.searchPlaceholder')}
                        readOnly
                    />

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

                    <button
                        type="button"
                        className="main__invite"
                        onClick={() => setInviteOpen(true)}
                    >
                        {t('common.invite')}
                    </button>
                </div>

                <div className="main__content">
                    <h1 className="main__hello">{t('home.greeting')}</h1>

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

                    {!loading && !error && channels.length === 0 && (
                        <EmptyState
                            icon="hash"
                            title={t('home.noChannelsTitle')}
                            description={t('home.noChannelsDesc')}
                        />
                    )}

                    {!loading && !error && channels.length > 0 && (
                        <div className="channels">
                            {channels.map((ch) => (
                                <Link
                                    key={ch.id}
                                    to={`/app/channels/${ch.id}`}
                                    className="channel-card"
                                >
                                    <div className="channel-card__icon">
                                        <Icon name="hash" />
                                    </div>

                                    <div className="channel-card__body">
                                        <div className="channel-card__name">
                                            {ch.name}
                                        </div>
                                        <div className="channel-card__desc">
                                            {ch.unread > 0
                                                ? t('home.unread', {
                                                    count: ch.unread,
                                                })
                                                : ch.desc}
                                        </div>
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

                    <div className="section-head">
                        <h2 className="section-title">{t('home.spacesForYou')}</h2>
                        <Link to="/app/spaces" className="section-more">
                            {t('home.showAll')}
                        </Link>
                    </div>

                    {!loading && !error && spaces.length === 0 && (
                        <p className="muted">{t('home.noSpaces')}</p>
                    )}

                    {!loading && !error && spaces.length > 0 && (
                        <div className="spaces">
                            {spaces.map((sp) => (
                                <Link
                                    key={sp.id}
                                    to={`/app/spaces/${sp.id}`}
                                    className="space-card"
                                >
                                    <div className="space-card__art">
                                        {sp.emoji || <Icon name="users" />}
                                    </div>
                                    <div className="space-card__name">{sp.name}</div>
                                    <div className="space-card__members">
                                        {t('home.members', { count: sp.members })}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}

                    <h2 className="section-title" style={{ marginTop: 24 }}>
                        {t('nav.friends')}
                    </h2>

                    {!loading && !error && friends.length === 0 && (
                        <p className="muted">{t('friends.emptyTitle')}</p>
                    )}

                    {!loading && !error && friends.length > 0 && (
                        <div className="friends">
                            {friends.map((f) => (
                                <Link
                                    key={f.id}
                                    to={`/app/dm/${f.id}`}
                                    className="friend-card"
                                >
                                    <Avatar label={f.avatar} size={56} />
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