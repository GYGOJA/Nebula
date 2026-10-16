import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import AuthBackground from './AuthBackground'
import LanguageSwitcher from './LanguageSwitcher'
import { useI18n } from '@/i18n'

function readPreferences() {
    try { return JSON.parse(localStorage.getItem('nebula_settings') || '{}') }
    catch { return {} }
}

function SunIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
    )
}

function MoonIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </svg>
    )
}

export default function AuthLayout() {
    const { t } = useI18n()
    const [theme, setThemeState] = useState(() =>
        document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
    )

    const setTheme = (nextTheme) => {
        if (nextTheme === theme) return

        document.documentElement.dataset.theme = nextTheme
        setThemeState(nextTheme)

        try {
            localStorage.setItem(
                'nebula_settings',
                JSON.stringify({ ...readPreferences(), theme: nextTheme })
            )
        } catch { }
    }

    return (
        <div className={`auth-layout auth-layout--${theme}`}>
            <AuthBackground />

            <div
                className="auth-theme-switch"
                role="group"
                aria-label={t('settings.theme')}
                data-theme-active={theme}
            >
                <span className="auth-theme-switch__thumb" aria-hidden="true" />

                <button
                    type="button"
                    className={theme === 'light' ? 'is-active' : ''}
                    aria-pressed={theme === 'light'}
                    onClick={() => setTheme('light')}
                >
                    <SunIcon />
                    <span>{t('settings.themeLight')}</span>
                </button>

                <button
                    type="button"
                    className={theme === 'dark' ? 'is-active' : ''}
                    aria-pressed={theme === 'dark'}
                    onClick={() => setTheme('dark')}
                >
                    <MoonIcon />
                    <span>{t('settings.themeDark')}</span>
                </button>
            </div>

            <LanguageSwitcher />

            <div className="auth-layout__content">
                <Outlet />
            </div>
        </div>
    )
}
