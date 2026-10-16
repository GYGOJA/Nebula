import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '@/api'
import Avatar from '@/components/Avatar'
import Icon from '@/assets/icon/Icon.jsx'
import { useCall } from '@/context/CallContext'
import { useI18n } from '@/i18n'
import { useAppEvent } from '@/hooks/useAppEvent'
import { SPACE_NAV_EVENT } from './SpaceNavButton'

export default function SpaceChannelSidebar({ spaceId, activeChannelId, spaceName }) {
    const { t } = useI18n()
    const navigate = useNavigate()
    const { active, roomsLive, speaking, join } = useCall()
    const [space, setSpace] = useState(null)
    const [createType, setCreateType] = useState('')
    const [channelName, setChannelName] = useState('')
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState('')
    const [mobileOpen, setMobileOpen] = useState(false)
    const { pathname } = useLocation()

    const load = useCallback(async () => {
        try {
            const result = await api.getSpace(spaceId)
            setSpace(result)
        } catch {
            setSpace(null)
        }
    }, [spaceId])

    useEffect(() => {
        load()
        const openCreate = (event) => {
            setCreateType(event.detail === 'voice' ? 'voice' : 'text')
            setError('')
        }
        window.addEventListener('nebula-create-channel', openCreate)
        return () => window.removeEventListener('nebula-create-channel', openCreate)
    }, [load])

    const createChannel = async (event) => {
        event.preventDefault()
        if (!channelName.trim() || !createType) return
        setCreating(true)
        setError('')
        try {
            await api.createChannel(spaceId, { name: channelName.trim(), type: createType })
            setChannelName('')
            setCreateType('')
            await load()
        } catch (err) {
            setError(err?.message || 'Не удалось создать канал')
        } finally {
            setCreating(false)
        }
    }

    useAppEvent(['space_updated'], load)

    useEffect(() => {
        const toggle = () => setMobileOpen((open) => !open)
        window.addEventListener(SPACE_NAV_EVENT, toggle)
        return () => window.removeEventListener(SPACE_NAV_EVENT, toggle)
    }, [])

    // Picking a channel or opening the settings closes the drawer.
    useEffect(() => { setMobileOpen(false) }, [pathname])

    const canCreate = Boolean(space?.can?.manageChannels)
    const canManage = Boolean(space?.canManage)
    const settingsLink = (extra = '') => `/app/spaces/${spaceId}/settings${extra}`
    const textChannels = space?.channels || []
    const voiceChannels = space?.voiceRooms || []

    return (
        <>
        <button
            type="button"
            className={`space-sidebar-backdrop${mobileOpen ? ' is-open' : ''}`}
            aria-label={t('spacenav.close')}
            tabIndex={-1}
            onClick={() => setMobileOpen(false)}
        />
        <aside className={`space-sidebar${mobileOpen ? ' is-mobile-open' : ''}`}>
            <div className="space-sidebar__heading">
                <Link to={`/app/spaces/${spaceId}`} className="space-sidebar__heading-link">
                    {space?.avatarUrl || space?.avatar_url
                        ? <Avatar src={space.avatarUrl || space.avatar_url} label={space?.name || spaceName} size={34} />
                        : <span className="space-sidebar__heading-avatar">{(space?.name || spaceName || 'N').slice(0, 1).toUpperCase()}</span>}
                    <span>{space?.name || spaceName || 'Пространство'}</span>
                </Link>
                {canManage && (
                    <Link to={settingsLink()} className="space-sidebar__gear" title={t('ss.title')} aria-label={t('ss.title')}><Icon name="settings" /></Link>
                )}
            </div>

            <div className="space-sidebar__scroll">
                <div className="space-sidebar__category">
                    <span>ТЕКСТОВЫЕ КАНАЛЫ</span>
                    {canCreate && <button type="button" onClick={() => { setCreateType(createType === 'text' ? '' : 'text'); setError('') }} aria-label="Создать текстовый канал">＋</button>}
                </div>
                {textChannels.map((channel) => (
                    <div key={channel.id} className="space-sidebar__row">
                        <Link to={`/app/channels/${channel.id}`} className={`space-sidebar__channel ${String(activeChannelId) === String(channel.id) ? 'space-sidebar__channel--active' : ''}`}>
                            <span className="space-sidebar__hash">#</span>
                            <span className="space-sidebar__channel-name">{channel.name}</span>
                            {channel.restricted && <Icon name="lock" className="space-sidebar__lock" title={t('ss.channels.restrictedBadge')} />}
                        </Link>
                        {canCreate && (
                            <Link to={settingsLink(`?tab=channels&channel=${channel.id}`)} className="space-sidebar__item-gear" title={t('ss.channels.settings')} aria-label={t('ss.channels.settings')}><Icon name="settings" /></Link>
                        )}
                    </div>
                ))}

                <div className="space-sidebar__category space-sidebar__category--voice">
                    <span>ГОЛОСОВЫЕ КАНАЛЫ</span>
                    {canCreate && <button type="button" onClick={() => { setCreateType(createType === 'voice' ? '' : 'voice'); setError('') }} aria-label="Создать голосовой канал">＋</button>}
                </div>
                {voiceChannels.map((room) => {
                    const people = roomsLive[room.id] || room.participants || []
                    const connected = active?.roomId === room.id

                    return (
                        <div key={room.id} className="space-sidebar__voice">
                            <button
                                type="button"
                                className={`space-sidebar__channel${connected ? ' space-sidebar__channel--active' : ''}`}
                                onClick={async () => {
                                    if (!connected) await join(room.id, { name: room.name })
                                    navigate(`/app/voice/${room.id}`)
                                }}
                            >
                                <Icon name="volume-2" className="space-sidebar__voice-icon" />
                                <span className="space-sidebar__channel-name">{room.name}</span>
                                {room.restricted && <Icon name="lock" className="space-sidebar__lock" title={t('ss.channels.restrictedBadge')} />}
                            </button>

                            {people.length > 0 && (
                                <ul className="space-sidebar__voice-users">
                                    {people.map((person) => (
                                        <li
                                            key={person.id}
                                            className={speaking[String(person.id)] ? 'is-speaking' : ''}
                                        >
                                            <Avatar
                                                src={person.avatarUrl || person.avatar}
                                                label={person.displayName || person.name}
                                                size={22}
                                            />
                                            <span>{person.displayName || person.name}</span>
                                            {person.sharing && <Icon name="monitor" className="space-sidebar__voice-flag" />}
                                            {person.muted && <Icon name="mic-off" className="space-sidebar__voice-flag" />}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )
                })}

                {createType && (
                    <form className="space-sidebar__create" onSubmit={createChannel}>
                        <label>{createType === 'text' ? 'Новый текстовый канал' : 'Новый голосовой канал'}</label>
                        <input value={channelName} onChange={(event) => setChannelName(event.target.value)} placeholder="Название канала" maxLength={80} autoFocus required />
                        {error && <p>{error}</p>}
                        <div>
                            <button type="button" onClick={() => { setCreateType(''); setChannelName(''); setError('') }}>Отмена</button>
                            <button type="submit" disabled={creating || !channelName.trim()}>{creating ? 'Создание…' : 'Создать'}</button>
                        </div>
                    </form>
                )}

                {!textChannels.length && !voiceChannels.length && !createType && (
                    <p className="space-sidebar__empty">Здесь пока нет каналов</p>
                )}
            </div>


        </aside>
        </>
    )
}
