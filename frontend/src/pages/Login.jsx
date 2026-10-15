import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import PasswordInput from '@/components/PasswordInput'
import Logo from '@/components/Logo'
import { useI18n } from '@/i18n'

export default function Login() {
    const { t } = useI18n()
    const { login } = useAuth()
    const nav = useNavigate()
    const location = useLocation()

    const [loginValue, setLoginValue] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [noticeKey, setNoticeKey] = useState(
        location.state?.noticeKey || ''
    )
    const notice = noticeKey ? t(noticeKey) : ''

    const onSubmit = async (event) => {
        event.preventDefault()
        setError('')
        setNoticeKey('')

        if (!loginValue.trim() || !password) {
            setError(t('login.enterCredentials'))
            return
        }

        setLoading(true)

        try {
            await login({
                login: loginValue.trim(),
                password,
            })

            const destination = location.state?.from?.pathname || '/app'
            nav(destination, { replace: true })
        } catch (err) {
            setError(err?.message || t('login.failed'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <h1 className="login-title">{t('login.title')}</h1>

                <form id="loginForm" onSubmit={onSubmit} noValidate>
                    <div className="field">
                        <label className="field-label" htmlFor="login">
                            {t('login.loginLabel')}
                        </label>

                        <input
                            id="login"
                            className="input"
                            name="login"
                            type="text"
                            autoComplete="username"
                            value={loginValue}
                            onChange={(e) => setLoginValue(e.target.value)}
                            disabled={loading}
                            aria-invalid={error ? 'true' : undefined}
                            aria-describedby={error ? 'login-error' : undefined}
                        />
                    </div>

                    <div className="field">
                        <label
                            className="field-label"
                            htmlFor="login-password"
                        >
                            {t('auth.passwordLabel')}
                        </label>

                        <PasswordInput
                            id="login-password"
                            name="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={loading}
                            aria-invalid={error ? 'true' : undefined}
                            aria-describedby={error ? 'login-error' : undefined}
                        />

                        <Link to="/recover" className="forgot-password">
                            {t('login.forgot')}
                        </Link>
                    </div>
                </form>

                {(error || notice) && (
                    <p
                        id="login-error"
                        className={`auth-form-error ${error ? '' : 'auth-form-notice'}`.trim()}
                        role={error ? 'alert' : 'status'}
                    >
                        {error || notice}
                    </p>
                )}

                <div className="auth-bottom">
                    <button
                        type="submit"
                        form="loginForm"
                        className="login-button"
                        disabled={loading}
                    >
                        {loading ? t('login.submitting') : t('login.submit')}
                    </button>

                    <div className="register-text">
                        <span>{t('login.noAccount')} </span>

                        <Link to="/register" className="register-link">
                            {t('login.register')}
                        </Link>
                    </div>
                </div>

                <Logo
                    variant="animation"
                    className="planet-logo"
                    alt=""
                />
            </div>
        </div>
    )
}
