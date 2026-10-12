import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import OtpInput from '@/components/OtpInput'
import Progress from '@/components/Progress'
import { api } from '@/api'
import { pendingRegistration } from '@/api/client'
import { CODE_LENGTH, RESEND_SECONDS, maskEmail } from '@/utils/auth'
import { useI18n } from '@/i18n'

function VerifyForm({ email }) {
    const { t } = useI18n()
    const nav = useNavigate()
    const [code, setCode] = useState('')
    const [error, setError] = useState('')
    const [attemptsLeft, setAttemptsLeft] = useState(null)
    const [loading, setLoading] = useState(false)
    const [resending, setResending] = useState(false)
    const [cooldown, setCooldown] = useState(RESEND_SECONDS)

    useEffect(() => {
        if (cooldown <= 0) return undefined

        const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
        return () => clearTimeout(id)
    }, [cooldown])

    const busy = loading || resending

    const onSubmit = async (e) => {
        e.preventDefault()
        setError('')

        if (code.length !== CODE_LENGTH) {
            setError(t('validation.codeLength', { length: CODE_LENGTH }))
            return
        }

        setLoading(true)

        try {
            const res = await api.verifyCode({ email, code })

            if (!res?.ticket) {
                throw new Error(t('errors.badResponse'))
            }

            pendingRegistration.set({ email, ticket: res.ticket })
            nav('/register/profile')
        } catch (err) {
            setError(err?.message || t('verify.failed'))

            if (typeof err?.data?.attemptsLeft === 'number') {
                setAttemptsLeft(err.data.attemptsLeft)
            }

            setCode('')
        } finally {
            setLoading(false)
        }
    }

    const onResend = async () => {
        setError('')
        setResending(true)

        try {
            await api.sendCode({ email })
            setCode('')
            setAttemptsLeft(null)
            setCooldown(RESEND_SECONDS)
        } catch (err) {
            setError(err?.message || t('auth.sendCodeFailed'))
        } finally {
            setResending(false)
        }
    }

    const onChangeEmail = () => pendingRegistration.clear()

    const mm = Math.floor(cooldown / 60)
    const ss = String(cooldown % 60).padStart(2, '0')

    return (
        <section className="auth-card auth-card--otp">
            <Progress step={2} />

            <h1 className="auth-card__title-otp">{t('verify.title')}</h1>

            <p className="auth-card__lead auth-card__lead--otp">
                {t('auth.codeSent', { email: maskEmail(email) })}{' '}
                {t('auth.codeValid')}
            </p>

            <form onSubmit={onSubmit}>
                <OtpInput
                    length={CODE_LENGTH}
                    value={code}
                    onChange={setCode}
                    disabled={busy}
                />

                {error && (
                    <p className="auth-inline-error" role="alert">
                        {error}
                    </p>
                )}

                {attemptsLeft !== null && (
                    <p className="auth-meta">
                        {t('verify.attemptsLeft', { count: attemptsLeft })}
                    </p>
                )}

                <p className="auth-meta">
                    {cooldown > 0 ? (
                        <>
                            {t('verify.resendIn')}{' '}
                            <span className="orange">{mm}:{ss}</span>
                        </>
                    ) : (
                        <button
                            type="button"
                            className="auth-link-btn"
                            onClick={onResend}
                            disabled={busy}
                        >
                            {resending ? t('common.sending') : t('verify.resend')}
                        </button>
                    )}
                </p>

                <button
                    className="auth-btn"
                    type="submit"
                    disabled={busy || code.length !== CODE_LENGTH}
                >
                    {loading ? t('verify.checking') : t('common.confirm')}
                </button>
            </form>

            <div className="auth-bottom auth-bottom--center">
                <Link
                    to="/register"
                    className="orange"
                    onClick={onChangeEmail}
                >
                    {t('auth.changeEmail')}
                </Link>
            </div>
        </section>
    )
}

export default function RegisterVerify() {
    const pending = pendingRegistration.get()

    if (!pending?.email) return <Navigate to="/register" replace />
    if (pending.ticket) return <Navigate to="/register/profile" replace />

    return <VerifyForm email={pending.email} />
}