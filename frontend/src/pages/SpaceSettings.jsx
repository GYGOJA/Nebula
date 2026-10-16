import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import VisibilityPicker from '@/components/VisibilityPicker'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import SpaceChannelSidebar from '@/components/SpaceChannelSidebar'
import MenuButton from '@/components/MenuButton'
import SpaceNavButton from '@/components/SpaceNavButton'
import Avatar from '@/components/Avatar'
import Icon from '@/assets/icon/Icon.jsx'
import ConfirmDialog from '@/components/ConfirmDialog'
import InviteDialog from '@/components/InviteDialog'
import { api } from '@/api'
import { useI18n } from '@/i18n'
import { useAppEvent, emitAppEvent } from '@/hooks/useAppEvent'

// Must match the permission bits in internal/httpapi/roles.go.
const PERMISSIONS = [
    { key: 'administrator', bit: 1 },
    { key: 'manageSpace', bit: 2 },
    { key: 'manageChannels', bit: 4 },
    { key: 'manageRoles', bit: 8 },
    { key: 'invite', bit: 16 },
    { key: 'send', bit: 32 },
]

const ROLE_COLORS = ['#ffb020', '#e5734a', '#d94b8a', '#9b6ee0', '#4f8cf0', '#34b7a7', '#6fbf4b', '#95908c']

const hasBit = (mask, bit) => (Number(mask) & bit) !== 0

function Check({ checked, onChange, disabled, children }) {
    return (
        <label className={`ss-check${disabled ? ' is-disabled' : ''}`}>
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => onChange(event.target.checked)}
            />
            <span>{children}</span>
        </label>
    )
}

function Feedback({ error, notice }) {
    if (error) return <p className="auth-inline-error ss-feedback">{error}</p>
    if (notice) return <p className="ss-feedback ss-feedback--ok">{notice}</p>
    return null
}

function useFlash() {
    const [notice, setNotice] = useState('')
    const timer = useRef(null)

    useEffect(() => () => clearTimeout(timer.current), [])

    const flash = useCallback((text) => {
        setNotice(text)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setNotice(''), 2500)
    }, [])

    return [notice, flash]
}

