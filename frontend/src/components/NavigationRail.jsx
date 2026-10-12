import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Logo from './Logo'
import { api } from '@/api'
import { useI18n } from '@/i18n'

export default function NavigationRail({ activeSpaceId }) {
    const { t } = useI18n()
    const [spaces, setSpaces] = useState([])

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
                <span className="icon-placeholder" aria-hidden="true" />
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
                    <span
                        className="space-icon-placeholder"
                        aria-hidden="true"
                    />
                </NavLink>
            ))}

            <NavLink
                to="/app/spaces/new"
                className="rail__btn rail__add"
                title={t('nav.createSpace')}
                aria-label={t('nav.createSpace')}
            >
                <span className="icon-placeholder" aria-hidden="true" />
            </NavLink>
        </aside>
    )
}