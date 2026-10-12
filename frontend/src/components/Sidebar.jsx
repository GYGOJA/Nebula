import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Avatar from './Avatar'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/i18n'

const NAV = [
    { to: '/app', labelKey: 'nav.feed', end: true },
    { to: '/app/search', labelKey: 'nav.search' },
    { to: '/app/friends', labelKey: 'nav.friends' },
    { to: '/app/dm', labelKey: 'nav.messages' },
    { to: '/app/profile', labelKey: 'nav.profile' },
    { to: '/app/settings', labelKey: 'nav.settings' },
]

export default function Sidebar() {
    const { t } = useI18n()
    const navigate = useNavigate()
    const { logout } = useAuth()
    const [friends, setFriends] = useState([])
    const [loading, setLoading] = useState(true)

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

    return (
        <aside className="sidebar">
            <h2 className="sidebar__title">{t('nav.home')}</h2>

            <nav className="sidebar__nav">
                {NAV.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                            `sidebar__item ${
                                isActive ? 'sidebar__item--active' : ''
                            }`
                        }
                    >
                        <span className="icon-placeholder" aria-hidden="true" />
                        <span>{t(item.labelKey)}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="sidebar__section-label">
                <span>{t('nav.directMessages')}</span>

                <button
                    type="button"
                    className="icon-placeholder icon-placeholder--button"
                    title={t('nav.newMessage')}
                    aria-label={t('nav.newMessage')}
                    onClick={() => navigate('/app/dm')}
                />
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
                        onClick={() => navigate(`/app/dm/${friend.id}`)}
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
                {t('nav.logout')}
            </button>
        </aside>
    )
}