import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AuthBackground from '@/components/AuthBackground'
import Logo from '@/components/Logo'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/i18n'
import LanguageSwitcher from '@/components/LanguageSwitcher'

export default function Invite() {
    const { t } = useI18n()
    const { code } = useParams()
    const nav = useNavigate()
    const { isAuthenticated } = useAuth()
    const [state, setState] = useState({
        loading: true,
        error: '',
        space: null,
    })

    useEffect(() => {
        if (!isAuthenticated) return

        api.acceptInvite({ code })
            .then(({ space }) => {
                setState({ loading: false, error: '', space })
            })
            .catch((e) => {
                setState({
                    loading: false,
                    error: e?.message || t('invite.acceptFailed'),
                    space: null,
                })
            })
    }, [code, isAuthenticated])

    return (
        <div className="auth-layout">
            <AuthBackground />
            <LanguageSwitcher />

            <div className="auth-layout__content">
                <section
                    className="auth-card auth-card--narrow"
                    style={{ textAlign: 'center' }}
                >
                    <Logo size={120} />

                    {!isAuthenticated && (
                        <>
                            <h1 className="auth-card__title auth-card__title--narrow">
                                {t('invite.title')}
                            </h1>

                            <p className="auth-card__lead">
                                {t('invite.signInPrompt')}
                            </p>

                            <Link
                                to="/login"
                                className="btn btn--primary"
                                style={{ display: 'inline-flex', marginTop: 12 }}
                            >
                                {t('auth.signIn')}
                            </Link>
                        </>
                    )}

                    {isAuthenticated && state.loading && (
                        <p className="muted" style={{ marginTop: 16 }}>
                            {t('invite.checking')}
                        </p>
                    )}

                    {isAuthenticated && state.error && (
                        <p
                            className="auth-inline-error"
                            style={{ marginTop: 16 }}
                        >
                            {state.error}
                        </p>
                    )}

                    {isAuthenticated && state.space && (
                        <>
                            <h1
                                className="auth-card__title auth-card__title--narrow"
                                style={{ marginTop: 16 }}
                            >
                                {t('invite.joined', { name: state.space.name })}
                            </h1>

                            <button
                                className="btn btn--primary"
                                style={{ marginTop: 12 }}
                                onClick={() => nav(`/app/spaces/${state.space.id}`)}
                            >
                                {t('invite.goToSpace')}
                            </button>
                        </>
                    )}
                </section>
            </div>
        </div>
    )
}