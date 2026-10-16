import { useEffect, useState } from 'react'
import { Link, matchPath, useLocation, useNavigate } from 'react-router-dom'
import Avatar from './Avatar'
import Logo from './Logo'
import Icon from '@/assets/icon/Icon.jsx'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/i18n'
import { useAppEvent } from '@/hooks/useAppEvent'
import { menuPanel, useMenuPanel } from '@/utils/navPanel'

// Phones only: left drawer with the user's spaces and direct messages.
// Opened by swiping right (see SwipeNav).
export default function MobileMenu() {
    const { t } = useI18n()
    const { logout } = useAuth()
    const navigate = useNavigate()
    const { pathname } = useLocation()
    const open = useMenuPanel()
    const [spaces, setSpaces] = useState([])
    const [friends, setFriends] = useState([])
    const [loading, setLoading] = useState(true)
    const [tick, setTick] = useState(0)

    const activeSpaceId = matchPath('/app/spaces/:id', pathname)?.params.id
    const activeDmId = matchPath('/app/dm/:id', pathname)?.params.id

    useAppEvent(['space_updated', 'space_deleted'], () => setTick((n) => n + 1))

    // Every navigation closes the drawer.
    useEffect(() => {
        menuPanel.close()
    }, [pathname])

    // Fresh lists each time the drawer opens.
    useEffect(() => {
        if (!open) return undefined
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
    }, [open, tick])

    useEffect(() => {
        if (!open) return undefined
        const onKeyDown = (event) => {
            if (event.key === 'Escape') menuPanel.close()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [open])

    return (
        <>
            <button
                type="button"
                className={`mmenu-backdrop${open ? ' is-open' : ''}`}
                aria-label={t('spacenav.close')}
                tabIndex={-1}
                onClick={menuPanel.close}
            />

            <aside className={`mmenu${open ? ' is-open' : ''}`} aria-hidden={!open} aria-label={t('nav.menu')}>
                <div className="mmenu__head">
                    <Link to="/app" className="mmenu__brand" aria-label={t('nav.home')}>
                        <Logo size={34} />
                        <span>Nebula</span>
                    </Link>
                    <button type="button" className="mmenu__close" onClick={menuPanel.close} aria-label={t('spacenav.close')}>
                        <Icon name="x" />
                    </button>
                </div>

                <div className="mmenu__scroll">
                    <div className="mmenu__title">{t('nav.spaces')}</div>

                    {spaces.map((space) => {
                        const avatar = space.avatarUrl || space.avatar_url
                        return (
                            <Link
                                key={space.id}
                                to={`/app/spaces/${space.id}`}
                                className={`mmenu__row${String(space.id) === String(activeSpaceId) ? ' is-active' : ''}`}
                            >
                                {avatar ? (
                                    <Avatar src={avatar} label={space.name} size={40} className="mmenu__space-avatar" />
                                ) : (
                                    <span className="mmenu__badge">{space.emoji || <Icon name="users" />}</span>
                                )}
                                <span className="mmenu__name">{space.name}</span>
                            </Link>
                        )
                    })}

                    <Link to="/app/spaces/new" className="mmenu__row mmenu__row--add">
                        <span className="mmenu__badge mmenu__badge--add"><Icon name="plus" /></span>
                        <span className="mmenu__name">{t('nav.createSpace')}</span>
                    </Link>

                    <div className="mmenu__title mmenu__title--row">
                        <span>{t('nav.directMessages')}</span>
                        <button
                            type="button"
                            className="mmenu__plus"
                            onClick={() => navigate('/app/dm')}
                            aria-label={t('nav.newMessage')}
                            title={t('nav.newMessage')}
                        >
                            <Icon name="plus" />
                        </button>
                    </div>

                    {loading && <p className="mmenu__empty">{t('common.loading')}</p>}
                    {!loading && friends.length === 0 && <p className="mmenu__empty">{t('common.noOneYet')}</p>}

                    {friends.map((friend) => (
                        <Link
                            key={friend.id}
                            to={`/app/dm/${friend.id}`}
                            className={`mmenu__row${String(friend.id) === String(activeDmId) ? ' is-active' : ''}`}
                        >
                            <Avatar
                                src={friend.avatarUrl || friend.avatar_url || friend.avatar}
                                label={friend.displayName || friend.name}
                                size={40}
                            />
                            <span className="mmenu__name">{friend.name}</span>
                            <span className={`mmenu__status mmenu__status--${friend.status}`} />
                        </Link>
                    ))}
                </div>

                <div className="mmenu__footer">
                    <button
                        type="button"
                        className="mmenu__logout"
                        onClick={() => {
                            menuPanel.close()
                            logout()
                            navigate('/login', { replace: true })
                        }}
                    >
                        <span className="mmenu__logout-icon"><Icon name="log-out" /></span>
                        <span>{t('nav.logout')}</span>
                    </button>
                </div>
            </aside>
        </>
    )
}