function OverviewTab({ spaceId, data, reload }) {
    const { t } = useI18n()
    const navigate = useNavigate()
    const space = data.space
    const can = data.can
    const [name, setName] = useState(space.name || '')
    const [description, setDescription] = useState(space.description || '')
    const [isPublic, setIsPublic] = useState(Boolean(space.isPublic))
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [notice, flash] = useFlash()
    const [inviteOpen, setInviteOpen] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const fileRef = useRef(null)

    const changed = name.trim() !== (space.name || '') || description.trim() !== (space.description || '') || isPublic !== Boolean(space.isPublic)

    const run = async (action, okText) => {
        setBusy(true)
        setError('')

        try {
            await action()
            if (okText) flash(okText)
            emitAppEvent('space_updated', { spaceId })
            await reload(true)
        } catch (err) {
            setError(err?.message || t('ss.actionFailed'))
        } finally {
            setBusy(false)
        }
    }

    const save = (event) => {
        event.preventDefault()
        run(() => api.updateSpace(spaceId, { name: name.trim(), description: description.trim(), isPublic }), t('ss.saved'))
    }

    const upload = (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        if (!['image/png', 'image/jpeg'].includes(file.type)) {
            setError('Допустимые форматы аватара: JPG и PNG')
            return
        }
        if (file.size > 5 * 1024 * 1024) {
            setError('Размер аватара не должен превышать 5 МБ')
            return
        }
        run(() => api.uploadSpaceAvatar(spaceId, file), t('ss.avatarUpdated'))
    }

    const removeAvatar = () => run(() => api.deleteSpaceAvatar(spaceId), t('ss.avatarRemoved'))

    const remove = async () => {
        setConfirmDelete(false)
        setBusy(true)

        try {
            await api.deleteSpace(spaceId)
            emitAppEvent('space_deleted', { spaceId })
            navigate('/app', { replace: true })
        } catch (err) {
            setError(err?.message || t('ss.actionFailed'))
            setBusy(false)
        }
    }

    return (
        <div className="ss-panel">
            <h2 className="ss-title">{t('ss.tab.overview')}</h2>

            <div className="ss-avatar-row">
                <Avatar src={space.avatarUrl} label={space.name} size={96} />

                <div className="ss-avatar-actions">
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={upload} />

                    <button
                        type="button"
                        className="btn btn--primary"
                        disabled={busy || !can.manageSpace}
                        onClick={() => fileRef.current?.click()}
                    >
                        {t('ss.avatarUpload')}
                    </button>

                    {space.avatarUrl && (
                        <button type="button" className="btn btn--ghost" disabled={busy || !can.manageSpace} onClick={removeAvatar}>
                            {t('ss.avatarRemove')}
                        </button>
                    )}

                    <span className="muted ss-hint">{t('ss.avatarHint')}</span>
                </div>
            </div>

            <form className="settings-form" onSubmit={save}>
                <div className="settings-form__field">
                    <label htmlFor="ss-name">{t('spaces.name')}</label>
                    <input
                        id="ss-name"
                        className="input"
                        value={name}
                        maxLength={80}
                        disabled={busy || !can.manageSpace}
                        onChange={(event) => setName(event.target.value)}
                    />
                </div>

                <div className="settings-form__field">
                    <label htmlFor="ss-description">{t('spaces.description')}</label>
                    <textarea
                        id="ss-description"
                        className="input"
                        rows={4}
                        value={description}
                        maxLength={500}
                        disabled={busy || !can.manageSpace}
                        onChange={(event) => setDescription(event.target.value)}
                    />
                </div>

                <div className="settings-form__field">
                    <label>{t('spaces.visibility')}</label>
                    <VisibilityPicker value={isPublic} onChange={setIsPublic} disabled={busy || !can.manageSpace} />
                </div>

                <Feedback error={error} notice={notice} />

                <div className="ss-actions">
                    <button
                        type="submit"
                        className="btn btn--primary"
                        disabled={busy || !can.manageSpace || !changed || !name.trim()}
                    >
                        {busy ? t('common.saving') : t('ss.save')}
                    </button>

                    {can.invite && (
                        <button type="button" className="btn btn--ghost" onClick={() => setInviteOpen(true)}>
                            {t('common.invite')}
                        </button>
                    )}
                </div>
            </form>

            {data.isOwner && (
                <div className="ss-danger">
                    <h3>{t('ss.danger.title')}</h3>
                    <p className="muted">{t('ss.danger.desc')}</p>
                    <button type="button" className="btn btn--danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
                        {t('ss.danger.delete')}
                    </button>
                </div>
            )}

            <InviteDialog open={inviteOpen} spaceId={spaceId} onClose={() => setInviteOpen(false)} />

            <ConfirmDialog
                open={confirmDelete}
                danger
                title={t('ss.danger.confirmTitle', { name: space.name })}
                description={t('ss.danger.confirmDesc')}
                confirmLabel={t('ss.danger.delete')}
                onConfirm={remove}
                onCancel={() => setConfirmDelete(false)}
            />
        </div>
    )
}

