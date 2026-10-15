import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import RightSidebar from '@/components/RightSidebar'
import PageHeader from '@/components/PageHeader'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'
import { api } from '@/api'
import { useI18n } from '@/i18n'

export default function Friends() {
    const { t } = useI18n()
    const [friends, setFriends] = useState([])
    const [requests, setRequests] = useState({ incoming: [], outgoing: [] })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [username, setUsername] = useState('')
    const [notice, setNotice] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        setError('')

        try {
            const [friendList, friendRequests] = await Promise.all([
                api.getFriends(),
                api.getFriendRequests(),
            ])

            setFriends(Array.isArray(friendList) ? friendList : [])
            setRequests({
                incoming: friendRequests?.incoming || [],
                outgoing: friendRequests?.outgoing || [],
            })
        } catch (err) {
            setError(err?.message || t('friends.loadFailed'))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    const sendRequest = async (event) => {
        event.preventDefault()
        setNotice('')
        setError('')

        try {
            await api.sendFriendRequest({ username: username.trim() })
            setUsername('')
            setNotice(t('friends.requestSent'))
            await load()
        } catch (err) {
            setError(err?.message || t('friends.sendFailed'))
        }
    }

    const handleRequest = async (id, action) => {
        setError('')

        try {
            if (action === 'accept') {
                await api.acceptFriend(id)
            } else {
                await api.declineFriend(id)
            }

            await load()
        } catch (err) {
            setError(err?.message || t('friends.handleFailed'))
        }
    }

    const removeFriend = async (id) => {
        setError('')

        try {
            await api.removeFriend(id)
            await load()
        } catch (err) {
            setError(err?.message || t('friends.removeFailed'))
        }
    }

    return (
        <div className="app-layout">

            <main className="main">
                <div className="main__content">
                    <PageHeader title={t('nav.friends')} />

                    <form className="friends__add-form" onSubmit={sendRequest}>
                        <label htmlFor="friend-username">
                            {t('friends.addByUsername')}
                        </label>

                        <div className="friends__add-row">
                            <input
                                id="friend-username"
                                className="input"
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                placeholder={t('friends.usernamePlaceholder')}
                                autoComplete="off"
                                required
                            />

                            <button type="submit" className="btn btn--primary">
                                {t('friends.add')}
                            </button>
                        </div>
                    </form>

                    {notice && <p className="form-notice">{notice}</p>}
                    {error && <p className="auth-inline-error">{error}</p>}
                    {loading && <p className="muted">{t('common.loading')}</p>}

                    {!loading && !error && (
                        <>
                            <section className="friends__section">
                                <h2 className="section-title">{t('friends.incoming')}</h2>

                                {requests.incoming.length === 0 ? (
                                    <p className="muted">{t('friends.noRequests')}</p>
                                ) : (
                                    <div className="friend-list">
                                        {requests.incoming.map((request) => (
                                            <div
                                                key={request.id}
                                                className="friend-row"
                                            >
                                                <Avatar
                                                    src={request.avatarUrl || request.avatar}
                                                    label={request.name}
                                                    size={44}
                                                />

                                                <div className="friend-row__info">
                                                    <div className="friend-row__name">
                                                        {request.displayName || request.name}
                                                    </div>
                                                    <div className="friend-row__status">
                                                        {t('friends.requestLabel')}
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    className="btn btn--primary"
                                                    onClick={() => handleRequest(request.id, 'accept')}
                                                >
                                                    {t('friends.accept')}
                                                </button>

                                                <button
                                                    type="button"
                                                    className="btn btn--ghost"
                                                    onClick={() => handleRequest(request.id, 'decline')}
                                                >
                                                    {t('friends.decline')}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section className="friends__section">
                                <h2 className="section-title">{t('friends.mine')}</h2>

                                {friends.length === 0 ? (
                                    <EmptyState
                                        icon="users"
                                        title={t('friends.emptyTitle')}
                                        description={t('friends.emptyDesc')}
                                    />
                                ) : (
                                    <div className="friend-list">
                                        {friends.map((friend) => (
                                            <div
                                                key={friend.id}
                                                className="friend-row"
                                            >
                                                <Avatar
                                                    src={friend.avatarUrl || friend.avatar}
                                                    label={friend.name}
                                                    size={44}
                                                />

                                                <div className="friend-row__info">
                                                    <div className="friend-row__name">
                                                        {friend.displayName || friend.name}
                                                    </div>
                                                    <div className="friend-row__status">
                                                        {friend.status === 'online'
                                                            ? t('friends.statusOnline')
                                                            : friend.status === 'offline'
                                                                ? t('friends.statusOffline')
                                                                : t('friends.statusUnavailable')}
                                                    </div>
                                                </div>

                                                <Link
                                                    className="btn btn--ghost"
                                                    to={`/app/dm/${friend.id}`}
                                                >
                                                    {t('common.write')}
                                                </Link>

                                                <button
                                                    type="button"
                                                    className="btn btn--ghost"
                                                    onClick={() => removeFriend(friend.id)}
                                                >
                                                    {t('friends.remove')}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </>
                    )}
                </div>
            </main>

            <RightSidebar />
        </div>
    )
}
