import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import NavigationRail from '@/components/NavigationRail'
import Sidebar from '@/components/Sidebar'
import RightSidebar from '@/components/RightSidebar'
import PageHeader from '@/components/PageHeader'
import Avatar from '@/components/Avatar'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/i18n'

const isHttpUrl = (value) => /^https?:\/\//i.test(value || '')

export default function UserProfile() {
    const { t } = useI18n()
    const { userId } = useParams()
    const { user: me } = useAuth()
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        setError('')

        try {
            setUser(await api.getUser(userId))
        } catch (err) {
            setUser(null)
            setError(err?.message || t('userProfile.loadFailed'))
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => {
        load()
    }, [load])

    if (me?.id && String(me.id) === String(userId)) {
        return <Navigate to="/app/profile" replace />
    }

    const act = async (action) => {
        setBusy(true)
        setError('')

        try {
            await action()
            setUser(await api.getUser(userId))
        } catch (err) {
            setError(err?.message || t('userProfile.actionFailed'))
        } finally {
            setBusy(false)
        }
    }

    const name = user?.displayName || user?.name
    const joined = user?.createdAt
        ? new Date(user.createdAt).toLocaleDateString()
        : ''

    const details = user
        ? [
            [t('userProfile.pronouns'), user.pronouns],
            [t('userProfile.location'), user.location],
            [t('userProfile.website'), user.website],
        ].filter(([, value]) => value)
        : []

    return (
        <div className="app-layout">
            <NavigationRail />
            <Sidebar />

            <main className="main">
                <div className="main__content profile-page">
                    <PageHeader title={name || t('nav.profile')} />

                    {loading && <p className="muted">{t('common.loading')}</p>}

                    {error && (
                        <p className="auth-inline-error" role="alert">
                            {error}
                        </p>
                    )}

                    {!loading && !user && (
                        <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={load}
                        >
                            {t('common.retry')}
                        </button>
                    )}

                    {!loading && user && (
                        <>
                            <section className="profile-card profile-card--minimal">
                                <Avatar
                                    src={user.avatarUrl || user.avatar}
                                    label={name}
                                    size={96}
                                />

                                <div className="profile-card__identity">
                                    <h2>{name}</h2>
                                    <p>@{user.username}</p>

                                    {user.statusText && (
                                        <p className="profile-status">
                                            {user.statusText}
                                        </p>
                                    )}

                                    {joined && (
                                        <p>
                                            {t('userProfile.joined', {
                                                date: joined,
                                            })}
                                        </p>
                                    )}
                                </div>

                                <div className="profile-avatar-actions">
                                    {user.relationship === 'self' && (
                                        <Link
                                            className="btn btn--ghost"
                                            to="/app/profile"
                                        >
                                            {t('userProfile.editMine')}
                                        </Link>
                                    )}

                                    {user.relationship !== 'self' && (
                                        <Link
                                            className="btn btn--primary"
                                            to={`/app/dm/${user.id}`}
                                        >
                                            {t('common.write')}
                                        </Link>
                                    )}

                                    {user.relationship === 'none' && (
                                        <button
                                            type="button"
                                            className="btn btn--ghost"
                                            disabled={busy}
                                            onClick={() =>
                                                act(() =>
                                                    api.sendFriendRequest({
                                                        username: user.username,
                                                    })
                                                )
                                            }
                                        >
                                            {t('userProfile.addFriend')}
                                        </button>
                                    )}

                                    {user.relationship === 'outgoing' && (
                                        <>
                                            <small>
                                                {t('userProfile.requestSent')}
                                            </small>
                                            <button
                                                type="button"
                                                className="btn btn--ghost"
                                                disabled={busy}
                                                onClick={() =>
                                                    act(() =>
                                                        api.cancelFriendRequest(
                                                            user.requestId
                                                        )
                                                    )
                                                }
                                            >
                                                {t('userProfile.cancelRequest')}
                                            </button>
                                        </>
                                    )}

                                    {user.relationship === 'incoming' && (
                                        <>
                                            <small>
                                                {t('userProfile.incoming')}
                                            </small>
                                            <button
                                                type="button"
                                                className="btn btn--primary"
                                                disabled={busy}
                                                onClick={() =>
                                                    act(() =>
                                                        api.acceptFriend(
                                                            user.requestId
                                                        )
                                                    )
                                                }
                                            >
                                                {t('friends.accept')}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn--ghost"
                                                disabled={busy}
                                                onClick={() =>
                                                    act(() =>
                                                        api.declineFriend(
                                                            user.requestId
                                                        )
                                                    )
                                                }
                                            >
                                                {t('friends.decline')}
                                            </button>
                                        </>
                                    )}

                                    {user.relationship === 'friends' && (
                                        <>
                                            <small>
                                                {t('userProfile.isFriend')}
                                            </small>
                                            <button
                                                type="button"
                                                className="btn btn--ghost"
                                                disabled={busy}
                                                onClick={() =>
                                                    act(() =>
                                                        api.removeFriend(user.id)
                                                    )
                                                }
                                            >
                                                {t('friends.remove')}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </section>

                            <section className="profile-edit-section">
                                <h2>{t('userProfile.about')}</h2>

                                <p className="profile-about">
                                    {user.bio || t('userProfile.noBio')}
                                </p>

                                {details.map(([label, value]) => (
                                    <div
                                        key={label}
                                        className="profile-form__field"
                                    >
                                        <label>{label}</label>
                                        {isHttpUrl(value) ? (
                                            <a
                                                href={value}
                                                target="_blank"
                                                rel="noopener noreferrer nofollow"
                                            >
                                                {value}
                                            </a>
                                        ) : (
                                            <span>{value}</span>
                                        )}
                                    </div>
                                ))}
                            </section>
                        </>
                    )}
                </div>
            </main>

            <RightSidebar />
        </div>
    )
}
