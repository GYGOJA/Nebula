import { matchPath } from 'react-router-dom'

export const NAV_ITEMS = [
    {
        to: '/app',
        end: true,
        icon: 'house',
        labelKey: 'nav.feed',
        shortKey: 'nav.home',
        also: ['/app/spaces', '/app/spaces/*', '/app/channels/*', '/app/voice/*'],
    },
    { to: '/app/search', icon: 'search', labelKey: 'nav.search', shortKey: 'nav.search' },
    { to: '/app/friends', icon: 'users', labelKey: 'nav.friends', shortKey: 'nav.friends' },
    {
        to: '/app/dm',
        icon: 'message-square',
        labelKey: 'nav.messages',
        shortKey: 'nav.messages',
        also: ['/app/dm/*'],
    },
    { to: '/app/profile', icon: 'user', labelKey: 'nav.profile', shortKey: 'nav.profile' },
    { to: '/app/settings', icon: 'settings', labelKey: 'nav.settings', shortKey: 'nav.settings' },
]

export function isNavItemActive(item, pathname) {
    return Boolean(
        matchPath({ path: item.to, end: item.end ?? false }, pathname) ||
            item.also?.some((pattern) => matchPath({ path: pattern, end: false }, pathname))
    )
}

export function getActiveNavIndex(pathname) {
    return NAV_ITEMS.findIndex((item) => isNavItemActive(item, pathname))
}
