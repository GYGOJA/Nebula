import { useCallback, useEffect, useState } from 'react'
import NavigationRail from '@/components/NavigationRail'
import Sidebar from '@/components/Sidebar'
import RightSidebar from '@/components/RightSidebar'
import PageHeader from '@/components/PageHeader'
import { api } from '@/api'
import { getLanguage, useI18n } from '@/i18n'
import CustomSelect from '@/components/CustomSelect'

const DEFAULT_SETTINGS = {
    theme: 'dark',
    language: 'ru',
    notifications: {
        desktop: true,
        sounds: true,
        mentions: true,
    },
    privacy: {
        dmFromEveryone: true,
        showOnlineStatus: true,
    },
}

function readSavedPreferences() {
    try {
        return JSON.parse(localStorage.getItem('nebula_settings') || '{}')
    } catch {
        return {}
    }
}

function resolveTheme(theme) {
    if (theme !== 'system') {
        return theme === 'light' ? 'light' : 'dark'
    }

    return window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
}

export default function Settings() {
    const { t, language, languages, setLanguage } = useI18n()
    const [settings, setSettings] = useState(DEFAULT_SETTINGS)
    const [passwords, setPasswords] = useState({
        current: '',
        next: '',
        confirm: '',
    })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [passwordSaving, setPasswordSaving] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        setError('')

        try {
            const result = await api.getSettings()
            const savedPreferences = readSavedPreferences()

            const merged = {
                ...DEFAULT_SETTINGS,
                ...(result || {}),
                ...savedPreferences,
                notifications: {
                    ...DEFAULT_SETTINGS.notifications,
                    ...(result?.notifications || {}),
                    ...(savedPreferences.notifications || {}),
                },
                privacy: {
                    ...DEFAULT_SETTINGS.privacy,
                    ...(result?.privacy || {}),
                    ...(savedPreferences.privacy || {}),
                },
                theme: savedPreferences.theme || result?.theme || 'dark',
                language: getLanguage(),
            }

            setSettings(merged)
            document.documentElement.dataset.theme = resolveTheme(merged.theme)
        } catch (err) {
            setError(err?.message || t('settings.loadFailed'))
        } finally {
            setLoading(false)
        }
    }, [t])

    useEffect(() => {
        load()
    }, [load])

    const persistLocalPreferences = (nextSettings) => {
        try {
            localStorage.setItem(
                'nebula_settings',
                JSON.stringify(nextSettings)
            )
        } catch {
            setError('Не удалось сохранить настройки в браузере')
        }
    }

    const updateSetting = (group, key, value) => {
        setSettings((previous) => {
            const next = {
                ...previous,
                [group]: {
                    ...(previous[group] || {}),
                    [key]: value,
                },
            }

            persistLocalPreferences(next)
            return next
        })
    }

    const updatePreference = (key, value) => {
        setSettings((previous) => {
            const next = {
                ...previous,
                [key]: value,
            }

            persistLocalPreferences(next)
            return next
        })

        if (key === 'theme') {
            document.documentElement.dataset.theme = resolveTheme(value)
        }

        if (key === 'language') {
            setLanguage(value)
            setError('')
            setNotice('')
        }
    }

    const saveSettings = async (event) => {
        event.preventDefault()
        setSaving(true)
        setError('')
        setNotice('')

        try {
            const payload = {
                ...settings,
                language: getLanguage(),
            }

            const updated = await api.updateSettings(payload)

            const persisted = {
                ...payload,
                ...(updated || {}),
                notifications: {
                    ...payload.notifications,
                    ...(updated?.notifications || {}),
                },
                privacy: {
                    ...payload.privacy,
                    ...(updated?.privacy || {}),
                },
                theme: payload.theme,
                language: getLanguage(),
            }

            setSettings(persisted)
            persistLocalPreferences(persisted)
            document.documentElement.dataset.theme = resolveTheme(
                persisted.theme
            )
            setNotice(t('settings.saved'))
        } catch (err) {
            setError(err?.message || t('settings.saveFailed'))
        } finally {
            setSaving(false)
        }
    }

    const changePassword = async (event) => {
        event.preventDefault()
        setError('')
        setNotice('')

        if (passwords.next !== passwords.confirm) {
            setError(t('settings.passwordsMismatch'))
            return
        }

        setPasswordSaving(true)

        try {
            await api.changePassword({
                current: passwords.current,
                next: passwords.next,
            })

            setPasswords({
                current: '',
                next: '',
                confirm: '',
            })

            setNotice(t('settings.passwordChanged'))
        } catch (err) {
            setError(
                err?.message || t('settings.changePasswordFailed')
            )
        } finally {
            setPasswordSaving(false)
        }
    }

    const notificationLabels = {
        desktop: t('settings.notifications'),
        sounds: t('settings.sounds'),
        mentions: t('settings.mentions'),
    }

    const privacyLabels = {
        dmFromEveryone: t('settings.dmFromEveryone'),
        showOnlineStatus: t('settings.showOnlineStatus'),
    }

    return (
        <div className="app-layout">
            <NavigationRail />
            <Sidebar />

            <main className="main">
                <div className="main__content profile-page settings-page">
                    <PageHeader
                        title={t('settings.title')}
                        subtitle="Настройте внешний вид, уведомления и приватность Nebula."
                    />

                    {loading && (
                        <p className="muted profile-loading" role="status">
                            {t('common.loading')}
                        </p>
                    )}

                    {error && (
                        <p className="auth-inline-error" role="alert">
                            {error}
                        </p>
                    )}

                    {notice && (
                        <p className="form-notice" role="status">
                            {notice}
                        </p>
                    )}

                    {!loading && (
                        <>
                            <form
                                className="profile-form profile-form--minimal settings-form"
                                onSubmit={saveSettings}
                            >
                                <section className="profile-edit-section">
                                    <h2>{t('settings.appearance')}</h2>

                                    <div className="profile-form__field">
                                        <label htmlFor="settings-theme">
                                            {t('settings.theme')}
                                        </label>

                                        <CustomSelect
                                            className="settings-custom-select"
                                            ariaLabel={t('settings.theme')}
                                            value={settings.theme || 'dark'}
                                            onChange={(value) => updatePreference('theme', value)}
                                            options={[
                                                { value: 'dark', label: t('settings.themeDark') },
                                                { value: 'light', label: t('settings.themeLight') },
                                                { value: 'system', label: t('settings.themeSystem') },
                                            ]}
                                        />
                                    </div>

                                    <div className="profile-form__field">
                                        <label htmlFor="settings-language">
                                            {t('settings.language')}
                                        </label>

                                        <CustomSelect
                                            className="settings-custom-select"
                                            ariaLabel={t('settings.language')}
                                            value={language}
                                            onChange={(value) => updatePreference('language', value)}
                                            options={languages.map((item) => ({ value: item.code, label: item.label }))}
                                        />
                                    </div>
                                </section>

                                <section className="profile-edit-section">
                                    <h2>{t('settings.notifications')}</h2>

                                    {Object.entries(
                                        settings.notifications || {}
                                    ).map(([key, value]) => (
                                        <label
                                            className="settings-toggle"
                                            key={key}
                                        >
                                            <span>
                                                {notificationLabels[key] || key}
                                            </span>

                                            <input
                                                type="checkbox"
                                                checked={Boolean(value)}
                                                onChange={(event) =>
                                                    updateSetting(
                                                        'notifications',
                                                        key,
                                                        event.target.checked
                                                    )
                                                }
                                            />
                                        </label>
                                    ))}
                                </section>

                                <section className="profile-edit-section">
                                    <h2>{t('settings.privacy')}</h2>

                                    {Object.entries(
                                        settings.privacy || {}
                                    ).map(([key, value]) => (
                                        <label
                                            className="settings-toggle"
                                            key={key}
                                        >
                                            <span>
                                                {privacyLabels[key] || key}
                                            </span>

                                            <input
                                                type="checkbox"
                                                checked={Boolean(value)}
                                                onChange={(event) =>
                                                    updateSetting(
                                                        'privacy',
                                                        key,
                                                        event.target.checked
                                                    )
                                                }
                                            />
                                        </label>
                                    ))}
                                </section>

                                <div className="profile-form__actions">
                                    <button
                                        className="btn btn--primary"
                                        type="submit"
                                        disabled={saving}
                                    >
                                        {saving
                                            ? t('common.saving')
                                            : t('settings.save')}
                                    </button>
                                </div>
                            </form>

                            <form
                                className="profile-form profile-form--minimal settings-form settings-form--password"
                                onSubmit={changePassword}
                            >
                                <section className="profile-edit-section">
                                    <h2>{t('settings.security')}</h2>

                                    <div className="profile-form__field">
                                        <label htmlFor="password-current">
                                            {t('settings.currentPassword')}
                                        </label>

                                        <input
                                            id="password-current"
                                            className="input"
                                            type="password"
                                            autoComplete="current-password"
                                            value={passwords.current}
                                            onChange={(event) =>
                                                setPasswords((previous) => ({
                                                    ...previous,
                                                    current: event.target.value,
                                                }))
                                            }
                                            required
                                        />
                                    </div>

                                    <div className="profile-form__field">
                                        <label htmlFor="password-next">
                                            {t('settings.newPassword')}
                                        </label>

                                        <input
                                            id="password-next"
                                            className="input"
                                            type="password"
                                            autoComplete="new-password"
                                            minLength={8}
                                            value={passwords.next}
                                            onChange={(event) =>
                                                setPasswords((previous) => ({
                                                    ...previous,
                                                    next: event.target.value,
                                                }))
                                            }
                                            required
                                        />
                                    </div>

                                    <div className="profile-form__field">
                                        <label htmlFor="password-confirm">
                                            {t('settings.repeatPassword')}
                                        </label>

                                        <input
                                            id="password-confirm"
                                            className="input"
                                            type="password"
                                            autoComplete="new-password"
                                            minLength={8}
                                            value={passwords.confirm}
                                            onChange={(event) =>
                                                setPasswords((previous) => ({
                                                    ...previous,
                                                    confirm: event.target.value,
                                                }))
                                            }
                                            required
                                        />
                                    </div>

                                    <div className="profile-form__actions">
                                        <button
                                            className="btn btn--primary"
                                            type="submit"
                                            disabled={passwordSaving}
                                        >
                                            {passwordSaving
                                                ? t('common.saving')
                                                : t('settings.changePassword')}
                                        </button>
                                    </div>
                                </section>
                            </form>
                        </>
                    )}
                </div>
            </main>

            <RightSidebar />
        </div>
    )
}