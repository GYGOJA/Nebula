import { useCallback, useEffect, useRef, useState } from 'react'
import NavigationRail from '@/components/NavigationRail'
import Sidebar from '@/components/Sidebar'
import RightSidebar from '@/components/RightSidebar'
import PageHeader from '@/components/PageHeader'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/i18n'

const EMPTY_FORM = {
    displayName: '',
    username: '',
    bio: '',
    birthDate: '',
    avatarUrl: '',
    statusText: '',
    pronouns: '',
    website: '',
    location: '',
}

const toDisplayDate = (value) => {
    if (!value) return ''

    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)

    if (match) {
        return `${match[3]}.${match[2]}.${match[1]}`
    }

    return String(value)
}

const toApiDate = (value) => {
    const normalized = String(value || '').trim()

    if (!normalized) return null

    const match = normalized.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)

    if (!match) return null

    const [, dayText, monthText, yearText] = match
    const day = Number(dayText)
    const month = Number(monthText)
    const year = Number(yearText)
    const date = new Date(Date.UTC(year, month - 1, day))

    if (
        year < 1900 ||
        year > new Date().getFullYear() ||
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null
    }

    return `${yearText}-${monthText}-${dayText}`
}

const formatDateInput = (value) => {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 8)

    if (digits.length <= 2) return digits
    if (digits.length <= 4) {
        return `${digits.slice(0, 2)}.${digits.slice(2)}`
    }

    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`
}

const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const AVATAR_MAX_BYTES = 5 * 1024 * 1024
const AVATAR_SIZE = 256

// Обрезка до квадрата по центру и уменьшение до 256×256 прямо в браузере.
// Заодно WebP превращается в PNG, который понимает сервер.
async function cropAvatar(file) {
    const url = URL.createObjectURL(file)

    try {
        const img = await new Promise((resolve, reject) => {
            const image = new Image()
            image.onload = () => resolve(image)
            image.onerror = () => reject(new Error('unreadable'))
            image.src = url
        })

        const side = Math.min(img.naturalWidth, img.naturalHeight)
        if (!side) throw new Error('unreadable')

        const size = Math.min(side, AVATAR_SIZE)
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size

        canvas.getContext('2d').drawImage(
            img,
            (img.naturalWidth - side) / 2,
            (img.naturalHeight - side) / 2,
            side,
            side,
            0,
            0,
            size,
            size
        )

        return await new Promise((resolve, reject) =>
            canvas.toBlob(
                (blob) => (blob ? resolve(blob) : reject(new Error('unreadable'))),
                'image/png'
            )
        )
    } finally {
        URL.revokeObjectURL(url)
    }
}

export default function Profile() {
    const { updateUser } = useAuth()
    const { t } = useI18n()
    const fileInputRef = useRef(null)
    const [pendingAvatar, setPendingAvatar] = useState(null)
    const [avatarBusy, setAvatarBusy] = useState(false)
    const [profile, setProfile] = useState(null)
    const [form, setForm] = useState(EMPTY_FORM)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        setError('')
        setNotice('')

        try {
            const result = await api.getMe()

            setProfile(result)
            setForm({
                displayName: result?.displayName || result?.name || '',
                username: result?.username || '',
                bio: result?.bio || '',
                birthDate: toDisplayDate(result?.birthDate || ''),
                avatarUrl:
                    result?.avatarUrl ||
                    (
                        typeof result?.avatar === 'string' &&
                        /^https?:\/\//i.test(result.avatar)
                            ? result.avatar
                            : ''
                    ),
                statusText: result?.statusText || '',
                pronouns: result?.pronouns || '',
                website: result?.website || '',
                location: result?.location || '',
            })
        } catch (err) {
            setError(err?.message || 'Не удалось загрузить профиль')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    useEffect(
        () => () => {
            if (pendingAvatar?.previewUrl) {
                URL.revokeObjectURL(pendingAvatar.previewUrl)
            }
        },
        [pendingAvatar]
    )

    const applyProfile = (updated) => {
        setProfile((previous) => ({ ...previous, ...updated }))
        setForm((previous) => ({
            ...previous,
            avatarUrl: updated?.avatarUrl || '',
        }))
        updateUser({ avatar_url: updated?.avatarUrl || null })
    }

    const pickAvatar = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''

        if (!file) return

        setError('')
        setNotice('')

        if (!AVATAR_TYPES.includes(file.type)) {
            setError(t('profile.avatar.badType'))
            return
        }

        if (file.size > AVATAR_MAX_BYTES) {
            setError(t('profile.avatar.tooBig'))
            return
        }

        try {
            const blob = await cropAvatar(file)

            setPendingAvatar({ blob, previewUrl: URL.createObjectURL(blob) })
        } catch {
            setError(t('profile.avatar.unreadable'))
        }
    }

    const confirmAvatar = async () => {
        if (!pendingAvatar) return

        setAvatarBusy(true)
        setError('')
        setNotice('')

        try {
            applyProfile(await api.uploadAvatar(pendingAvatar.blob))
            setPendingAvatar(null)
            setNotice(t('profile.avatar.saved'))
        } catch (err) {
            setError(err?.message || t('profile.avatar.failed'))
        } finally {
            setAvatarBusy(false)
        }
    }

    const deleteAvatar = async () => {
        setAvatarBusy(true)
        setError('')
        setNotice('')

        try {
            applyProfile(await api.removeAvatar())
            setNotice(t('profile.avatar.removed'))
        } catch (err) {
            setError(err?.message || t('profile.avatar.failed'))
        } finally {
            setAvatarBusy(false)
        }
    }

    const update = (field) => (event) => {
        setForm((previous) => ({
            ...previous,
            [field]: event.target.value,
        }))
    }

    const save = async (event) => {
        event.preventDefault()

        const birthDate = toApiDate(form.birthDate)
        const username = form.username.trim().replace(/^@/, '')

        if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
            setError('Username: 3–16 символов, латиница, цифры и «_»')
            setNotice('')
            return
        }

        if (!form.displayName.trim()) {
            setError('Укажите отображаемое имя')
            setNotice('')
            return
        }

        if (form.birthDate.trim() && !birthDate) {
            setError(
                'Введите дату рождения в формате ДД.ММ.ГГГГ, например 05.09.2000'
            )
            setNotice('')
            return
        }

        setSaving(true)
        setError('')
        setNotice('')

        try {
            const updated = await api.updateProfile({
                displayName: form.displayName.trim(),
                name: form.displayName.trim(),
                username,
                bio: form.bio.trim(),
                birthDate,
                avatarUrl: form.avatarUrl.trim(),
                statusText: form.statusText.trim(),
                pronouns: form.pronouns.trim(),
                website: form.website.trim(),
                location: form.location.trim(),
            })

            setProfile((previous) => ({
                ...previous,
                ...updated,
            }))
            setForm((previous) => ({
                ...previous,
                username: updated?.username ?? previous.username,
                displayName: updated?.displayName ?? previous.displayName,
            }))
            updateUser({
                username: updated?.username,
                display_name: updated?.displayName,
                avatar_url: updated?.avatarUrl || null,
                bio: updated?.bio || null,
            })
            setNotice('Изменения сохранены')
        } catch (err) {
            setError(err?.message || 'Не удалось сохранить изменения')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="app-layout">
            <NavigationRail />
            <Sidebar />

            <main className="main">
                <div className="main__content profile-page">
                    <PageHeader
                        title="Профиль"
                        subtitle="Настройте, как вас видят другие участники Nebula."
                    />

                    {loading && (
                        <p className="muted profile-loading" role="status">
                            Загрузка…
                        </p>
                    )}

                    {error && (
                        <p className="auth-inline-error" role="alert">
                            {error}
                        </p>
                    )}

                    {!loading && !profile && error && (
                        <div className="profile-retry">
                            <button
                                type="button"
                                className="btn btn--ghost"
                                onClick={load}
                            >
                                Повторить
                            </button>
                        </div>
                    )}

                    {!loading && profile && (
                        <>
                            <section className="profile-card profile-card--minimal">
                                <Avatar
                                    src={
                                        pendingAvatar?.previewUrl ||
                                        form.avatarUrl ||
                                        profile.avatarUrl ||
                                        profile.avatar
                                    }
                                    label={form.displayName || profile.name}
                                    size={96}
                                />

                                <div className="profile-card__identity">
                                    <h2>
                                        {form.displayName ||
                                            profile.name ||
                                            'Ваш профиль'}
                                    </h2>

                                    <p>
                                        {form.username
                                            ? `@${form.username.replace(/^@/, '')}`
                                            : 'Добавьте username'}
                                    </p>

                                    {profile.email && <p>{profile.email}</p>}

                                    {form.statusText && (
                                        <p className="profile-status">
                                            {form.statusText}
                                        </p>
                                    )}
                                </div>

                                <div className="profile-avatar-actions">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept={AVATAR_TYPES.join(',')}
                                        hidden
                                        onChange={pickAvatar}
                                    />

                                    {pendingAvatar ? (
                                        <>
                                            <button
                                                type="button"
                                                className="btn btn--primary"
                                                onClick={confirmAvatar}
                                                disabled={avatarBusy}
                                            >
                                                {avatarBusy
                                                    ? t('profile.avatar.saving')
                                                    : t('profile.avatar.save')}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn--ghost"
                                                onClick={() => setPendingAvatar(null)}
                                                disabled={avatarBusy}
                                            >
                                                {t('profile.avatar.cancel')}
                                            </button>
                                            <small>{t('profile.avatar.preview')}</small>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                className="btn btn--ghost"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={avatarBusy}
                                            >
                                                {t('profile.avatar.change')}
                                            </button>
                                            {(form.avatarUrl || profile.avatarUrl) && (
                                                <button
                                                    type="button"
                                                    className="btn btn--ghost"
                                                    onClick={deleteAvatar}
                                                    disabled={avatarBusy}
                                                >
                                                    {t('profile.avatar.remove')}
                                                </button>
                                            )}
                                            <small>{t('profile.avatar.hint')}</small>
                                        </>
                                    )}
                                </div>
                            </section>

                            <form
                                className="profile-form profile-form--minimal"
                                onSubmit={save}
                            >
                                <section className="profile-edit-section">
                                    <h2>Основное</h2>

                                    <div className="profile-form__field">
                                        <label htmlFor="profile-display-name">
                                            Отображаемое имя
                                        </label>
                                        <input
                                            id="profile-display-name"
                                            className="input"
                                            value={form.displayName}
                                            onChange={update('displayName')}
                                            maxLength={64}
                                            placeholder="Как к вам обращаться"
                                        />
                                    </div>

                                    <div className="profile-form__field">
                                        <label htmlFor="profile-username">
                                            Username
                                        </label>

                                        <div className="profile-input-prefix">
                                            <span>@</span>
                                            <input
                                                id="profile-username"
                                                className="input"
                                                value={form.username}
                                                onChange={update('username')}
                                                maxLength={16}
                                                placeholder="username"
                                            />
                                        </div>

                                        <small>
                                            Уникальное имя для поиска и ссылок
                                            на профиль.
                                        </small>
                                    </div>

                                    <div className="profile-form__field">
                                        <label htmlFor="profile-bio">
                                            О себе
                                        </label>
                                        <textarea
                                            id="profile-bio"
                                            className="input"
                                            value={form.bio}
                                            onChange={update('bio')}
                                            maxLength={255}
                                            rows={3}
                                            placeholder="Пара слов о себе"
                                        />
                                        <small>{form.bio.length}/255</small>
                                    </div>

                                    <div className="profile-form__field">
                                        <label htmlFor="profile-status">
                                            Статус
                                        </label>
                                        <input
                                            id="profile-status"
                                            className="input"
                                            value={form.statusText}
                                            onChange={update('statusText')}
                                            maxLength={80}
                                            placeholder="Чем занимаетесь сейчас"
                                        />
                                    </div>
                                </section>

                                <section className="profile-edit-section">
                                    <h2>Дополнительно</h2>

                                    <div className="profile-form__field">
                                        <label htmlFor="profile-pronouns">
                                            Местоимения
                                        </label>
                                        <input
                                            id="profile-pronouns"
                                            className="input"
                                            value={form.pronouns}
                                            onChange={update('pronouns')}
                                            maxLength={40}
                                            placeholder="Необязательно"
                                        />
                                    </div>

                                    <div className="profile-form__field">
                                        <label htmlFor="profile-birth-date">
                                            Дата рождения
                                        </label>
                                        <input
                                            id="profile-birth-date"
                                            className="input"
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="bday"
                                            placeholder="ДД.ММ.ГГГГ"
                                            value={form.birthDate}
                                            onChange={(event) =>
                                                setForm((previous) => ({
                                                    ...previous,
                                                    birthDate: formatDateInput(
                                                        event.target.value
                                                    ),
                                                }))
                                            }
                                            maxLength={10}
                                            pattern="\d{2}\.\d{2}\.\d{4}"
                                            aria-describedby="profile-birth-date-hint"
                                        />
                                        <small id="profile-birth-date-hint">
                                            Формат: ДД.ММ.ГГГГ
                                        </small>
                                    </div>

                                    <div className="profile-form__field">
                                        <label htmlFor="profile-location">
                                            Местоположение
                                        </label>
                                        <input
                                            id="profile-location"
                                            className="input"
                                            value={form.location}
                                            onChange={update('location')}
                                            maxLength={80}
                                            placeholder="Необязательно"
                                        />
                                    </div>

                                    <div className="profile-form__field">
                                        <label htmlFor="profile-website">
                                            Сайт
                                        </label>
                                        <input
                                            id="profile-website"
                                            className="input"
                                            type="url"
                                            value={form.website}
                                            onChange={update('website')}
                                            maxLength={200}
                                            placeholder="https://"
                                        />
                                    </div>
                                </section>

                                {notice && (
                                    <p className="form-notice" role="status">
                                        {notice}
                                    </p>
                                )}

                                <div className="profile-form__actions">
                                    <button
                                        type="button"
                                        className="btn btn--ghost"
                                        onClick={load}
                                        disabled={saving || loading}
                                    >
                                        Отменить
                                    </button>

                                    <button
                                        type="submit"
                                        className="btn btn--primary"
                                        disabled={saving}
                                    >
                                        {saving
                                            ? 'Сохранение…'
                                            : 'Сохранить профиль'}
                                    </button>
                                </div>
                            </form>
                        </>
                    )}

                    {!loading && !profile && !error && (
                        <EmptyState
                            title="Профиль недоступен"
                            description="Не удалось получить данные аккаунта."
                        />
                    )}
                </div>
            </main>

            <RightSidebar />
        </div>
    )
}