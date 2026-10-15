import { useEffect, useState } from 'react'
import { api } from '@/api'
import { useI18n } from '@/i18n'

export default function SettingsPanel() {
    const { t, language, languages, setLanguage } = useI18n()
    const [settings, setSettings] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        let alive = true

        api.getSettings()
            .then((s) => {
                if (alive) setSettings(s)
            })
            .catch((e) => {
                if (alive) {
                    setError(e?.message || t('settings.loadFailed'))
                }
            })
            .finally(() => {
                if (alive) setLoading(false)
            })

        return () => {
            alive = false
        }
    }, [])

    const patch = async (partial) => {
        const merged = { ...settings, ...partial }
        setSettings(merged)
        setSaved(false)

        try {
            await api.updateSettings(partial)
            setSaved(true)
            setTimeout(() => setSaved(false), 1200)
        } catch (e) {
            setError(e?.message || t('settingsPanel.saveFailed'))
        }
    }

    if (loading) return <p className="muted">{t('settingsPanel.loading')}</p>
    if (error) return <p className="auth-inline-error">{error}</p>
    if (!settings) return null

    return (
        <div className="settings-panel">
            <section className="settings-block">
                <h3 className="settings-block__title">{t('settings.appearance')}</h3>

                <label className="settings-row">
                    <span>{t('settings.theme')}</span>
                    <select
                        value={settings.theme}
                        onChange={(e) => patch({ theme: e.target.value })}
                    >
                        <option value="dark">{t('settings.themeDark')}</option>
                        <option value="light">{t('settings.themeLight')}</option>
                    </select>
                </label>

                <label className="settings-row">
                    <span>{t('settings.language')}</span>
                    <select
                        value={language}
                        onChange={(e) => {
                            setLanguage(e.target.value)
                            patch({ language: e.target.value })
                        }}
                    >
                        {languages.map((item) => (
                            <option key={item.code} value={item.code}>
                                {item.label}
                            </option>
                        ))}
                    </select>
                </label>
            </section>

            <section className="settings-block">
                <h3 className="settings-block__title">{t('settings.notifications')}</h3>

                <label className="settings-row">
                    <input
                        type="checkbox"
                        checked={settings.notifications.desktop}
                        onChange={(e) => patch({
                            notifications: {
                                ...settings.notifications,
                                desktop: e.target.checked,
                            },
                        })}
                    />
                    <span>{t('settingsPanel.desktop')}</span>
                </label>

                <label className="settings-row">
                    <input
                        type="checkbox"
                        checked={settings.notifications.sounds}
                        onChange={(e) => patch({
                            notifications: {
                                ...settings.notifications,
                                sounds: e.target.checked,
                            },
                        })}
                    />
                    <span>{t('settingsPanel.sounds')}</span>
                </label>

                <label className="settings-row">
                    <input
                        type="checkbox"
                        checked={settings.notifications.mentions}
                        onChange={(e) => patch({
                            notifications: {
                                ...settings.notifications,
                                mentions: e.target.checked,
                            },
                        })}
                    />
                    <span>{t('settingsPanel.mentionsOnly')}</span>
                </label>
            </section>

            <section className="settings-block">
                <h3 className="settings-block__title">{t('settings.privacy')}</h3>

                <label className="settings-row">
                    <input
                        type="checkbox"
                        checked={settings.privacy.dmFromEveryone}
                        onChange={(e) => patch({
                            privacy: {
                                ...settings.privacy,
                                dmFromEveryone: e.target.checked,
                            },
                        })}
                    />
                    <span>{t('settingsPanel.dmFromEveryone')}</span>
                </label>

                <label className="settings-row">
                    <input
                        type="checkbox"
                        checked={settings.privacy.showOnlineStatus}
                        onChange={(e) => patch({
                            privacy: {
                                ...settings.privacy,
                                showOnlineStatus: e.target.checked,
                            },
                        })}
                    />
                    <span>{t('settingsPanel.showOnline')}</span>
                </label>
            </section>

            {saved && <p className="settings-saved">{t('settingsPanel.saved')}</p>}
        </div>
    )
}