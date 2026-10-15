import { useEffect, useRef, useState } from 'react'
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
    const [phase, setPhase] = useState('idle')
    const mounted = useRef(true)

    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
        }
    }, [])

    useEffect(() => {
        if (cooldown <= 0) return undefined

        const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
        return () => clearTimeout(id)
    }, [cooldown])

    const busy = loading || resending || (phase !== 'idle' && phase !== 'error')

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

    const verify = async () => {
        setError('')

        if (code.length !== CODE_LENGTH) {
            setError(t('validation.codeLength', { length: CODE_LENGTH }))
            return
        }

        setLoading(true)
        setPhase('fan')

        try {
            const request = api.verifyCode({ email, code })
            request.catch(() => {})

            await sleep(420)
            if (!mounted.current) return
            setPhase('stack')

            await sleep(460)
            if (!mounted.current) return
            setPhase('checking')

            const [res] = await Promise.all([request, sleep(700)])

            if (!res?.ticket) {
                throw new Error(t('errors.badResponse'))
            }

            if (!mounted.current) return
            setPhase('success')
            await sleep(1100)

            pendingRegistration.set({ email, ticket: res.ticket })
            nav('/register/profile')
        } catch (err) {
            if (!mounted.current) return

            setPhase('error')
            setError(err?.message || t('verify.failed'))

            if (typeof err?.data?.attemptsLeft === 'number') {
                setAttemptsLeft(err.data.attemptsLeft)
            }

            setCode('')
            setTimeout(() => {
                if (mounted.current) setPhase('idle')
            }, 650)
        } finally {
            if (mounted.current) setLoading(false)
        }
    }

    const onSubmit = (e) => {
        e.preventDefault()
        if (!busy) verify()
    }

    useEffect(() => {
        if (code.length === CODE_LENGTH && phase === 'idle' && !loading && !resending) {
            verify()
        }
    }, [code])

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
        <section className="auth-card auth-card--otp" data-phase={phase}>
            <Progress step={2} />

            <h1 className="auth-card__title-otp" aria-live="polite">
                {phase === 'checking' || phase === 'stack'
                    ? t('verify.checkingTitle')
                    : phase === 'success'
                        ? t('verify.successTitle')
                        : t('verify.title')}
            </h1>

            <p className="auth-card__lead auth-card__lead--otp">
                {phase === 'checking' || phase === 'stack'
                    ? t('verify.checkingLead')
                    : phase === 'success'
                        ? t('verify.successLead')
                        : <>
                            {t('auth.codeSent', { email: maskEmail(email) })}{' '}
                            {t('auth.codeValid')}
                        </>}
            </p>

            <form onSubmit={onSubmit}>
                <OtpInput
                    length={CODE_LENGTH}
                    value={code}
                    onChange={setCode}
                    disabled={resending}
                    phase={phase}
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

                <p className="auth-meta auth-meta--resend">
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
