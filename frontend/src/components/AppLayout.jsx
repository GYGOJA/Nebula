import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { markRecentVisit } from '@/utils/recentVisits'
import RequireAuth from './RequireAuth'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'
import MobileMenu from './MobileMenu'
import SwipeNav from './SwipeNav'
import { NotificationsProvider } from '@/context/NotificationsContext'
import { CallProvider } from '@/context/CallContext'

function RecentVisitTracker() {
    const { pathname } = useLocation()
    useEffect(() => {
        const channel = pathname.match(/^\/app\/channels\/([^/]+)/)
        const space = pathname.match(/^\/app\/spaces\/([^/]+)/)
        if (channel) markRecentVisit('channels', channel[1])
        if (space && space[1] !== 'new') markRecentVisit('spaces', space[1])
    }, [pathname])
    return null
}

export default function AppLayout() {
    return (
        <RequireAuth>
            <NotificationsProvider>
                <CallProvider>
                    <Sidebar />
                    <RecentVisitTracker />
                    <Outlet />
                    <MobileMenu />
                    <SwipeNav />
                    <MobileNav />
                </CallProvider>
            </NotificationsProvider>
        </RequireAuth>
    )
}
