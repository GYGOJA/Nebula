import { Outlet } from 'react-router-dom'
import RequireAuth from './RequireAuth'
import { NotificationsProvider } from '@/context/NotificationsContext'

export default function AppLayout() {
    return (
        <RequireAuth>
            <NotificationsProvider>
                <Outlet />
            </NotificationsProvider>
        </RequireAuth>
    )
}
