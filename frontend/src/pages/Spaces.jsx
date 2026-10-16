import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import VisibilityPicker from '@/components/VisibilityPicker'
import RightSidebar from '@/components/RightSidebar'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import SpaceChannelSidebar from '@/components/SpaceChannelSidebar'
import SpaceMembersSidebar from '@/components/SpaceMembersSidebar'
import Avatar from '@/components/Avatar'
import MenuButton from '@/components/MenuButton'
import SpaceNavButton, { SPACE_NAV_EVENT } from '@/components/SpaceNavButton'
import { api } from '@/api'
import { useI18n } from '@/i18n'
import { useAppEvent } from '@/hooks/useAppEvent'
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
                                    {space.avatarUrl ? (
                                        <img className="space-card__avatar" src={space.avatarUrl} alt="" loading="lazy" />
                                    ) : (
                                        <Icon name="users" className="space-card__icon" />
                                    )}
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
    const [isPublic, setIsPublic] = useState(false)
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
                isPublic,
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

                        <div className="settings-form__field">
                            <label>{t('spaces.visibility')}</label>
                            <VisibilityPicker value={isPublic} onChange={setIsPublic} disabled={loading} />
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
    const { spaceId } = useParams()
    const [space, setSpace] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            setSpace(await api.getSpace(spaceId))
        } catch (err) {
            setSpace(null)
            setError(err?.message || t('spaces.loadOneFailed'))
        } finally {
            setLoading(false)
        }
    }, [spaceId])

    useEffect(() => {
        load()
    }, [load])

    useAppEvent(['space_updated'], load)

    const [joining, setJoining] = useState(false)
    const join = async () => {
        setJoining(true)
        setError('')
        try {
            await api.joinSpace(spaceId)
            await load()
        } catch (err) {
            setError(err?.message || t('spaces.joinFailed'))
        } finally {
            setJoining(false)
        }
    }

    return (
        <div className="app-layout app-layout--space">
            <SpaceChannelSidebar spaceId={spaceId} spaceName={space?.name} />
            <main className="space-welcome">
                <header className="space-topbar">
                    <MenuButton />
                    <div className="space-topbar__back">
                        <span className="space-topbar__title">{space?.name || t('nav.spaces')}</span>
                    </div>
                    <SpaceNavButton />
                </header>

                {loading && <p className="muted">{t('common.loading')}</p>}
                {!loading && error && (
                    <div className="space-welcome__error">
                        <p className="auth-inline-error">{error}</p>
                        <button type="button" className="btn btn--ghost" onClick={load}>{t('common.retry')}</button>
                    </div>
                )}
                {!loading && !error && space && (
                    <div className="space-welcome__inner">
                        <div className="space-welcome__icon">
                            {space.avatarUrl || space.avatar_url
                                ? <Avatar src={space.avatarUrl || space.avatar_url} label={space.name} size={96} />
                                : (space.name?.slice(0, 1)?.toUpperCase() || 'N')}
                        </div>
                        <h1>{space.name}</h1>
                        <p>{space.description || 'Добро пожаловать в пространство. Выберите канал слева или создайте новый.'}</p>
                        <div className="space-welcome__actions">
                            <button
                                type="button"
                                className="btn btn--ghost space-welcome__channels"
                                onClick={() => window.dispatchEvent(new CustomEvent(SPACE_NAV_EVENT))}
                            >
                                <Icon name="hash" /> {t('spacenav.channels')}
                            </button>
                            {space.isMember === false && (
                                <button type="button" className="btn btn--primary" onClick={join} disabled={joining}>
                                    {t('spaces.join')}
                                </button>
                            )}
                            {space.can?.manageChannels && (
                                <>
                                    <button type="button" className="btn btn--primary" onClick={() => window.dispatchEvent(new CustomEvent('nebula-create-channel', { detail: 'text' }))}>＋ Создать текстовый канал</button>
                                    <button type="button" className="btn btn--ghost" onClick={() => window.dispatchEvent(new CustomEvent('nebula-create-channel', { detail: 'voice' }))}>＋ Голосовой канал</button>
                                </>
                            )}
                            {space.canManage && (
                                <Link to={`/app/spaces/${spaceId}/settings`} className="btn btn--ghost">{t('ss.title')}</Link>
                            )}
                        </div>
                    </div>
                )}
            </main>
            <SpaceMembersSidebar space={space} />
        </div>
    )
}
