import { Outlet } from 'react-router-dom'
import RequireAuth from './RequireAuth'

export default function AppLayout() {
    return (
        <RequireAuth>
            <Outlet />
        </RequireAuth>
    )
}