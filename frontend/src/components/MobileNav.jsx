import { NavLink, matchPath, useLocation } from 'react-router-dom'
import { useI18n } from '@/i18n'
import Icon from '@/assets/icon/Icon.jsx'

const links = [
    { to: '/app', labelKey: 'nav.home', icon: 'house', end: true, also: ['/app/spaces/*', '/app/channels/*', '/app/voice/*'] },
    { to: '/app/search', labelKey: 'nav.search', icon: 'search' },
    { to: '/app/friends', labelKey: 'nav.friends', icon: 'users' },
    { to: '/app/dm', labelKey: 'nav.messages', icon: 'message-square', also: ['/app/dm/*'] },
    { to: '/app/profile', labelKey: 'nav.profile', icon: 'user' },
    { to: '/app/settings', labelKey: 'nav.settings', icon: 'settings' },
]

const isCurrent = (link, pathname) =>
    Boolean(
        matchPath({ path: link.to, end: link.end ?? false }, pathname) ||
            link.also?.some((pattern) => matchPath({ path: pattern, end: false }, pathname))
    )

export default function MobileNav() {
    const { t } = useI18n()
    const { pathname } = useLocation()

    const activeIndex = links.findIndex((link) => isCurrent(link, pathname))

    return (
        <nav
            className="mobile-nav"
            aria-label={t('nav.main')}
            data-active={activeIndex >= 0 ? 'true' : 'false'}
            style={{ '--i': Math.max(activeIndex, 0), '--n': links.length }}
        >
            <div className="mobile-nav__bar">
                <span className="mobile-nav__slider" aria-hidden="true" />

                <ul className="mobile-nav__list">
                    {links.map((link) => (
                        <li key={link.to} className="mobile-nav__item">
                            <NavLink
                                to={link.to}
                                end={link.end}
                                className={() =>
                                    `mobile-nav__link${isCurrent(link, pathname) ? ' is-active' : ''}`
                                }
                                aria-label={t(link.labelKey)}
                            >
                                <span className="mobile-nav__icon">
                                    <Icon name={link.icon} />
                                </span>
                                <span className="mobile-nav__label">{t(link.labelKey)}</span>
                            </NavLink>
                        </li>
                    ))}
                </ul>
            </div>
        </nav>
    )
}
