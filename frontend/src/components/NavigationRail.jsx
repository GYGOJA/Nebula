import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Logo from './Logo'
import { api } from '@/api'
import { useI18n } from '@/i18n'
import { navPanel, useNavPanel } from '@/utils/navPanel'
import Icon from "@/assets/icon/Icon.jsx";

export default function NavigationRail({ activeSpaceId }) {
    const { t } = useI18n()
    const [spaces, setSpaces] = useState([])
    const panelOpen = useNavPanel()

    useEffect(() => {
        let alive = true

        api.getSpaces()
            .then((result) => {
                if (alive) setSpaces(result)
            })
            .catch(() => {})

        return () => {
            alive = false
        }
    }, [])

    return (
        <aside className="rail">
            <div className="rail__logo">
                <Logo size={42} />
            </div>

            <button
                type="button"
                className={`rail__btn rail__menu${panelOpen ? ' is-open' : ''}`}
                onClick={navPanel.toggle}
                title={t('nav.menu')}
                aria-label={t('nav.menu')}
                aria-expanded={panelOpen}
                aria-controls="app-sidebar"
            >
                <span className="rail__burger" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                </span>
            </button>

            <NavLink
                to="/app"
                end
                className={({ isActive }) =>
                    `rail__btn ${
                        isActive && !activeSpaceId ? 'rail__btn--active' : ''
                    }`
                }
                title={t('nav.home')}
                aria-label={t('nav.home')}
            >
                <Icon name="house" />
            </NavLink>

            <div className="rail__divider" />

            {spaces.map((space) => (
                <NavLink
                    key={space.id}
                    to={`/app/spaces/${space.id}`}
                    className={({ isActive }) =>
                        `rail__btn ${isActive ? 'rail__btn--active' : ''}`
                    }
                    title={space.name}
                    aria-label={space.name}
                >
                    <Icon name="users" />
                </NavLink>
            ))}

            <NavLink
                to="/app/spaces/new"
                className="rail__btn rail__add"
                title={t('nav.createSpace')}
                aria-label={t('nav.createSpace')}
            >
                <Icon name="plus" />
            </NavLink>
        </aside>
    )
}
