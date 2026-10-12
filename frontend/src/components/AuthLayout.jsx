import { Outlet } from 'react-router-dom'
import AuthBackground from './AuthBackground'
import LanguageSwitcher from './LanguageSwitcher'

export default function AuthLayout() {
    return (
        <div className="auth-layout">
            <AuthBackground />
            <LanguageSwitcher />
            <div className="auth-layout__content">
                <Outlet />
            </div>
        </div>
    )
}