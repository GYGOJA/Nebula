import { NavLink, useLocation } from 'react-router-dom'
import { useI18n } from '@/i18n'
import Icon from '@/assets/icon/Icon.jsx'
import { NAV_ITEMS, getActiveNavIndex, isNavItemActive } from '@/utils/navItems'

export default function MobileNav() {
    const { t } = useI18n()
    const { pathname } = useLocation()

    const activeIndex = getActiveNavIndex(pathname)

    return (
        <nav
            className="mobile-nav"
            aria-label={t('nav.main')}
            data-active={activeIndex >= 0 ? 'true' : 'false'}
            style={{ '--i': Math.max(activeIndex, 0), '--n': NAV_ITEMS.length }}
        >
            <div className="mobile-nav__bar">
                <span className="mobile-nav__slider" aria-hidden="true" />

                <ul className="mobile-nav__list">
                    {NAV_ITEMS.map((item) => (
                        <li key={item.to} className="mobile-nav__item">
                            <NavLink
                                to={item.to}
                                end={item.end}
                                className={() =>
                                    `mobile-nav__link${isNavItemActive(item, pathname) ? ' is-active' : ''}`
                                }
                                aria-label={t(item.shortKey)}
                            >
                                <span className="mobile-nav__icon">
                                    <Icon name={item.icon} />
                                </span>
                                <span className="mobile-nav__label">{t(item.shortKey)}</span>
                            </NavLink>
                        </li>
                    ))}
                </ul>
            </div>
        </nav>
    )
}
