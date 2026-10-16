import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RightSidebar from '@/components/RightSidebar'
import PageHeader from '@/components/PageHeader'
import { api } from '@/api'
import { useI18n } from '@/i18n'

export default function CreateSpace() {
    const { t } = useI18n()
    const nav = useNavigate()
    const [name, setName] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const onSubmit = async (e) => {
        e.preventDefault()
        setError('')

        if (!name.trim()) {
            setError(t('validation.nameRequired'))
            return
        }

        setLoading(true)

        try {
            const space = await api.createSpace({ name })
            nav(`/app/spaces/${space.id}`)
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

                    <form className="form-narrow" onSubmit={onSubmit}>
                        <label className="auth-label">
                            {t('spaces.name')}
                            <input
                                className="auth-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('spaces.namePlaceholder')}
                                autoFocus
                            />
                        </label>

                        {error && (
                            <p className="auth-inline-error">{error}</p>
                        )}

                        <button
                            className="btn btn--primary"
                            type="submit"
                            disabled={loading}
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