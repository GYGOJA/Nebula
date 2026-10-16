import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import RightSidebar from '@/components/RightSidebar'
import PageHeader from '@/components/PageHeader'
import Avatar from '@/components/Avatar'
import Icon from '@/assets/icon/Icon.jsx'
import EmptyState from '@/components/EmptyState'
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
            <main className="main">
                <div className="main__content profile-page">
                    <PageHeader title={name || t('nav.profile')} />

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

                    {!loading && !user && (
                        <div className="profile-retry">
                            <button
                                type="button"
                                className="btn btn--ghost"
                                onClick={load}
                            >
                                {t('common.retry')}
                            </button>
                        </div>
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
                            </section>

                            <div className="profile-avatar-actions">
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
                                        <span className="muted">
                                            {t('userProfile.requestSent')}
                                        </span>
                                        <button
                                            type="button"
                                            className="btn btn--ghost"
                                            disabled={busy}
                                            onClick={() =>
                                                act(() =>
                                                    api.cancelFriend(user.requestId)
                                                )
                                            }
                                        >
                                            {t('userProfile.cancelRequest')}
                                        </button>
                                    </>
                                )}

                                {user.relationship === 'incoming' && (
                                    <>
                                        <span className="muted">
                                            {t('userProfile.incoming')}
                                        </span>
                                        <button
                                            type="button"
                                            className="btn btn--primary"
                                            disabled={busy}
                                            onClick={() =>
                                                act(() =>
                                                    api.acceptFriend(user.requestId)
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
                                                    api.declineFriend(user.requestId)
                                                )
                                            }
                                        >
                                            {t('friends.decline')}
                                        </button>
                                    </>
                                )}

                                {user.relationship === 'friends' && (
                                    <>
                                        <span className="muted">
                                            {t('userProfile.isFriend')}
                                        </span>
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

                            <section className="profile-edit-section profile-shared-spaces">
                                <h2>{t('userProfile.sharedSpaces')}</h2>
                                {user.sharedSpaces?.length ? (
                                    <div className="profile-shared-spaces__list">
                                        {user.sharedSpaces.map((space) => (
                                            <Link key={space.id} to={`/app/spaces/${space.id}`} className="profile-shared-space">
                                                <Avatar src={space.avatarUrl || space.avatar_url} label={space.name} size={36} />
                                                <div><strong>{space.name}</strong><span>{space.description || t('userProfile.sharedSpaceMembers', { count: space.members || 0 })}</span></div>
                                            </Link>
                                        ))}
                                    </div>
                                ) : <p className="muted">{t('userProfile.noSharedSpaces')}</p>}
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

                    {!loading && !user && !error && (
                        <EmptyState
                            icon="user"
                            title={t('userProfile.loadFailed')}
                            description=""
                        />
                    )}
                </div>
            </main>

            <RightSidebar />
        </div>
    )
}
