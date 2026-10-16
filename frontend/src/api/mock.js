import {
    users,
    channels,
    spaces,
    messagesStore,
    currentUser,
    friends,
    incomingRequests,
    outgoingRequests,
    directMessages,
    voiceRooms,
    settingsDefaults,
} from '@/mocks/data'
import { ApiError } from '@/api/client'
import { getLocale, t } from '@/i18n'

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms))

const fail = (message, code = '') => {
    throw new ApiError(message, { status: 400, code })
}

const initials = (name = '') => name.trim().slice(0, 2)

const state = {
    users: [...users],
    friends: [...friends],
    incoming: [...incomingRequests],
    outgoing: [...outgoingRequests],
    spaces: [...spaces],
    channels: [...channels],
    messagesStore: { ...messagesStore },
    dm: { ...directMessages },
    voice: [...voiceRooms],
    settings: { ...settingsDefaults },
    profile: { ...currentUser },
}

export const mockApi = {
    async getSpaceFiles() {
        await wait()
        return { items: [], hasMore: false }
    },

    async getSpaceThreads() {
        await wait()
        return { items: [], hasMore: false }
    },

    async login({ login, password }) {
        await wait()

        if (!login || !password) fail(t('login.enterCredentials'))

        const isEmail = login.includes('@')

        return {
            token: 'mock-token',
            user: {
                ...state.profile,
                ...(isEmail ? { email: login } : { username: login }),
            },
        }
    },

    async sendCode({ email }) {
        await wait()
        if (!email) fail(t('validation.emailRequired'))
        return { ok: true }
    },

    async verifyCode({ email, code }) {
        await wait()
        if (!email) fail(t('mock.emailMissing'))

        if (!/^\d{6}$/.test(code)) {
            fail(t('validation.codeLength', { length: 6 }), 'INVALID_CODE')
        }

        return { ok: true, ticket: 'mock-ticket' }
    },

    async completeProfile({
                              email,
                              ticket,
                              username,
                              displayName,
                              birthDate,
                          }) {
        await wait()

        if (!email || !ticket) {
            fail(t('mock.confirmEmail'))
        }

        const user = {
            ...state.profile,
            email,
            username,
            name: displayName,
            displayName,
            avatar: '',
            ...(birthDate ? { birthDate } : {}),
        }

        state.profile = user

        return { token: 'mock-token', user }
    },

    async recover({ email }) {
        await wait()
        if (!email) fail(t('validation.emailRequired'))
        return { ok: true }
    },

    async resetPassword({ email, code, password }) {
        await wait()

        if (!email) fail(t('mock.emailMissing'))

        if (!/^\d{6}$/.test(code)) {
            fail(t('validation.codeLength', { length: 6 }), 'INVALID_CODE')
        }

        if (!password || password.length < 8) {
            fail(t('validation.passwordMin', { min: 8 }))
        }

        return { ok: true }
    },

    async getMe() {
        await wait()
        return { ...state.profile }
    },

    async updateProfile(patch) {
        await wait()
        state.profile = { ...state.profile, ...patch }
        return { ...state.profile }
    },

    async uploadAvatar(file) {
        await wait()
        if (!file || !['image/png', 'image/jpeg'].includes(file.type)) fail('Use a PNG or JPG image')
        if (file.size > 5 * 1024 * 1024) fail('The avatar must be 5 MB or smaller')
        if (String(state.profile.avatarUrl || '').startsWith('blob:')) URL.revokeObjectURL(state.profile.avatarUrl)
        const avatarUrl = URL.createObjectURL(file)
        state.profile = { ...state.profile, avatar: avatarUrl, avatarUrl }
        return { ...state.profile }
    },

    async deleteAvatar() {
        await wait()
        if (String(state.profile.avatarUrl || '').startsWith('blob:')) URL.revokeObjectURL(state.profile.avatarUrl)
        state.profile = { ...state.profile, avatar: '', avatarUrl: '' }
        return { ...state.profile }
    },

    async getSettings() {
        await wait()
        return { ...state.settings }
    },

    async updateSettings(patch) {
        await wait()

        state.settings = {
            ...state.settings,
            ...patch,
            notifications: {
                ...state.settings.notifications,
                ...(patch.notifications || {}),
            },
            privacy: {
                ...state.settings.privacy,
                ...(patch.privacy || {}),
            },
        }

        try {
            localStorage.setItem(
                'nebula_settings',
                JSON.stringify(state.settings)
            )
        } catch {}

        return { ...state.settings }
    },

    async changePassword({ current, next }) {
        await wait()

        if (!current || !next) fail(t('mock.fillFields'))

        if (next.length < 8) {
            fail(t('validation.passwordMin', { min: 8 }))
        }

        return { ok: true }
    },

    async changeEmail({ email, password }) {
        await wait()

        const next = String(email || '').trim().toLowerCase()

        if (!next || !password) fail(t('mock.fillFields'))

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
            fail(t('validation.emailInvalid'))
        }

        if (state.users.some((user) => user.email?.toLowerCase() === next)) {
            fail(t('settings.emailTaken'))
        }

        state.profile = { ...state.profile, email: next }
        return { ok: true, email: next, user: { ...state.profile } }
    },

    async requestEmailChangeCode({ email }) {
        await wait()
        const next = String(email || '').trim().toLowerCase()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) fail(t('validation.emailInvalid'))
        if (state.users.some((user) => user.email?.toLowerCase() === next)) fail(t('settings.emailTaken'))
        state.pendingEmailChange = next
        return { ok: true, email: next, mockCode: '123456' }
    },

    async verifyEmailChangeCode({ email, code }) {
        await wait()
        const next = String(email || '').trim().toLowerCase()
        if (!state.pendingEmailChange || state.pendingEmailChange !== next) fail('Сначала запросите код подтверждения')
        if (String(code || '').trim() !== '123456') fail('Неверный код. Для mock-режима используйте 123456.')
        if (state.users.some((user) => user.email?.toLowerCase() === next)) fail(t('settings.emailTaken'))
        state.profile = { ...state.profile, email: next }
        state.pendingEmailChange = ''
        return { ok: true, email: next, user: { ...state.profile } }
    },

    async getSpaces() {
        await wait()
        return state.spaces.map((space) => ({ ...space }))
    },

    async getSpace(id) {
        await wait()

        const space = state.spaces.find((item) => item.id === id)

        if (!space) fail(t('mock.spaceNotFound'), 'NOT_FOUND')

        return {
            ...space,
            channels: state.channels.filter((channel) => channel.spaceId === id),
            voiceRooms: state.voice.filter((room) => room.spaceId === id),
        }
    },

    async getChannels(spaceId) {
        await wait()

        return spaceId
            ? state.channels.filter((channel) => channel.spaceId === spaceId)
            : [...state.channels]
    },

    async createSpace({ name }) {
        await wait()

        if (!name?.trim()) fail(t('validation.nameRequired'))

        const space = {
            id: `sp-${Date.now()}`,
            name: name.trim(),
            members: 1,
            icon: null,
        }

        state.spaces.push(space)
        return space
    },

    async getMessages(channelId) {
        await wait()
        return (state.messagesStore[channelId] || []).map((message) => ({
            ...message,
        }))
    },

    async sendMessage(channelId, content, options = {}) {
        await wait(150)

        const payload = typeof content === 'string' ? { ...options, text: content } : (content || {})
        const text = String(payload.text ?? payload.content ?? '').trim()
        if (!text && !(payload.files || []).length) fail(t('errors.emptyMessage'))

        const target = payload.replyToId
            ? (state.messagesStore[channelId] || []).find((item) => String(item.id) === String(payload.replyToId))
            : null
        const message = {
            id: `m-${Date.now()}`,
            authorId: 'me',
            time: new Date().toLocaleTimeString(getLocale(), {
                hour: '2-digit',
                minute: '2-digit',
            }),
            text,
            content: text,
            attachments: [],
            replyTo: target ? { id: target.id, text: target.text || '', author: target.author?.displayName || target.author?.name || (target.authorId === 'me' ? state.profile.displayName || state.profile.name : 'User') } : null,
            self: true,
            reactions: [],
            createdAt: new Date().toISOString(),
        }

        if (!state.messagesStore[channelId]) {
            state.messagesStore[channelId] = []
        }

        state.messagesStore[channelId].push(message)
        return { ...message }
    },

    async editMessage(channelId, messageId, text) {
        await wait()
        const message = (state.messagesStore[channelId] || []).find((item) => String(item.id) === String(messageId))
        if (!message) fail('Message not found', 'NOT_FOUND')
        if (!(message.self || message.authorId === 'me')) fail('You can only edit your own messages', 'FORBIDDEN')
        const next = String(text || '').trim()
        if (!next) fail('Message cannot be empty')
        message.text = next
        message.content = next
        message.editedAt = new Date().toISOString()
        return { ...message }
    },

    async deleteMessage(channelId, messageId) {
        await wait()
        const list = state.messagesStore[channelId] || []
        const message = list.find((item) => String(item.id) === String(messageId))
        if (!message) fail('Message not found', 'NOT_FOUND')
        if (!(message.self || message.authorId === 'me')) fail('You can only delete your own messages', 'FORBIDDEN')
        state.messagesStore[channelId] = list.filter((item) => String(item.id) !== String(messageId))
        return { ok: true }
    },

    async getFriends() {
        await wait()
        return state.friends.map((friend) => ({ ...friend }))
    },

    async getFriendRequests() {
        await wait()

        return {
            incoming: state.incoming.map((request) => ({ ...request })),
            outgoing: state.outgoing.map((request) => ({ ...request })),
        }
    },

    async acceptFriend(id) {
        await wait()

        const request = state.incoming.find((item) => item.id === id)

        if (!request) fail(t('mock.requestNotFound'), 'NOT_FOUND')

        state.incoming = state.incoming.filter((item) => item.id !== id)

        state.friends.push({
            id: request.id,
            name: request.name,
            avatar: request.avatar || '',
            status: 'offline',
            since: new Date().toISOString().slice(0, 10),
        })

        return { ok: true }
    },

    async declineFriend(id) {
        await wait()
        state.incoming = state.incoming.filter((item) => item.id !== id)
        return { ok: true }
    },

    async removeFriend(id) {
        await wait()
        state.friends = state.friends.filter((item) => item.id !== id)
        return { ok: true }
    },

    async sendFriendRequest({ username }) {
        await wait()

        if (!username?.trim()) fail(t('validation.usernameRequired'))

        const normalized = username.replace(/^@/, '')
        const user = state.users.find((item) => item.username === normalized)

        if (!user) fail(t('mock.userNotFound'), 'NOT_FOUND')

        const request = {
            id: `r-${Date.now()}`,
            name: user.name,
            avatar: user.avatar || '',
            username: user.username,
        }

        state.outgoing.push(request)
        return request
    },

    async searchUsers(query) {
        await wait(180)

        const normalized = (query || '').trim().toLowerCase()
        if (!normalized) return []

        return state.users
            .filter((user) =>
                (user.name || '').toLowerCase().includes(normalized) ||
                (user.username || '').toLowerCase().includes(normalized)
            )
            .slice(0, 20)
            .map((user) => ({ ...user }))
    },

    async searchSpaces(query) {
        await wait(180)

        const normalized = (query || '').trim().toLowerCase()
        if (!normalized) return []

        return state.spaces
            .filter((space) => space.name.toLowerCase().includes(normalized))
            .slice(0, 20)
            .map((space) => ({ ...space }))
    },

    async searchMessages(query) {
        await wait(180)

        const normalized = (query || '').trim().toLowerCase()
        if (!normalized) return []

        const results = []

        for (const [channelId, messages] of Object.entries(state.messagesStore)) {
            for (const message of messages) {
                if (message.text?.toLowerCase().includes(normalized)) {
                    results.push({ ...message, channelId })
                }
            }
        }

        return results.slice(0, 50)
    },

    async getDmConversations() {
        await wait()

        return state.friends.map((friend) => {
            const messages = state.dm[friend.id] || []

            return {
                userId: friend.id,
                name: friend.name,
                avatar: friend.avatar || '',
                status: friend.status,
                last: messages[messages.length - 1] || null,
            }
        })
    },

    async getDmMessages(userId) {
        await wait()
        return (state.dm[userId] || []).map((message) => ({ ...message }))
    },

    async sendDm(userId, content, options = {}) {
        await wait(150)

        const payload = typeof content === 'string' ? { ...options, text: content } : (content || {})
        const text = String(payload.text ?? payload.content ?? '').trim()
        if (!text && !(payload.files || []).length) fail(t('errors.emptyMessage'))
        const target = payload.replyToId
            ? (state.dm[userId] || []).find((item) => String(item.id) === String(payload.replyToId))
            : null
        const message = {
            id: `dm-${Date.now()}`,
            from: 'me',
            authorId: 'me',
            self: true,
            text,
            content: text,
            attachments: [],
            replyTo: target ? { id: target.id, text: target.text || '', author: target.author?.displayName || target.author?.name || (target.authorId === 'me' || target.from === 'me' ? state.profile.displayName || state.profile.name : 'User') } : null,
            createdAt: new Date().toISOString(),
            time: new Date().toLocaleTimeString(getLocale(), {
                hour: '2-digit',
                minute: '2-digit',
            }),
        }

        if (!state.dm[userId]) state.dm[userId] = []
        state.dm[userId].push(message)

        return { ...message }
    },

    async editDmMessage(userId, messageId, text) {
        await wait()
        const message = (state.dm[userId] || []).find((item) => String(item.id) === String(messageId))
        if (!message) fail('Message not found', 'NOT_FOUND')
        if (!(message.self || message.authorId === 'me' || message.from === 'me')) fail('You can only edit your own messages', 'FORBIDDEN')
        const next = String(text || '').trim()
        if (!next) fail('Message cannot be empty')
        message.text = next
        message.content = next
        message.editedAt = new Date().toISOString()
        return { ...message }
    },

    async deleteDmMessage(userId, messageId) {
        await wait()
        const list = state.dm[userId] || []
        const message = list.find((item) => String(item.id) === String(messageId))
        if (!message) fail('Message not found', 'NOT_FOUND')
        if (!(message.self || message.authorId === 'me' || message.from === 'me')) fail('You can only delete your own messages', 'FORBIDDEN')
        state.dm[userId] = list.filter((item) => String(item.id) !== String(messageId))
        return { ok: true }
    },

    async getVoiceRooms(spaceId) {
        await wait()

        return state.voice
            .filter((room) => !spaceId || room.spaceId === spaceId)
            .map((room) => ({ ...room }))
    },

    async joinVoice(roomId) {
        await wait()

        const room = state.voice.find((item) => item.id === roomId)

        if (!room) fail(t('voice.notFoundTitle'), 'NOT_FOUND')

        if (!room.participants.includes('me')) {
            room.participants.push('me')
        }

        room.members = room.participants.length
        return { ...room }
    },

    async leaveVoice(roomId) {
        await wait()

        const room = state.voice.find((item) => item.id === roomId)

        if (room) {
            room.participants = room.participants.filter((id) => id !== 'me')
            room.members = room.participants.length
        }

        return { ok: true }
    },

    async createInvite({ spaceId }) {
        await wait()

        if (!spaceId) fail(t('mock.spaceMissing'))

        const code = Math.random().toString(36).slice(2, 10)

        return {
            code,
            url: `${window.location.origin}/invite/${code}`,
            spaceId,
            expiresAt: new Date(
                Date.now() + 7 * 24 * 60 * 60 * 1000
            ).toISOString(),
        }
    },

    async getInvite() {
        await wait()

        const space = state.spaces[0]
        if (!space) fail(t('mock.noSpaces'), 'NOT_FOUND')

        return { space, isMember: true }
    },

    async getSpaceSettings(id) {
        await wait()

        const space = state.spaces.find((item) => item.id === id)
        if (!space) fail(t('mock.spaceNotFound'), 'NOT_FOUND')

        return {
            space,
            isOwner: true,
            permissions: 63,
            can: { administrator: true, manageSpace: true, manageChannels: true, manageRoles: true, invite: true, send: true },
            roles: [{ id: 'everyone', name: '@everyone', color: '#95908c', permissions: 48, isDefault: true, position: 0, members: 1 }],
            sections: state.channels.filter((channel) => channel.spaceId === id).map((channel) => ({ ...channel, restricted: false, access: [] })),
            members: [],
        }
    },

    async updateSpace(id, patch) {
        await wait()

        const space = state.spaces.find((item) => item.id === id)
        if (!space) fail(t('mock.spaceNotFound'), 'NOT_FOUND')

        Object.assign(space, patch)
        return { ...space }
    },

    async deleteSpace(id) {
        await wait()

        state.spaces = state.spaces.filter((item) => item.id !== id)
        return { ok: true }
    },

    async deleteSpaceAvatar() {
        await wait()
        return {}
    },

    async createRole() {
        fail('Roles are not available in demo mode')
    },

    async updateRole() {
        fail('Roles are not available in demo mode')
    },

    async deleteRole() {
        fail('Roles are not available in demo mode')
    },

    async setMemberRoles() {
        fail('Roles are not available in demo mode')
    },

    async updateSection() {
        fail('Channel settings are not available in demo mode')
    },

    async deleteSection() {
        fail('Channel settings are not available in demo mode')
    },

    async acceptInvite({ code }) {
        await wait()

        if (!code) fail(t('mock.codeMissing'))

        const space = state.spaces[0]
        if (!space) fail(t('mock.noSpaces'), 'NOT_FOUND')

        return { space }
    },
}