function RoleEditor({ spaceId, role, data, reload, onDeleted }) {
    const { t } = useI18n()
    const [name, setName] = useState(role.name)
    const [color, setColor] = useState(role.color)
    const [perms, setPerms] = useState(role.permissions)
    const [busy, setBusy] = useState(false)
    const [busyMember, setBusyMember] = useState('')
    const [error, setError] = useState('')
    const [notice, flash] = useFlash()
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [filter, setFilter] = useState('')

    const locked = !role.manageable
    const grantable = (bit) => !locked && (data.can.administrator || hasBit(data.permissions, bit))
    const dirty = name.trim() !== role.name || color !== role.color || perms !== role.permissions

    const members = useMemo(() => {
        const needle = filter.trim().toLowerCase()
        return data.members.filter((member) =>
            !needle || `${member.displayName} ${member.username}`.toLowerCase().includes(needle)
        )
    }, [data.members, filter])

    const save = async () => {
        setBusy(true)
        setError('')

        try {
            await api.updateRole(spaceId, role.id, {
                name: name.trim(),
                ...(role.isDefault ? {} : { color }),
                permissions: perms,
            })
            flash(t('ss.saved'))
            emitAppEvent('space_updated', { spaceId })
            await reload(true)
        } catch (err) {
            setError(err?.message || t('ss.actionFailed'))
        } finally {
            setBusy(false)
        }
    }

    const remove = async () => {
        setConfirmDelete(false)
        setBusy(true)
        setError('')

        try {
            await api.deleteRole(spaceId, role.id)
            emitAppEvent('space_updated', { spaceId })
            await reload(true)
            onDeleted()
        } catch (err) {
            setError(err?.message || t('ss.actionFailed'))
            setBusy(false)
        }
    }

    const toggleMember = async (member, on) => {
        const current = member.roleIds || []
        const next = on ? [...current, role.id] : current.filter((id) => id !== role.id)

        setBusyMember(member.id)
        setError('')

        try {
            await api.setMemberRoles(spaceId, member.id, next)
            emitAppEvent('space_updated', { spaceId })
            await reload(true)
        } catch (err) {
            setError(err?.message || t('ss.actionFailed'))
        } finally {
            setBusyMember('')
        }
    }

    return (
        <div className="ss-role-editor">
            <div className="settings-form__field">
                <label htmlFor="ss-role-name">{t('ss.roles.name')}</label>
                <input
                    id="ss-role-name"
                    className="input"
                    value={role.isDefault ? t('ss.everyone') : name}
                    maxLength={40}
                    disabled={busy || role.isDefault || locked}
                    onChange={(event) => setName(event.target.value)}
                />
            </div>

            {!role.isDefault && (
                <div className="settings-form__field">
                    <label>{t('ss.roles.color')}</label>
                    <div className="ss-colors">
                        {ROLE_COLORS.map((value) => (
                            <button
                                key={value}
                                type="button"
                                className={`ss-color${color === value ? ' is-active' : ''}`}
                                style={{ background: value }}
                                aria-label={value}
                                disabled={locked}
                                onClick={() => setColor(value)}
                            />
                        ))}
                        <input
                            type="color"
                            className="ss-color-input"
                            value={color}
                            disabled={locked}
                            onChange={(event) => setColor(event.target.value)}
                            aria-label={t('ss.roles.color')}
                        />
                    </div>
                </div>
            )}

            <div className="settings-form__field">
                <label>{t('ss.roles.permissions')}</label>
                <div className="ss-perms">
                    {PERMISSIONS.map(({ key, bit }) => (
                        <Check
                            key={key}
                            checked={hasBit(perms, bit)}
                            disabled={busy || !grantable(bit)}
                            onChange={(on) => setPerms(on ? perms | bit : perms & ~bit)}
                        >
                            <strong>{t(`ss.perm.${key}`)}</strong>
                            <small>{t(`ss.perm.${key}.desc`)}</small>
                        </Check>
                    ))}
                </div>
            </div>

            {locked && <p className="muted ss-hint">{t('ss.roles.locked')}</p>}

            <Feedback error={error} notice={notice} />

            <div className="ss-actions">
                <button type="button" className="btn btn--primary" disabled={busy || locked || !dirty || (!role.isDefault && !name.trim())} onClick={save}>
                    {busy ? t('common.saving') : t('ss.save')}
                </button>

                {!role.isDefault && (
                    <button type="button" className="btn btn--danger" disabled={busy || locked} onClick={() => setConfirmDelete(true)}>
                        {t('ss.roles.delete')}
                    </button>
                )}
            </div>

            <div className="ss-members">
                <h3>{t('ss.roles.members')}</h3>

                {role.isDefault ? (
                    <p className="muted">{t('ss.roles.everyoneNote')}</p>
                ) : (
                    <>
                        <input
                            className="input"
                            type="search"
                            placeholder={t('ss.roles.searchMembers')}
                            value={filter}
                            onChange={(event) => setFilter(event.target.value)}
                        />

                        <ul className="ss-member-list">
                            {members.map((member) => (
                                <li key={member.id}>
                                    <Check
                                        checked={(member.roleIds || []).includes(role.id)}
                                        disabled={busyMember === member.id || locked || !member.editable}
                                        onChange={(on) => toggleMember(member, on)}
                                    >
                                        <span className="ss-member">
                                            <Avatar src={member.avatarUrl} label={member.displayName} size={26} />
                                            <strong>{member.displayName || member.username}</strong>
                                            <small>@{member.username}</small>
                                        </span>
                                    </Check>
                                </li>
                            ))}

                            {members.length === 0 && <li className="muted">{t('ss.roles.noMembers')}</li>}
                        </ul>
                    </>
                )}
            </div>

            <ConfirmDialog
                open={confirmDelete}
                danger
                title={t('ss.roles.confirmTitle', { name: role.name })}
                description={t('ss.roles.confirmDesc')}
                confirmLabel={t('ss.roles.delete')}
                onConfirm={remove}
                onCancel={() => setConfirmDelete(false)}
            />
        </div>
    )
}

