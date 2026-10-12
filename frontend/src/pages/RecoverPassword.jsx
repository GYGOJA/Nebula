
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import OtpInput from '@/components/OtpInput'
import PasswordInput from '@/components/PasswordInput'
import Progress from '@/components/Progress'
import { api } from '@/api'
import { CODE_LENGTH, PASSWORD_MIN, isEmail, maskEmail } from '@/utils/auth'
import { useI18n } from '@/i18n'

const CODE_ERRORS = [
    'INVALID_CODE',
    'CODE_EXPIRED',
    'CODE_ATTEMPTS_EXCEEDED',
]

export default function RecoverPassword() {
    const { t } = useI18n()
    const nav = useNavigate()

    const [step, setStep] = useState(1)
    const [email, setEmail] = useState('')
    const [code, setCode] = useState('')
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const passwordMismatch = confirm.length > 0 && password !== confirm

    const sendCode = async (event) => {
        event.preventDefault()
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
            await api.recover({ email: normalized })
            setEmail(normalized)
            setStep(2)
        } catch (err) {
            setError(err?.message || t('auth.sendCodeFailed'))
        } finally {
            setLoading(false)
        }
    }

    const confirmCode = (event) => {
        event.preventDefault()
        setError('')

        if (code.length !== CODE_LENGTH) {
            setError(t('validation.codeLength', { length: CODE_LENGTH }))
            return
        }

        setStep(3)
    }

    const resetPassword = async (event) => {
        event.preventDefault()
        setError('')

        if (password.length < PASSWORD_MIN) {
            setError(
                t('validation.passwordMin', { min: PASSWORD_MIN })
            )
            return
        }

        if (password !== confirm) {
            setError(t('validation.passwordMismatch'))
            return
        }

        setLoading(true)

        try {
            await api.resetPassword({ email, code, password })

            nav('/login', {
                replace: true,
                state: {
                    noticeKey: 'recover.changed',
                },
            })
        } catch (err) {
            setError(err?.message || t('recover.failed'))

            if (CODE_ERRORS.includes(err?.code)) {
                setCode('')
                setStep(2)
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <section className="auth-card auth-card--narrow recovery-card">
            <Progress step={step} />

            <h1 className="auth-card__title auth-card__title--narrow">
                {t('recover.title')}
            </h1>

            {step === 1 && (
                <>
                    <p className="auth-card__lead">
                        {t('recover.lead')}
                    </p>

                    <form onSubmit={sendCode} noValidate>
                        <label
                            className="auth-label"
                            htmlFor="recovery-email"
                        >
                            {t('recover.emailLabel')}
                        </label>

                        <input
                            id="recovery-email"
                            className="auth-input"
                            type="email"
                            autoComplete="email"
                            placeholder="name@company.com"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            disabled={loading}
                            required
                        />

                        {error && (
                            <p className="auth-inline-error" role="alert">
                                {error}
                            </p>
                        )}

                        <p className="auth-notice">
                            {t('recover.ignore')}
                        </p>

                        <button
                            className="auth-btn"
                            type="submit"
                            disabled={loading}
                        >
                            {loading ? t('common.sending') : t('auth.getCode')}
                        </button>
                    </form>
                </>
            )}

            {step === 2 && (
                <>
                    <p className="auth-card__lead">
                        {t('auth.codeSent', { email: maskEmail(email) })}
                        <br />
                        {t('auth.codeValid')}
                    </p>

                    <form onSubmit={confirmCode}>
                        <OtpInput
                            length={CODE_LENGTH}
                            value={code}
                            onChange={setCode}
                        />

                        {error && (
                            <p className="auth-inline-error" role="alert">
                                {error}
                            </p>
                        )}

                        <button
                            className="auth-btn"
                            type="submit"
                            disabled={code.length !== CODE_LENGTH}
                        >
                            {t('recover.continue')}
                        </button>
                    </form>

                    <div className="auth-bottom auth-bottom--center">
                        <button
                            type="button"
                            className="auth-link-btn"
                            onClick={() => {
                                setError('')
                                setCode('')
                                setStep(1)
                            }}
                        >
                            {t('auth.changeEmail')}
                        </button>
                    </div>
                </>
            )}

            {step === 3 && (
                <>
                    <p className="auth-card__lead">
                        {t('recover.setPassword')}
                    </p>

                    <form onSubmit={resetPassword} noValidate>
                        <label
                            className="auth-label"
                            htmlFor="new-password"
                        >
                            {t('recover.newPassword')}
                        </label>

                        <PasswordInput
                            variant="profile"
                            id="new-password"
                            autoComplete="new-password"
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            disabled={loading}
                        />

                        <small className="auth-hint">
                            {t('recover.passwordHint', { min: PASSWORD_MIN })}
                        </small>

                        <label
                            className="auth-label profile-birth-label"
                            htmlFor="new-password-confirm"
                        >
                            {t('recover.confirmPassword')}
                        </label>

                        <PasswordInput
                            variant="profile"
                            id="new-password-confirm"
                            invalid={passwordMismatch}
                            autoComplete="new-password"
                            value={confirm}
                            onChange={(event) =>
                                setConfirm(event.target.value)
                            }
                            disabled={loading}
                        />

                        {passwordMismatch && (
                            <small className="auth-hint auth-hint--error">
                                {t('validation.passwordMismatch')}
                            </small>
                        )}

                        {error && (
                            <p className="auth-inline-error" role="alert">
                                {error}
                            </p>
                        )}

                        <button
                            className="auth-btn"
                            type="submit"
                            style={{ marginTop: 18 }}
                            disabled={loading || passwordMismatch}
                        >
                            {loading ? t('common.saving') : t('recover.submit')}
                        </button>
                    </form>
                </>
            )}

            {step !== 2 && (
                <div className="auth-bottom auth-bottom--center">
                    <Link to="/login" className="orange">
                        {t('recover.back')}
                    </Link>
                </div>
            )}
        </section>
    )
}
