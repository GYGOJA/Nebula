import { Outlet } from 'react-router-dom'
import RequireAuth from './RequireAuth'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'

export default function AppLayout() {
    return (
        <RequireAuth>
            <Sidebar />
            <Outlet />
            <MobileNav />
        </RequireAuth>
    )
}
