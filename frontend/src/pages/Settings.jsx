import { useCallback, useEffect, useState } from 'react'
import RightSidebar from '@/components/RightSidebar'
import PageHeader from '@/components/PageHeader'
import { api } from '@/api'
import { getLanguage, useI18n } from '@/i18n'
import CustomSelect from '@/components/CustomSelect'
import { useAuth } from '@/context/AuthContext'
import OtpInput from '@/components/OtpInput'
import { CODE_LENGTH, RESEND_SECONDS, isEmail } from '@/utils/auth'
import { resolveAppearance } from '@/utils/theme'

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

function applyAppearance(theme) {
    const { theme: base, mascot } = resolveAppearance(theme)
    document.documentElement.dataset.theme = base
    document.documentElement.dataset.mascotBackground = mascot ? 'on' : 'off'
}

export default function Settings() {
    const { t, language, languages, setLanguage } = useI18n()
    const { user, updateUser } = useAuth()
    const [settings, setSettings] = useState(DEFAULT_SETTINGS)
    const [emailForm, setEmailForm] = useState({ email: '', code: '' })
    const [emailSaving, setEmailSaving] = useState(false)
    const [emailCodeSent, setEmailCodeSent] = useState(false)
    const [emailResendCooldown, setEmailResendCooldown] = useState(RESEND_SECONDS)
    const [passwordEditorOpen, setPasswordEditorOpen] = useState(false)
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
            applyAppearance(merged.theme)
        } catch (err) {
            setError(err?.message || t('settings.loadFailed'))
        } finally {
            setLoading(false)
        }
    }, [t])

    useEffect(() => {
        load()
    }, [load])

    useEffect(() => {
        if (!emailCodeSent || emailResendCooldown <= 0) return undefined
        const timer = window.setTimeout(() => setEmailResendCooldown((value) => value - 1), 1000)
        return () => window.clearTimeout(timer)
    }, [emailCodeSent, emailResendCooldown])

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
            applyAppearance(value)
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
            applyAppearance(persisted.theme)
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

        if (!passwords.current || !passwords.next) {
            setError('Введите текущий и новый пароль')
            return false
        }
        if (passwords.next.length < 8) {
            setError(t('validation.passwordMin', { min: 8 }))
            return false
        }
        if (passwords.next !== passwords.confirm) {
            setError(t('settings.passwordsMismatch'))
            return false
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
            return true
        } catch (err) {
            setError(
                err?.message || t('settings.changePasswordFailed')
            )
            return false
        } finally {
            setPasswordSaving(false)
        }
    }

    const changeEmail = async (event) => {
        event.preventDefault()
        setError('')
        setNotice('')

        const next = emailForm.email.trim().toLowerCase()

        if (!isEmail(next)) {
            setError(t('validation.emailInvalid'))
            return
        }

        if (user?.email && next === String(user.email).toLowerCase()) {
            setError(t('settings.emailSame'))
            return
        }

        setEmailSaving(true)

        try {
            if (!emailCodeSent) {
                await api.requestEmailChangeCode({ email: next })
                setEmailCodeSent(true)
                setEmailResendCooldown(RESEND_SECONDS)
                setNotice('Код подтверждения отправлен на новый адрес почты.')
            } else {
                const result = await api.verifyEmailChangeCode({
                    email: next,
                    code: emailForm.code.trim(),
                })
                updateUser({ email: result?.email || next })
                setEmailForm({ email: '', code: '' })
                setEmailCodeSent(false)
                setEmailResendCooldown(RESEND_SECONDS)
                setNotice(t('settings.emailChanged'))
            }
        } catch (err) {
            setError(err?.message || (emailCodeSent
                ? 'Не удалось подтвердить код'
                : 'Не удалось отправить код'))
        } finally {
            setEmailSaving(false)
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
                                                { value: 'light-mascot', label: t('settings.themeLightMascot') },
                                                { value: 'dark-mascot', label: t('settings.themeDarkMascot') },
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

                            <div className="settings-security-card">
                                <div className="settings-security-card__heading">
                                    <h3 className="settings-security-subtitle">{t('settings.security')}</h3>
                                    <p>Управление почтой и паролем аккаунта</p>
                                </div>
                            <form
                                className="profile-form profile-form--minimal settings-form settings-form--email"
                                onSubmit={changeEmail}
                            >
                                <section className="profile-edit-section">
                                    <h3 className="settings-security-subtitle">{t('settings.emailSection')}</h3>

                                    <p className="settings-email-current">
                                        {t('settings.emailCurrent')}{' '}
                                        <strong>{user?.email || t('settings.emailNotSet')}</strong>
                                    </p>

                                    <div className="profile-form__field">
                                        <label htmlFor="email-next">Новый адрес почты</label>
                                        <input
                                            id="email-next"
                                            className="input"
                                            type="email"
                                            autoComplete="email"
                                            placeholder="name@company.com"
                                            value={emailForm.email}
                                            onChange={(event) => {
                                                setEmailForm((previous) => ({
                                                    ...previous,
                                                    email: event.target.value,
                                                    code: '',
                                                }))
                                                setEmailCodeSent(false)
                                                setEmailResendCooldown(RESEND_SECONDS)
                                            }}
                                            required
                                        />
                                    </div>

                                    {emailCodeSent && (
                                        <div className="profile-form__field settings-email-code-field">
                                            <label>Код из письма</label>
                                            <p className="settings-security-hint">
                                                Введите код, отправленный на {emailForm.email.trim()}.
                                            </p>
                                            <OtpInput
                                                length={CODE_LENGTH}
                                                value={emailForm.code}
                                                onChange={(code) => setEmailForm((previous) => ({ ...previous, code }))}
                                                disabled={emailSaving}
                                            />
                                            <p className="settings-email-resend">
                                                {emailResendCooldown > 0 ? (
                                                    <>Отправить код снова через <span>{Math.floor(emailResendCooldown / 60)}:{String(emailResendCooldown % 60).padStart(2, '0')}</span></>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="auth-link-btn"
                                                        disabled={emailSaving}
                                                        onClick={async () => {
                                                            setError('')
                                                            setNotice('')
                                                            setEmailSaving(true)
                                                            try {
                                                                await api.requestEmailChangeCode({ email: emailForm.email.trim().toLowerCase() })
                                                                setEmailForm((previous) => ({ ...previous, code: '' }))
                                                                setEmailResendCooldown(RESEND_SECONDS)
                                                                setNotice('Новый код отправлен на почту.')
                                                            } catch (err) {
                                                                setError(err?.message || 'Не удалось повторно отправить код')
                                                            } finally {
                                                                setEmailSaving(false)
                                                            }
                                                        }}
                                                    >Отправить код снова</button>
                                                )}
                                            </p>
                                        </div>
                                    )}

                                    <div className="profile-form__actions">
                                        <button
                                            className="btn btn--primary"
                                            type="submit"
                                            disabled={emailSaving || (emailCodeSent && emailForm.code.length !== CODE_LENGTH)}
                                        >
                                            {emailSaving
                                                ? 'Подождите…'
                                                : emailCodeSent
                                                    ? 'Подтвердить почту'
                                                    : 'Отправить код'}
                                        </button>
                                        {emailCodeSent && (
                                            <button
                                                className="btn btn--secondary"
                                                type="button"
                                                onClick={() => {
                                                    setEmailCodeSent(false)
                                                    setEmailForm((previous) => ({ ...previous, code: '' }))
                                                    setError('')
                                                    setNotice('')
                                                }}
                                            >
                                                Изменить адрес
                                            </button>
                                        )}
                                    </div>
                                </section>
                            </form>

                            <section className="settings-password-section">
                                <div className="settings-password-section__intro">
                                    <div>
                                        <h3 className="settings-security-subtitle">Пароль</h3>
                                        <p>Регулярно обновляйте пароль, чтобы защитить аккаунт.</p>
                                    </div>
                                    <button
                                        className="btn btn--secondary"
                                        type="button"
                                        onClick={() => {
                                            setPasswordEditorOpen((open) => !open)
                                            setPasswords({ current: '', next: '', confirm: '' })
                                            setError('')
                                            setNotice('')
                                        }}
                                    >
                                        {passwordEditorOpen ? 'Отмена' : 'Изменить пароль'}
                                    </button>
                                </div>

                                {passwordEditorOpen && (
                                    <form
                                        className="profile-form profile-form--minimal settings-form settings-form--password"
                                        onSubmit={async (event) => {
                                            const changed = await changePassword(event)
                                            if (changed) setPasswordEditorOpen(false)
                                        }}
                                    >
                                        <section className="profile-edit-section">
                                            <div className="profile-form__field settings-password-current">
                                                <label htmlFor="password-current">Старый пароль</label>
                                                <input
                                                    id="password-current"
                                                    className="input"
                                                    type="password"
                                                    autoComplete="current-password"
                                                    value={passwords.current}
                                                    onChange={(event) => setPasswords((previous) => ({ ...previous, current: event.target.value }))}
                                                    required
                                                />
                                            </div>

                                            <div className="settings-password-pair">
                                                <div className="profile-form__field">
                                                    <label htmlFor="password-next">Новый пароль</label>
                                                    <input
                                                        id="password-next"
                                                        className="input"
                                                        type="password"
                                                        autoComplete="new-password"
                                                        minLength={8}
                                                        value={passwords.next}
                                                        onChange={(event) => setPasswords((previous) => ({ ...previous, next: event.target.value }))}
                                                        required
                                                    />
                                                </div>
                                                <div className="profile-form__field">
                                                    <label htmlFor="password-confirm">Подтверждение нового пароля</label>
                                                    <input
                                                        id="password-confirm"
                                                        className="input"
                                                        type="password"
                                                        autoComplete="new-password"
                                                        minLength={8}
                                                        value={passwords.confirm}
                                                        onChange={(event) => setPasswords((previous) => ({ ...previous, confirm: event.target.value }))}
                                                        required
                                                    />
                                                </div>
                                            </div>

                                            <div className="profile-form__actions">
                                                <button className="btn btn--primary" type="submit" disabled={passwordSaving}>
                                                    {passwordSaving ? 'Сохранение…' : 'Сохранить новый пароль'}
                                                </button>
                                            </div>
                                        </section>
                                    </form>
                                )}
                            </section>
                            </div>
                        </>
                    )}
                </div>
            </main>

            <RightSidebar />
        </div>
    )
}