function RolesTab({ spaceId, data, reload }) {
    const { t } = useI18n()
    const [selectedId, setSelectedId] = useState(null)
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState('')

    const roles = data.roles
    const selected = roles.find((role) => role.id === selectedId) || roles.find((role) => !role.isDefault) || roles[0]

    const create = async () => {
        setCreating(true)
        setError('')

        try {
            const role = await api.createRole(spaceId, { name: t('ss.roles.newName'), color: ROLE_COLORS[0], permissions: 0 })
            await reload(true)
            setSelectedId(role.id)
            emitAppEvent('space_updated', { spaceId })
        } catch (err) {
            setError(err?.message || t('ss.actionFailed'))
        } finally {
            setCreating(false)
        }
    }

    return (
        <div className="ss-panel">
            <h2 className="ss-title">{t('ss.tab.roles')}</h2>
            <p className="muted ss-lead">{t('ss.roles.lead')}</p>

            <div className="ss-split">
                <div className="ss-list">
                    {roles.map((role) => (
                        <button
                            key={role.id}
                            type="button"
                            className={`ss-list__item${selected?.id === role.id ? ' is-active' : ''}`}
                            onClick={() => setSelectedId(role.id)}
                        >
                            <i className="ss-dot" style={{ background: role.isDefault ? '#6f6f6f' : role.color }} />
                            <span>{role.isDefault ? t('ss.everyone') : role.name}</span>
                            <small>{role.members}</small>
                        </button>
                    ))}

                    <button type="button" className="ss-list__add" disabled={creating} onClick={create}>
                        ＋ {t('ss.roles.create')}
                    </button>

                    {error && <p className="auth-inline-error">{error}</p>}
                </div>

                {selected && (
                    <RoleEditor
                        key={selected.id}
                        spaceId={spaceId}
                        role={selected}
                        data={data}
                        reload={reload}
                        onDeleted={() => setSelectedId(null)}
                    />
                )}
            </div>
        </div>
    )
}

