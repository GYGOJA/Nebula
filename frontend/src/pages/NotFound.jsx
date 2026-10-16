import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/i18n'
import LanguageSwitcher from '@/components/LanguageSwitcher'

export default function NotFound() {
    const { t } = useI18n()
    const { isAuthenticated } = useAuth()

    return (
        <div className="auth-layout">
            <LanguageSwitcher />
            <div style={{ textAlign: 'center', color: 'var(--text-primary)' }}>
                <h1 style={{ fontSize: 64, fontWeight: 700 }}>404</h1>

                <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
                    {t('notFound.title')}
                </p>

                <Link
                    to={isAuthenticated ? '/app' : '/login'}
                    className="auth-card__link"
                >
                    {isAuthenticated ? t('notFound.home') : t('notFound.login')}
                </Link>
            </div>
        </div>
    )
}