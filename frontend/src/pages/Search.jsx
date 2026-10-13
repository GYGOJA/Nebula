import { useState } from 'react'
import { Link } from 'react-router-dom'
import NavigationRail from '@/components/NavigationRail'
import Sidebar from '@/components/Sidebar'
import RightSidebar from '@/components/RightSidebar'
import PageHeader from '@/components/PageHeader'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'
import { api } from '@/api'
import { useI18n } from '@/i18n'
import Icon from "@/assets/icon/Icon.jsx";

const TYPES = [
    { value: 'users', labelKey: 'search.typeUsers' },
    { value: 'spaces', labelKey: 'search.typeSpaces' },
    { value: 'messages', labelKey: 'search.typeMessages' },
]

export default function Search() {
    const { t } = useI18n()
    const [type, setType] = useState('users')
    const [query, setQuery] = useState('')
    const [results, setResults] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [searched, setSearched] = useState(false)

    const search = async (event) => {
        event.preventDefault()

        const value = query.trim()

        if (!value) {
            setResults([])
            setSearched(false)
            setError('')
            return
        }

        setLoading(true)
        setError('')
        setSearched(true)

        try {
            const methods = {
                users: api.searchUsers,
                spaces: api.searchSpaces,
                messages: api.searchMessages,
            }

            const result = await methods[type](value)
            setResults(Array.isArray(result) ? result : [])
        } catch (err) {
            setResults([])
            setError(err?.message || t('search.unavailable'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="app-layout">
            <NavigationRail />
            <Sidebar />

            <main className="main">
                <div className="main__content">
                    <PageHeader title={t('nav.search')} />

                    <form className="search-page__form" onSubmit={search}>
                        <label htmlFor="global-search">{t('search.question')}</label>

                        <div className="search-page__input-row">
                            <input
                                id="global-search"
                                className="input"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={t('search.placeholder')}
                            />
                            <button
                                className="btn btn--primary search-page__submit"
                                type="submit"
                                disabled={loading || !query.trim()}
                            >
                                {loading ? t('search.searching') : t('search.submit')}
                            </button>
                        </div>

                        <div className="search-page__types">
                            {TYPES.map((item) => (
                                <button
                                    key={item.value}
                                    type="button"
                                    className={`btn ${
                                        type === item.value
                                            ? 'btn--primary'
                                            : 'btn--ghost'
                                    }`}
                                    onClick={() => setType(item.value)}
                                >
                                    {t(item.labelKey)}
                                </button>
                            ))}
                        </div>

                    </form>

                    {error && <p className="auth-inline-error">{error}</p>}
                    {loading && <p className="muted">{t('search.searching')}</p>}

                    {!loading && !error && searched && results.length === 0 && (
                        <EmptyState
                            icon="search"
                            title={t('search.emptyTitle')}
                            description={t('search.emptyDesc')}
                        />
                    )}

                    {!loading && !error && results.length > 0 && (
                        <div className="search-page__results">
                            {results.map((item) => (
                                <div
                                    className="friend-row"
                                    key={`${type}-${item.id}`}
                                >
                                    {type === 'users' && (
                                        <>
                                            <Avatar
                                                src={item.avatarUrl || item.avatar}
                                                label={item.name}
                                                size={44}
                                            />
                                            <div className="friend-row__info">
                                                <div className="friend-row__name">
                                                    {item.displayName || item.name}
                                                </div>
                                                <div className="friend-row__status">
                                                    {item.username ? `@${item.username}` : ''}
                                                </div>
                                            </div>
                                            <Link
                                                className="btn btn--ghost"
                                                to={`/app/dm/${item.id}`}
                                            >
                                                {t('common.write')}
                                            </Link>
                                        </>
                                    )}

                                    {type === 'spaces' && (
                                        <>
                                            <Icon name="users" />
                                            <div className="friend-row__info">
                                                <div className="friend-row__name">
                                                    {item.name}
                                                </div>
                                                <div className="friend-row__status">
                                                    {item.description || ''}
                                                </div>
                                            </div>
                                            <Link
                                                className="btn btn--ghost"
                                                to={`/app/spaces/${item.id}`}
                                            >
                                                {t('common.open')}
                                            </Link>
                                        </>
                                    )}

                                    {type === 'messages' && (
                                        <>
                                            <div className="friend-row__info">
                                                <div className="friend-row__name">
                                                    {item.text}
                                                </div>
                                                <div className="friend-row__status">
                                                    {item.channelName || item.channelId}
                                                </div>
                                            </div>
                                            {item.channelId && (
                                                <Link
                                                    className="btn btn--ghost"
                                                    to={`/app/channels/${item.channelId}`}
                                                >
                                                    {t('search.goToChannel')}
                                                </Link>
                                            )}
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            <RightSidebar />
        </div>
    )
}