function SectionEditor({ spaceId, section, roles, reload, defaultOpen }) {
    const { t } = useI18n()
    const isVoice = section.type === 'voice'
    const [open, setOpen] = useState(defaultOpen)
    const [name, setName] = useState(section.name)
    const [restricted, setRestricted] = useState(section.restricted)
    const [access, setAccess] = useState(() => {
        const map = {}
        for (const entry of section.access || []) map[entry.roleId] = { canView: entry.canView, canWrite: entry.canWrite }
        return map
    })
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [notice, flash] = useFlash()
    const [confirmDelete, setConfirmDelete] = useState(false)

    const anyViewer = Object.values(access).some((entry) => entry.canView)

    const setEntry = (roleId, patch) =>
        setAccess((previous) => {
            const current = previous[roleId] || { canView: false, canWrite: false }
            const next = { ...current, ...patch }

            if (!next.canView) next.canWrite = false
            if (next.canWrite) next.canView = true

            return { ...previous, [roleId]: next }
        })

    const save = async () => {
        if (!name.trim()) return

        setBusy(true)
        setError('')

        try {
            await api.updateSection(spaceId, section.id, {
                name: name.trim(),
                restricted,
                access: Object.entries(access)
                    .filter(([, entry]) => entry.canView)
                    .map(([roleId, entry]) => ({ roleId, canView: true, canWrite: Boolean(entry.canWrite) })),
            })
            flash(t('ss.saved'))
            emitAppEvent('space_updated', { spaceId })
            await reload(true)
        } catch (err) {
            setError(err?.message || t('ss.actionFailed'))
        } finally {
            setBusy(false)
        }
    }

    const remove = async () => {
        setConfirmDelete(false)
        setBusy(true)
        setError('')

        try {
            await api.deleteSection(spaceId, section.id)
            emitAppEvent('space_updated', { spaceId })
            await reload(true)
        } catch (err) {
            setError(err?.message || t('ss.actionFailed'))
            setBusy(false)
        }
    }

    return (
        <div className={`ss-section${open ? ' is-open' : ''}`}>
            <button type="button" className="ss-section__head" onClick={() => setOpen(!open)}>
                <span className="ss-section__icon"><Icon name={isVoice ? 'volume-2' : 'hash'} /></span>
                <strong>{section.name}</strong>
                {section.restricted && (
                    <span className="ss-badge">
                        <Icon name="lock" />
                        {t('ss.channels.restrictedBadge')}
                    </span>
                )}
                <span className="ss-section__chevron"><Icon name={open ? 'chevron-up' : 'chevron-down'} /></span>
            </button>

            {open && (
                <div className="ss-section__body">
                    <div className="settings-form__field">
                        <label>{t('ss.channels.name')}</label>
                        <input className="input" value={name} maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)} />
                    </div>

                    <Check checked={restricted} disabled={busy} onChange={setRestricted}>
                        <strong>{t('ss.channels.restricted')}</strong>
                        <small>{t('ss.channels.restrictedDesc')}</small>
                    </Check>

                    {restricted && (
                        <div className="ss-access">
                            <div className="ss-access__row ss-access__row--head">
                                <span>{t('ss.channels.role')}</span>
                                <span>{t('ss.channels.view')}</span>
                                <span>{isVoice ? t('ss.channels.connect') : t('ss.channels.write')}</span>
                            </div>

                            {roles.map((role) => {
                                const entry = access[role.id] || { canView: false, canWrite: false }

                                return (
                                    <div key={role.id} className="ss-access__row">
                                        <span className="ss-access__role">
                                            <i className="ss-dot" style={{ background: role.isDefault ? '#6f6f6f' : role.color }} />
                                            {role.isDefault ? t('ss.everyone') : role.name}
                                        </span>
                                        <input
                                            type="checkbox"
                                            checked={entry.canView}
                                            disabled={busy}
                                            aria-label={t('ss.channels.view')}
                                            onChange={(event) => setEntry(role.id, { canView: event.target.checked })}
                                        />
                                        <input
                                            type="checkbox"
                                            checked={entry.canWrite}
                                            disabled={busy}
                                            aria-label={isVoice ? t('ss.channels.connect') : t('ss.channels.write')}
                                            onChange={(event) => setEntry(role.id, { canWrite: event.target.checked })}
                                        />
                                    </div>
                                )
                            })}

                            <p className="muted ss-hint">
                                {anyViewer ? t('ss.channels.adminsAlways') : t('ss.channels.nobody')}
                            </p>
                        </div>
                    )}

                    <Feedback error={error} notice={notice} />

                    <div className="ss-actions">
                        <button type="button" className="btn btn--primary" disabled={busy || !name.trim()} onClick={save}>
                            {busy ? t('common.saving') : t('ss.save')}
                        </button>
                        <button type="button" className="btn btn--danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
                            {t('ss.channels.delete')}
                        </button>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={confirmDelete}
                danger
                title={t('ss.channels.confirmTitle', { name: section.name })}
                description={t('ss.channels.confirmDesc')}
                confirmLabel={t('ss.channels.delete')}
                onConfirm={remove}
                onCancel={() => setConfirmDelete(false)}
            />
        </div>
    )
}

