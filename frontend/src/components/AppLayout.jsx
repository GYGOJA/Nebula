import { Outlet } from 'react-router-dom'
import RequireAuth from './RequireAuth'
import MobileNav from './MobileNav'

export default function AppLayout() {
    return (
        <RequireAuth>
            <Outlet />
            <MobileNav />
        </RequireAuth>
    )
}
