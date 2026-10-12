import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import PasswordInput from '@/components/PasswordInput'
import Progress from '@/components/Progress'
import { useAuth } from '@/context/AuthContext'
import { pendingRegistration } from '@/api/client'
import {
    PASSWORD_MIN,
    STRENGTH_STEPS,
    isUsername,
    maskEmail,
    parseBirthDate,
    strengthLabel,
} from '@/utils/auth'
import { useI18n } from '@/i18n'

const EMPTY_FORM = {
    username: '',
    displayName: '',
    password: '',
    confirm: '',
    day: '',
    month: '',
    year: '',
}

function ProfileForm({ email, ticket }) {
    const { t } = useI18n()
    const nav = useNavigate()
    const { register } = useAuth()

    const [form, setForm] = useState(EMPTY_FORM)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const updateField = (field) => (e) => {
        setForm((current) => ({ ...current, [field]: e.target.value }))
        setError('')
    }

    const passwordMismatch =
        form.confirm.length > 0 && form.password !== form.confirm

    const onSubmit = async (e) => {
        e.preventDefault()
        setError('')

        const username = form.username.trim()
        const displayName = form.displayName.trim()

        if (!username || !form.password || !form.confirm) {
            setError(t('validation.fillRequired'))
            return
        }

        if (!isUsername(username)) {
            setError(t('validation.username'))
            return
        }

        if (displayName.length > 64) {
            setError(t('validation.displayNameMax'))
            return
        }

        if (form.password.length < PASSWORD_MIN) {
            setError(t('validation.passwordMin', { min: PASSWORD_MIN }))
            return
        }

        if (passwordMismatch) {
            setError(t('validation.passwordMismatch'))
            return
        }

        const birth = parseBirthDate(form)

        if (birth.error) {
            setError(birth.error)
            return
        }

        setLoading(true)

        try {
            await register({
                email,
                ticket,
                username,
                displayName: displayName || username,
                password: form.password,
                ...(birth.value ? { birthDate: birth.value } : {}),
            })

            pendingRegistration.clear()
            nav('/app', { replace: true })
        } catch (err) {
            setError(err?.message || t('registerProfile.failed'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <section className="auth-card auth-card--profile">
            <Progress step={3} />

            <h1 className="profile-title">{t('registerProfile.title')}</h1>

            <p className="profile-sub">
                {t('registerProfile.emailPrefix')}{' '}
                <strong className="auth-email">{maskEmail(email)}</strong>{' '}
                {t('registerProfile.emailSuffix')}
            </p>

            <form onSubmit={onSubmit} noValidate>
                <div className="profile-grid">
                    <div>
                        <label className="auth-label" htmlFor="username">
                            {t('registerProfile.usernameLabel')}
                        </label>
                        <input
                            id="username"
                            className="auth-input"
                            type="text"
                            autoComplete="username"
                            value={form.username}
                            onChange={updateField('username')}
                            disabled={loading}
                        />
                        <small className="auth-hint">
                            {t('registerProfile.usernameHint')}
                        </small>
                    </div>

                    <div>
                        <label className="auth-label" htmlFor="display-name">
                            {t('registerProfile.displayNameLabel')}
                        </label>
                        <input
                            id="display-name"
                            className="auth-input"
                            type="text"
                            autoComplete="name"
                            maxLength={64}
                            value={form.displayName}
                            onChange={updateField('displayName')}
                            disabled={loading}
                        />
                        <small className="auth-hint">
                            {t('registerProfile.displayNameHint')}
                        </small>
                    </div>

                    <div>
                        <label className="auth-label" htmlFor="profile-password">
                            {t('auth.passwordLabel')}
                        </label>
                        <PasswordInput
                            variant="profile"
                            id="profile-password"
                            autoComplete="new-password"
                            value={form.password}
                            onChange={updateField('password')}
                            disabled={loading}
                        />
                        <small className="auth-hint">
                            {t('registerProfile.passwordHint', {
                                min: PASSWORD_MIN,
                                strength: strengthLabel(form.password),
                            })}
                        </small>
                        <div className="strength">
                            {STRENGTH_STEPS.map((min) => (
                                <i
                                    key={min}
                                    className={`strength__seg ${
                                        form.password.length >= min
                                            ? 'strength__seg--active'
                                            : ''
                                    }`.trim()}
                                />
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="auth-label" htmlFor="confirm-password">
                            {t('registerProfile.confirmLabel')}
                        </label>
                        <PasswordInput
                            variant="profile"
                            id="confirm-password"
                            invalid={passwordMismatch}
                            autoComplete="new-password"
                            value={form.confirm}
                            onChange={updateField('confirm')}
                            disabled={loading}
                        />
                        <small
                            className={
                                passwordMismatch
                                    ? 'auth-hint auth-hint--error'
                                    : 'auth-hint'
                            }
                        >
                            {passwordMismatch
                                ? t('validation.passwordMismatch')
                                : t('registerProfile.confirmHint')}
                        </small>
                    </div>
                </div>

                <label
                    className="auth-label profile-birth-label"
                    htmlFor="birth-day"
                >
                    {t('registerProfile.birthLabel')}
                </label>

                <div className="profile-birth">
                    <input
                        id="birth-day"
                        className="auth-input"
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        placeholder={t('registerProfile.day')}
                        value={form.day}
                        onChange={updateField('day')}
                        disabled={loading}
                    />
                    <input
                        className="auth-input"
                        type="text"
                        aria-label={t('registerProfile.birthMonth')}
                        placeholder={t('registerProfile.month')}
                        value={form.month}
                        onChange={updateField('month')}
                        disabled={loading}
                    />
                    <input
                        className="auth-input"
                        type="text"
                        inputMode="numeric"
                        aria-label={t('registerProfile.birthYear')}
                        maxLength={4}
                        placeholder={t('registerProfile.year')}
                        value={form.year}
                        onChange={updateField('year')}
                        disabled={loading}
                    />
                </div>

                {error && (
                    <p
                        className="auth-inline-error auth-inline-error--profile"
                        role="alert"
                    >
                        {error}
                    </p>
                )}

                <button
                    className="auth-btn auth-btn--lg"
                    type="submit"
                    disabled={loading || passwordMismatch}
                >
                    {loading
                        ? t('registerProfile.submitting')
                        : t('registerProfile.submit')}
                </button>

                <div className="profile-foot">
                    <Progress step={3} style={{ margin: 0 }} />
                    <span className="muted">
                        {t('registerProfile.afterNote')}
                    </span>
                </div>
            </form>
        </section>
    )
}

export default function RegisterProfile() {
    const pending = pendingRegistration.get()

    if (!pending?.email) return <Navigate to="/register" replace />
    if (!pending.ticket) return <Navigate to="/register/verify" replace />

    return <ProfileForm email={pending.email} ticket={pending.ticket} />
}