function ChannelsTab({ spaceId, data, reload, focusId }) {
    const { t } = useI18n()
    const text = data.sections.filter((section) => section.type !== 'voice')
    const voice = data.sections.filter((section) => section.type === 'voice')

    const group = (title, list) => (
        <div className="ss-group">
            <h3>{title}</h3>

            {list.length === 0 && <p className="muted">{t('ss.channels.none')}</p>}

            {list.map((section) => (
                <SectionEditor
                    key={section.id}
                    spaceId={spaceId}
                    section={section}
                    roles={data.roles}
                    reload={reload}
                    defaultOpen={section.id === focusId}
                />
            ))}
        </div>
    )

    return (
        <div className="ss-panel">
            <h2 className="ss-title">{t('ss.tab.channels')}</h2>
            <p className="muted ss-lead">{t('ss.channels.lead')}</p>

            {group(t('ss.channels.text'), text)}
            {group(t('ss.channels.voice'), voice)}
        </div>
    )
}

export default function SpaceSettings() {
    const { t } = useI18n()
    const { spaceId } = useParams()
    const [params, setParams] = useSearchParams()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true)
        setError('')

        try {
            setData(await api.getSpaceSettings(spaceId))
        } catch (err) {
            if (!silent) setData(null)
            setError(err?.message || t('ss.loadFailed'))
        } finally {
            setLoading(false)
        }
    }, [spaceId])

    useEffect(() => {
        load()
    }, [load])

    useAppEvent(['space_updated'], () => load(true))

    const tabs = useMemo(() => {
        if (!data) return []

        return [
            data.can.manageSpace && 'overview',
            data.can.manageRoles && 'roles',
            data.can.manageChannels && 'channels',
        ].filter(Boolean)
    }, [data])

    const requested = params.get('tab')
    const tab = tabs.includes(requested) ? requested : tabs[0]

    return (
        <div className="app-layout app-layout--space app-layout--settings">
            <SpaceChannelSidebar spaceId={spaceId} spaceName={data?.space?.name} />

            <main className="space-settings">
                <header className="space-settings__header">
                    <div className="space-settings__toprow">
                        <MenuButton />
                        <Link to={`/app/spaces/${spaceId}`} className="space-settings__back">
                            ← {data?.space?.name || t('ss.back')}
                        </Link>
                        <SpaceNavButton />
                    </div>
                    <h1>{t('ss.title')}</h1>

                    {tabs.length > 0 && (
                        <nav className="space-settings__tabs">
                            {tabs.map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    className={tab === key ? 'is-active' : ''}
                                    onClick={() => setParams({ tab: key }, { replace: true })}
                                >
                                    {t(`ss.tab.${key}`)}
                                </button>
                            ))}
                        </nav>
                    )}
                </header>

                <div className="space-settings__body">
                    {loading && <p className="muted">{t('common.loading')}</p>}

                    {!loading && error && !data && (
                        <>
                            <p className="auth-inline-error">{error}</p>
                            <button type="button" className="btn btn--ghost" onClick={() => load()}>
                                {t('common.retry')}
                            </button>
                        </>
                    )}

                    {!loading && data && tabs.length === 0 && <p className="muted">{t('ss.noAccess')}</p>}

                    {!loading && data && tab === 'overview' && <OverviewTab spaceId={spaceId} data={data} reload={load} />}
                    {!loading && data && tab === 'roles' && <RolesTab spaceId={spaceId} data={data} reload={load} />}
                    {!loading && data && tab === 'channels' && (
                        <ChannelsTab spaceId={spaceId} data={data} reload={load} focusId={params.get('channel')} />
                    )}
                </div>
            </main>
        </div>
    )
}
