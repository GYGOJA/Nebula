import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Progress from '@/components/Progress'
import { api } from '@/api'
import { pendingRegistration } from '@/api/client'
import { isEmail } from '@/utils/auth'
import { useI18n } from '@/i18n'

export default function RegisterEmail() {
    const { t } = useI18n()
    const nav = useNavigate()

    const [email, setEmail] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const onSubmit = async (e) => {
        e.preventDefault()
        setError('')

        const normalized = email.trim().toLowerCase()

        if (!normalized) {
            setError(t('validation.emailRequired'))
            return
        }

        if (!isEmail(normalized)) {
            setError(t('validation.emailInvalid'))
            return
        }

        setLoading(true)

        try {
            await api.sendCode({ email: normalized })
            pendingRegistration.set({ email: normalized })
            nav('/register/verify')
        } catch (err) {
            setError(err?.message || t('auth.sendCodeFailed'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <section className="auth-card auth-card--narrow">
            <Progress step={1} />

            <h1 className="auth-card__title auth-card__title--narrow">
                {t('registerEmail.title')}
            </h1>

            <p className="auth-card__lead">
                {t('registerEmail.lead1')}
                <br />
                {t('registerEmail.lead2')}
            </p>

            <form onSubmit={onSubmit} noValidate>
                <label className="auth-label" htmlFor="register-email">
                    {t('registerEmail.emailLabel')}
                </label>

                <input
                    id="register-email"
                    className="auth-input"
                    type="email"
                    placeholder="name@company.com"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                />

                {error && (
                    <p className="auth-inline-error" role="alert">
                        {error}
                    </p>
                )}

                <p className="auth-notice">
                    {t('registerEmail.notice1')}
                    <br />
                    {t('registerEmail.notice2')}
                </p>

                <button className="auth-btn" type="submit" disabled={loading}>
                    {loading ? t('common.sending') : t('auth.getCode')}
                </button>
            </form>

            <div className="auth-bottom auth-bottom--right">
                <span>{t('registerEmail.haveAccount')} </span>

                <Link to="/login" className="orange">
                    {t('auth.signIn')}
                </Link>
            </div>
        </section>
    )
}
