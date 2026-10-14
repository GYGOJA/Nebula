import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import RightSidebar from '@/components/RightSidebar'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import { api } from '@/api'
import { useI18n } from '@/i18n'
import Icon from "@/assets/icon/Icon.jsx";

export function Spaces() {
    const { t } = useI18n()
    const [spaces, setSpaces] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        setError('')

        try {
            const result = await api.getSpaces()
            setSpaces(Array.isArray(result) ? result : [])
        } catch (err) {
            setError(err?.message || t('spaces.loadFailed'))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    return (
        <div className="app-layout">

            <main className="main">
                <div className="main__content">
                    <PageHeader title={t('nav.spaces')} />

                    {loading && <p className="muted">{t('common.loading')}</p>}

                    {!loading && error && (
                        <>
                            <p className="auth-inline-error">{error}</p>
                            <button
                                type="button"
                                className="btn btn--ghost"
                                onClick={load}
                            >
                                {t('common.retry')}
                            </button>
                        </>
                    )}

                    {!loading && !error && spaces.length === 0 && (
                        <EmptyState
                            icon="users"
                            title={t('spaces.emptyTitle')}
                            description={t('spaces.emptyDesc')}
                            action={
                                <Link
                                    to="/app/spaces/new"
                                    className="btn btn--primary"
                                >
                                    {t('nav.createSpace')}
                                </Link>
                            }
                        />
                    )}

                    {!loading && !error && spaces.length > 0 && (
                        <div className="spaces-grid">
                            {spaces.map((space) => (
                                <Link
                                    className="space-card"
                                    key={space.id}
                                    to={`/app/spaces/${space.id}`}
                                >
                                    <Icon name="users" className="space-card__icon" />
                                    <span className="space-card__name">
                                        {space.name}
                                    </span>
                                    <span className="space-card__description">
                                        {space.description || ''}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            <RightSidebar />
        </div>
    )
}

export function CreateSpace() {
    const { t } = useI18n()
    const navigate = useNavigate()
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const submit = async (event) => {
        event.preventDefault()
        setLoading(true)
        setError('')

        try {
            const space = await api.createSpace({
                name: name.trim(),
                description: description.trim(),
            })

            navigate(`/app/spaces/${space.id}`)
        } catch (err) {
            setError(err?.message || t('spaces.createFailed'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="app-layout">

            <main className="main">
                <div className="main__content">
                    <PageHeader title={t('nav.createSpace')} />

                    <form className="settings-form" onSubmit={submit}>
                        <div className="settings-form__field">
                            <label htmlFor="space-name">{t('spaces.name')}</label>
                            <input
                                id="space-name"
                                className="input"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                maxLength={80}
                                required
                            />
                        </div>

                        <div className="settings-form__field">
                            <label htmlFor="space-description">{t('spaces.description')}</label>
                            <textarea
                                id="space-description"
                                className="input"
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                maxLength={500}
                                rows={4}
                            />
                        </div>

                        {error && (
                            <p className="auth-inline-error">{error}</p>
                        )}

                        <button
                            type="submit"
                            className="btn btn--primary"
                            disabled={loading || !name.trim()}
                        >
                            {loading ? t('common.creating') : t('spaces.create')}
                        </button>
                    </form>
                </div>
            </main>

            <RightSidebar />
        </div>
    )
}

export function SpaceDetails() {
    const { t } = useI18n()
    const { id } = useParams()
    const [space, setSpace] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        setError('')

        try {
            const result = await api.getSpace(id)
            setSpace(result)
        } catch (err) {
            setSpace(null)
            setError(err?.message || t('spaces.loadOneFailed'))
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => {
        load()
    }, [load])

    return (
        <div className="app-layout">

            <main className="main">
                <div className="main__content">
                    {loading && <p className="muted">{t('common.loading')}</p>}

                    {!loading && error && (
                        <>
                            <p className="auth-inline-error">{error}</p>
                            <button
                                type="button"
                                className="btn btn--ghost"
                                onClick={load}
                            >
                                {t('common.retry')}
                            </button>
                        </>
                    )}

                    {!loading && !error && space && (
                        <>
                            <PageHeader title={space.name} />

                            {space.description && (
                                <p className="muted">{space.description}</p>
                            )}

                            <section className="spaces-section">
                                <h2 className="section-title">{t('spaces.textChannels')}</h2>

                                {space.channels?.length ? (
                                    <div className="space-channel-list">
                                        {space.channels.map((channel) => (
                                            <Link
                                                key={channel.id}
                                                className="space-channel"
                                                to={`/app/channels/${channel.id}`}
                                            >
                                                <Icon name="hash" />
                                                <span>{channel.name}</span>
                                            </Link>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState
                                        icon="hash"
                                        title={t('home.noChannelsTitle')}
                                        description={t('spaces.noChannelsDesc')}
                                    />
                                )}
                            </section>

                            <section className="spaces-section">
                                <h2 className="section-title">{t('spaces.voiceRooms')}</h2>

                                {space.voiceRooms?.length ? (
                                    <div className="space-channel-list">
                                        {space.voiceRooms.map((room) => (
                                            <Link
                                                key={room.id}
                                                className="space-channel"
                                                to={`/app/voice/${room.id}`}
                                            >
                                                <Icon name="volume-2" />
                                                <span>{room.name}</span>
                                            </Link>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState
                                        icon="volume-2"
                                        title={t('spaces.noVoiceTitle')}
                                        description={t('spaces.noVoiceDesc')}
                                    />
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