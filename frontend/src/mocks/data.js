import { getLanguage } from '@/i18n'

export const currentUser = {
    id: 'me',
    name: '',
    displayName: '',
    username: '',
    avatar: '',
    email: '',
    status: 'offline',
    bio: '',
    birthDate: null,
    createdAt: null,
}

export const users = []
export const channels = []
export const spaces = []
export const messagesStore = {}
export const friends = []
export const incomingRequests = []
export const outgoingRequests = []
export const directMessages = {}
export const voiceRooms = []
export const notifications = []

let cachedSettings = {}

try {
    cachedSettings = JSON.parse(
        localStorage.getItem('nebula_settings') || '{}'
    )
} catch {}

export const settingsDefaults = {
    theme: cachedSettings.theme || 'dark',
    language: getLanguage(),
    notifications: {
        desktop: true,
        sounds: true,
        mentions: true,
        ...(cachedSettings.notifications || {}),
    },
    privacy: {
        dmFromEveryone: true,
        showOnlineStatus: true,
        ...(cachedSettings.privacy || {}),
    },
}
