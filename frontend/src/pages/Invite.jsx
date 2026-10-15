import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import AuthBackground from '@/components/AuthBackground'
import Logo from '@/components/Logo'
import Avatar from '@/components/Avatar'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/i18n'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { emitAppEvent } from '@/hooks/useAppEvent'

export default function Invite() {
    const { t } = useI18n()
    const { code } = useParams()
    const nav = useNavigate()
    const location = useLocation()
    const { isAuthenticated } = useAuth()
    const [state, setState] = useState({
        loading: true,
        error: '',
        space: null,
        isMember: false,
    })
    const [joining, setJoining] = useState(false)
    const [joined, setJoined] = useState(false)

    // Opening the link only previews the group; joining is an explicit action.
    useEffect(() => {
        if (!isAuthenticated) return undefined

        let alive = true

        setState({ loading: true, error: '', space: null, isMember: false })

        api.getInvite(code)
            .then((data) => {
                if (!alive) return
                setState({ loading: false, error: '', space: data.space, isMember: Boolean(data.isMember) })
            })
            .catch((e) => {
                if (!alive) return
                setState({
                    loading: false,
                    error: e?.message || t('invite.acceptFailed'),
                    space: null,
                    isMember: false,
                })
            })

        return () => {
            alive = false
        }
    }, [code, isAuthenticated])

    const join = async () => {
        setJoining(true)

        try {
            const data = await api.acceptInvite({ code })

            setState((previous) => ({ ...previous, space: data.space || previous.space, isMember: true, error: '' }))
            setJoined(true)
            emitAppEvent('space_updated', { spaceId: data.space?.id })
        } catch (e) {
            setState((previous) => ({ ...previous, error: e?.message || t('invite.acceptFailed') }))
        } finally {
            setJoining(false)
        }
    }

    const { loading, error, space, isMember } = state

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
                                state={{ from: location }}
                                className="btn btn--primary"
                                style={{ display: 'inline-flex', marginTop: 12 }}
                            >
                                {t('auth.signIn')}
                            </Link>
                        </>
                    )}

                    {isAuthenticated && loading && (
                        <p className="muted" style={{ marginTop: 16 }}>
                            {t('invite.checking')}
                        </p>
                    )}

                    {isAuthenticated && error && (
                        <p
                            className="auth-inline-error"
                            style={{ marginTop: 16 }}
                        >
                            {error}
                        </p>
                    )}

                    {isAuthenticated && !loading && space && (
                        <div className="invite-page">
                            <div className="invite-page__avatar">
                                {space.avatarUrl ? (
                                    <Avatar src={space.avatarUrl} label={space.name} size={88} />
                                ) : (
                                    <span className="invite-card__initial invite-card__initial--lg">
                                        {(space.name || 'N').slice(0, 1).toUpperCase()}
                                    </span>
                                )}
                            </div>

                            <h1 className="auth-card__title auth-card__title--narrow">
                                {joined ? t('invite.joined', { name: space.name }) : space.name}
                            </h1>

                            {!joined && (
                                <p className="auth-card__lead">{t('invite.card.title')}</p>
                            )}

                            {space.description && !joined && (
                                <p className="invite-page__desc">{space.description}</p>
                            )}

                            {typeof space.members === 'number' && !joined && (
                                <p className="muted">{t('invite.card.members', { count: space.members })}</p>
                            )}

                            {isMember ? (
                                <button
                                    className="btn btn--primary"
                                    style={{ marginTop: 12 }}
                                    onClick={() => nav(`/app/spaces/${space.id}`)}
                                >
                                    {t('invite.goToSpace')}
                                </button>
                            ) : (
                                <button
                                    className="btn btn--primary"
                                    style={{ marginTop: 12 }}
                                    onClick={join}
                                    disabled={joining}
                                >
                                    {joining ? t('invite.card.joining') : t('invite.card.join')}
                                </button>
                            )}
                        </div>
                    )}
                </section>
            </div>
        </div>
    )
}
