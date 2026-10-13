import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Avatar from './Avatar'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/i18n'
import { navPanel, useNavPanel } from '@/utils/navPanel'
import Icon from "@/assets/icon/Icon.jsx";

const NAV = [
    { to: '/app', labelKey: 'nav.feed', icon: 'house', end: true },
    { to: '/app/search', labelKey: 'nav.search', icon: 'search' },
    { to: '/app/friends', labelKey: 'nav.friends', icon: 'users' },
    { to: '/app/dm', labelKey: 'nav.messages', icon: 'message-square' },
    { to: '/app/profile', labelKey: 'nav.profile', icon: 'user' },
    { to: '/app/settings', labelKey: 'nav.settings', icon: 'settings' },
]

export default function Sidebar() {
    const { t } = useI18n()
    const navigate = useNavigate()
    const { logout } = useAuth()
    const [friends, setFriends] = useState([])
    const [loading, setLoading] = useState(true)
    const panelOpen = useNavPanel()

    // Slide-over panel (tablet): start closed on every page and close on Escape.
    useEffect(() => {
        navPanel.close()
    }, [])

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

        api.getFriends()
            .then((result) => {
                if (alive) setFriends(result)
            })
            .catch(() => {
                if (alive) setFriends([])
            })
            .finally(() => {
                if (alive) setLoading(false)
            })

        return () => {
            alive = false
        }
    }, [])

    const openDm = (id) => {
        navPanel.close()
        navigate(`/app/dm/${id}`)
    }

    return (
        <>
        <button
            type="button"
            className={`sidebar-backdrop${panelOpen ? ' is-open' : ''}`}
            aria-label={t('nav.menu')}
            tabIndex={-1}
            onClick={navPanel.close}
        />

        <aside
            id="app-sidebar"
            className={`sidebar${panelOpen ? ' sidebar--open' : ''}`}
        >
            <h2 className="sidebar__title">{t('nav.home')}</h2>

            <nav className="sidebar__nav">
                {NAV.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={navPanel.close}
                        className={({ isActive }) =>
                            `sidebar__item ${
                                isActive ? 'sidebar__item--active' : ''
                            }`
                        }
                    >
                        <Icon name={item.icon} />
                        <span>{t(item.labelKey)}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="sidebar__section-label">
                <span>{t('nav.directMessages')}</span>

                <button
                    type="button"
                    className="icon-button"
                    title={t('nav.newMessage')}
                    aria-label={t('nav.newMessage')}
                    onClick={() => {
                        navPanel.close()
                        navigate('/app/dm')
                    }}
                >
                    <Icon name="plus" />
                </button>
            </div>

            {loading && (
                <p className="sidebar__empty">{t('common.loading')}</p>
            )}

            {!loading && friends.length === 0 && (
                <p className="sidebar__empty">{t('common.noOneYet')}</p>
            )}

            <ul>
                {friends.map((friend) => (
                    <li
                        key={friend.id}
                        className="sidebar__dm"
                        role="link"
                        tabIndex={0}
                        onClick={() => openDm(friend.id)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') openDm(friend.id)
                        }}
                    >
                        <Avatar label={friend.avatar} size={32} />
                        <span>{friend.name}</span>

                        <span
                            className={`sidebar__dm-status sidebar__dm-status--${friend.status}`}
                        >
                            {friend.status === 'voice'
                                ? t('status.voice')
                                : friend.status === 'online'
                                    ? t('status.online')
                                    : t('status.offline')}
                        </span>
                    </li>
                ))}
            </ul>

            <button
                type="button"
                className="sidebar__logout"
                onClick={logout}
            >
                <Icon name="log-out" />
                <span>{t('nav.logout')}</span>
            </button>
        </aside>
        </>
    )
}