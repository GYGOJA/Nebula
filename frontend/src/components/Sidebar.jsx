import { Link, matchPath, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Avatar from './Avatar'
import Logo from './Logo'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/i18n'
import { navPanel, useNavPanel } from '@/utils/navPanel'
import { useAppEvent } from '@/hooks/useAppEvent'
import { NAV_ITEMS, getActiveNavIndex, isNavItemActive } from '@/utils/navItems'
import Icon from "@/assets/icon/Icon.jsx";

export default function Sidebar() {
    const { t } = useI18n()
    const navigate = useNavigate()
    const { pathname } = useLocation()
    const { logout } = useAuth()
    const [spaces, setSpaces] = useState([])
    const [friends, setFriends] = useState([])
    const [loading, setLoading] = useState(true)
    const [refreshTick, setRefreshTick] = useState(0)
    const panelOpen = useNavPanel()

    useAppEvent(['space_updated', 'space_deleted'], () => setRefreshTick((n) => n + 1))

    const activeIndex = getActiveNavIndex(pathname)
    const activeSpaceId = matchPath('/app/spaces/:id', pathname)?.params.id

    useEffect(() => {
        navPanel.close()
    }, [pathname])

    useEffect(() => {
        if (!panelOpen) return undefined

        const onKeyDown = (event) => {
            if (event.key === 'Escape') navPanel.close()
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [panelOpen])

    useEffect(() => {
        let alive = true

        Promise.all([
            api.getSpaces().catch(() => []),
            api.getFriends().catch(() => []),
        ]).then(([nextSpaces, nextFriends]) => {
            if (!alive) return
            setSpaces(Array.isArray(nextSpaces) ? nextSpaces : [])
            setFriends(Array.isArray(nextFriends) ? nextFriends : [])
            setLoading(false)
        })

        return () => {
            alive = false
        }
    }, [pathname, refreshTick])

    const statusLabel = (status) =>
        status === 'voice'
            ? t('status.voice')
            : status === 'online'
                ? t('status.online')
                : t('status.offline')

    return (
        <>
            <button
                type="button"
                className={`dock-backdrop${panelOpen ? ' is-open' : ''}`}
                aria-label={t('nav.menu')}
                tabIndex={-1}
                onClick={navPanel.close}
            />

            <aside
                id="app-sidebar"
                className={`dock${panelOpen ? ' dock--open' : ''}`}
                data-active={activeIndex >= 0 ? 'true' : 'false'}
                style={{ '--i': Math.max(activeIndex, 0), '--n': NAV_ITEMS.length }}
            >
                <div className="dock__brand">
                    <Link
                        to="/app"
                        className="dock__logo"
                        aria-label={t('nav.home')}
                    >
                        <Logo size={38} />
                        <span className="dock__brand-name">Nebula</span>
                    </Link>

                    <button
                        type="button"
                        className={`dock__toggle${panelOpen ? ' is-open' : ''}`}
                        onClick={navPanel.toggle}
                        title={t('nav.menu')}
                        aria-label={t('nav.menu')}
                        aria-expanded={panelOpen}
                        aria-controls="app-sidebar"
                    >
                        <span className="dock__burger" aria-hidden="true">
                            <i />
                            <i />
                            <i />
                        </span>
                    </button>
                </div>

                <nav className="dock__nav" aria-label={t('nav.main')}>
                    <span className="dock__slider" aria-hidden="true" />

                    {NAV_ITEMS.map((item) => {
                        const current = isNavItemActive(item, pathname)

                        return (
                            <Link
                                key={item.to}
                                to={item.to}
                                title={t(item.labelKey)}
                                aria-current={current ? 'page' : undefined}
                                className={`dock__link${current ? ' is-active' : ''}`}
                            >
                                <span className="dock__icon">
                                    <Icon name={item.icon} />
                                </span>
                                <span className="dock__label">{t(item.labelKey)}</span>
                            </Link>
                        )
                    })}
                </nav>

                <div className="dock__scroll">
                    <div className="dock__section">
                        <div className="dock__section-head">
                            <span>{t('nav.spaces')}</span>
                        </div>

                        {spaces.map((space) => (
                            <Link
                                key={space.id}
                                to={`/app/spaces/${space.id}`}
                                title={space.name}
                                className={`dock__row${
                                    String(space.id) === String(activeSpaceId) ? ' is-active' : ''
                                }`}
                            >
                                <span className="dock__icon">
                                    {space.avatarUrl || space.avatar_url ? (
                                        <Avatar
                                            src={space.avatarUrl || space.avatar_url}
                                            label={space.name}
                                            size={38}
                                            className="dock__space-avatar"
                                        />
                                    ) : (
                                        <span className="dock__badge">
                                            {space.emoji || <Icon name="users" />}
                                        </span>
                                    )}
                                </span>
                                <span className="dock__label">{space.name}</span>
                            </Link>
                        ))}

                        <Link
                            to="/app/spaces/new"
                            title={t('nav.createSpace')}
                            className="dock__row dock__row--add"
                        >
                            <span className="dock__icon">
                                <span className="dock__badge dock__badge--add">
                                    <Icon name="plus" />
                                </span>
                            </span>
                            <span className="dock__label">{t('nav.createSpace')}</span>
                        </Link>
                    </div>

                    <div className="dock__section">
                        <div className="dock__section-head">
                            <span>{t('nav.directMessages')}</span>

                            <button
                                type="button"
                                className="icon-button"
                                title={t('nav.newMessage')}
                                aria-label={t('nav.newMessage')}
                                onClick={() => navigate('/app/dm')}
                            >
                                <Icon name="plus" />
                            </button>
                        </div>

                        {loading && (
                            <p className="dock__empty">{t('common.loading')}</p>
                        )}

                        {!loading && friends.length === 0 && (
                            <p className="dock__empty">{t('common.noOneYet')}</p>
                        )}

                        {friends.map((friend) => (
                            <Link
                                key={friend.id}
                                to={`/app/dm/${friend.id}`}
                                title={friend.name}
                                className={`dock__row${
                                    matchPath('/app/dm/:id', pathname)?.params.id === String(friend.id)
                                        ? ' is-active'
                                        : ''
                                }`}
                            >
                                <span className="dock__icon">
                                    <Avatar src={friend.avatarUrl || friend.avatar_url || friend.avatar} label={friend.displayName || friend.name} size={32} />
                                </span>
                                <span className="dock__label">{friend.name}</span>
                                <span
                                    className={`dock__status dock__status--${friend.status}`}
                                    title={statusLabel(friend.status)}
                                />
                            </Link>
                        ))}
                    </div>
                </div>

                <button
                    type="button"
                    className="dock__logout"
                    onClick={logout}
                    title={t('nav.logout')}
                >
                    <span className="dock__icon">
                        <Icon name="log-out" />
                    </span>
                    <span className="dock__label">{t('nav.logout')}</span>
                </button>
            </aside>
        </>
    )
}
