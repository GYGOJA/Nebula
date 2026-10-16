import { http, resolveAssetURL, uploadWithProgress, USE_MOCK } from './client'
import { mockApi } from './mock'

const PUBLIC = { skipAuth: true }
const SETTINGS_KEY = 'nebula_settings'

function normalizeUser(user) {
    if (!user || typeof user !== 'object') return user

    const name = user.displayName || user.display_name || user.name || user.username || ''
    const avatar = resolveAssetURL(user.avatarUrl || user.avatar_url || user.avatar || '')

    return {
        ...user,
        name,
        displayName: name,
        avatar,
        avatarUrl: avatar,
    }
}

function normalizeAttachment(attachment) {
    if (!attachment || typeof attachment !== 'object') return attachment
    return {
        ...attachment,
        id: attachment.id || attachment.attachmentId || attachment.attachment_id || attachment.url,
        kind: attachment.kind || attachment.attachmentKind || attachment.attachment_kind || 'file',
        name: attachment.name || attachment.fileName || attachment.file_name || 'file',
        size: attachment.size ?? attachment.sizeBytes ?? attachment.size_bytes ?? 0,
        durationMs: attachment.durationMs ?? attachment.duration_ms ?? 0,
        url: resolveAssetURL(attachment.url || attachment.downloadUrl || attachment.download_url || ''),
    }
}

function normalizeMessage(message) {
    if (!message || typeof message !== 'object') return message
    return {
        ...message,
        text: message.text ?? message.content ?? '',
        authorId: message.authorId || message.author_id || message.senderId || message.sender_id || '',
        senderId: message.senderId || message.sender_id || '',
        recipientId: message.recipientId || message.recipient_id || '',
        createdAt: message.createdAt || message.created_at || '',
        author: normalizeUser(message.author || message.sender || message.user),
        attachments: Array.isArray(message.attachments)
            ? message.attachments.map(normalizeAttachment)
            : [],
    }
}

function normalizeSpace(space) {
    if (!space || typeof space !== 'object') return space
    return {
        ...space,
        avatarUrl: resolveAssetURL(space.avatarUrl || space.avatar_url || ''),
        avatar_url: resolveAssetURL(space.avatarUrl || space.avatar_url || ''),
        id: space.id || space.spaceId || space.space_id,
        name: space.name || space.space_name || '',
        channels: Array.isArray(space.channels) ? space.channels.map((channel) => ({ ...channel, spaceId: channel.spaceId || channel.space_id || space.id })) : [],
        voiceRooms: Array.isArray(space.voiceRooms) ? space.voiceRooms.map((room) => ({ ...room, spaceId: room.spaceId || room.space_id || space.id })) : [],
    }
}

function messageForm(payload) {
    const value = typeof payload === 'string' ? { text: payload } : payload || {}
    const text = String(value.text ?? value.content ?? '').trim()
    const files = Array.from(value.files || []).filter(Boolean)
    const voice = Boolean(value.voice)
    const replyToId = String(value.replyToId || '')
    const durationMs = Math.max(0, Number(value.durationMs ?? value.duration) || 0)
    if (!files.length && !voice) return { text, files, voice, replyToId, durationMs: 0, form: null }
    const form = new FormData()
    form.append('text', text)
    if (replyToId) form.append('replyToId', replyToId)
    files.forEach((file) => form.append('files', file, file.name || 'upload'))
    if (voice) {
        form.append('voice', '1')
        form.append('duration', String(durationMs))
    }
    return { text, files, voice, replyToId, durationMs, form, onProgress: value.onProgress, signal: value.signal }
}

async function sendMessage(path, payload, channel = false) {
    const value = messageForm(payload)
    if (value.form) return normalizeMessage(await uploadWithProgress(path, value.form, { onProgress: value.onProgress, signal: value.signal }))
    return normalizeMessage(await http.post(path, channel
        ? { content: value.text, ...(value.replyToId ? { replyToId: value.replyToId } : {}) }
        : { text: value.text, ...(value.replyToId ? { replyToId: value.replyToId } : {}) }))
}

function normalizeAuth(payload) {
    if (!payload || typeof payload !== 'object') return payload

    return {
        ...payload,
        token: payload.token || payload.access_token || '',
        user: normalizeUser(payload.user),
    }
}

function readSettings() {
    try {
        const value = localStorage.getItem(SETTINGS_KEY)
        return value ? JSON.parse(value) : {}
    } catch {
        return {}
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {}
}

const realApi = {
    login: async (p) => normalizeAuth(await http.post('/auth/login', p, PUBLIC)),
    sendCode: (p) => http.post('/auth/register', p, PUBLIC),
    verifyCode: (p) => http.post('/auth/verify', p, PUBLIC),
    completeProfile: async (p) => normalizeAuth(await http.post('/auth/profile', p, PUBLIC)),
    recover: (p) => http.post('/auth/recover', p, PUBLIC),
    resetPassword: (p) => http.post('/auth/reset', p, PUBLIC),
    getMe: async () => normalizeUser(await http.get('/me')),
    updateProfile: async (p) => normalizeUser(await http.patch('/me', p)),
    getSettings: async () => readSettings(),
    updateSettings: async (p) => {
        const next = { ...readSettings(), ...p }
        saveSettings(next)
        return next
    },
    changePassword: (p) => http.post('/me/password', p),
    changeEmail: (p) => http.post('/me/email/verify', p),
    requestEmailChangeCode: (p) => http.post('/me/email/code', p),
    verifyEmailChangeCode: (p) => http.post('/me/email/verify', p),
    getSpaces: async () => {
        const spaces = await http.get('/spaces')
        return Array.isArray(spaces) ? spaces.map(normalizeSpace) : []
    },
    getSpace: async (id) => {
        const space = await http.get(`/spaces/${id}`)
        return normalizeSpace({
            ...space,
            channels: Array.isArray(space?.channels) ? space.channels : [],
            voiceRooms: Array.isArray(space?.voiceRooms) ? space.voiceRooms : [],
        })
    },
    uploadSpaceAvatar: async (id, file) => {
        const form = new FormData()
        form.append('avatar', file, file.name)
        return normalizeSpace(await http.upload(`/spaces/${id}/avatar`, form))
    },
    getSpaceSettings: async (id) => {
        const data = await http.get(`/spaces/${id}/settings`)
        return {
            ...data,
            space: normalizeSpace(data?.space),
            roles: Array.isArray(data?.roles) ? data.roles : [],
            sections: Array.isArray(data?.sections) ? data.sections : [],
            members: Array.isArray(data?.members) ? data.members.map(normalizeUser) : [],
        }
    },
    joinSpace: (id) => http.post(`/spaces/${id}/join`, {}),
    updateSpace: async (id, p) => normalizeSpace(await http.patch(`/spaces/${id}`, p)),
    deleteSpace: (id) => http.delete(`/spaces/${id}`),
    deleteSpaceAvatar: async (id) => normalizeSpace(await http.delete(`/spaces/${id}/avatar`)),
    createRole: (spaceId, p) => http.post(`/spaces/${spaceId}/roles`, p),
    updateRole: (spaceId, roleId, p) => http.patch(`/spaces/${spaceId}/roles/${roleId}`, p),
    deleteRole: (spaceId, roleId) => http.delete(`/spaces/${spaceId}/roles/${roleId}`),
    setMemberRoles: (spaceId, userId, roleIds) => http.patch(`/spaces/${spaceId}/members/${userId}`, { roleIds }),
    updateSection: (spaceId, sectionId, p) => http.patch(`/spaces/${spaceId}/channels/${sectionId}`, p),
    deleteSection: (spaceId, sectionId) => http.delete(`/spaces/${spaceId}/channels/${sectionId}`),
    getChannels: async (spaceId) => {
        const channels = await http.get(spaceId ? `/spaces/${spaceId}/channels` : '/channels')
        return Array.isArray(channels) ? channels.map((channel) => ({
            ...channel,
            spaceId: channel.spaceId || channel.space_id || '',
            name: channel.name || channel.channel_name || '',
        })) : []
    },
    getSpaceMembers: async (spaceId, channelId) => {
        const query = channelId ? `?channelId=${encodeURIComponent(channelId)}` : ''
        const members = await http.get(`/spaces/${spaceId}/members${query}`)
        return Array.isArray(members) ? members.map(normalizeUser) : []
    },
    getSpaceFiles: async (spaceId, { channelId, kind, limit, offset } = {}) => {
        const query = new URLSearchParams()
        if (channelId) query.set('channelId', channelId)
        if (kind) query.set('kind', kind)
        if (limit) query.set('limit', String(limit))
        if (offset) query.set('offset', String(offset))
        const qs = query.toString()
        const page = await http.get(`/spaces/${spaceId}/files${qs ? `?${qs}` : ''}`)
        return {
            hasMore: Boolean(page?.hasMore),
            items: Array.isArray(page?.items)
                ? page.items.map((item) => ({ ...item, author: normalizeUser(item.author) }))
                : [],
        }
    },
    getSpaceThreads: async (spaceId, { channelId, limit, offset } = {}) => {
        const query = new URLSearchParams()
        if (channelId) query.set('channelId', channelId)
        if (limit) query.set('limit', String(limit))
        if (offset) query.set('offset', String(offset))
        const qs = query.toString()
        const page = await http.get(`/spaces/${spaceId}/threads${qs ? `?${qs}` : ''}`)
        return {
            hasMore: Boolean(page?.hasMore),
            items: Array.isArray(page?.items)
                ? page.items.map((item) => ({
                    ...item,
                    author: normalizeUser(item.author),
                    lastReplyAuthor: normalizeUser(item.lastReplyAuthor),
                }))
                : [],
        }
    },
    createSpace: (p) => http.post('/spaces', p),
    createChannel: async (spaceId, input) => {
        const payload = typeof input === 'string' ? { name: input, type: 'text' } : (input || {})
        const type = payload.type === 'voice' ? 'voice' : 'text'
        const path = type === 'voice' ? `/spaces/${spaceId}/voice` : `/spaces/${spaceId}/channels`
        return http.post(path, { ...payload, name: String(payload.name || '').trim(), type })
    },
    createVoiceRoom: async (spaceId, name) => http.post(`/spaces/${spaceId}/voice`, { name: typeof name === 'string' ? name : name?.name, type: 'voice' }),
    getMessages: async (channelId) => {
        const messages = await http.get(`/channels/${channelId}/messages`)
        return Array.isArray(messages) ? messages.map(normalizeMessage) : []
    },
    sendMessage: (channelId, content, options = {}) => {
        const payload = typeof content === 'string' ? { ...options, text: content } : content
        return sendMessage(`/channels/${channelId}/messages`, payload, true)
    },
    editMessage: async (channelId, messageId, text) => normalizeMessage(await http.patch(`/channels/${channelId}/messages/${messageId}`, { text })),
    deleteMessage: (channelId, messageId) => http.delete(`/channels/${channelId}/messages/${messageId}`),
    uploadAvatar: async (file) => {
        const form = new FormData()
        form.append('avatar', file, file.name)
        return normalizeUser(await http.upload('/me/avatar', form))
    },
    deleteAvatar: async () => normalizeUser(await http.delete('/me/avatar')),
    removeAvatar: async () => normalizeUser(await http.delete('/me/avatar')),
    getUser: async (id) => normalizeUser(await http.get(`/users/${id}`)),
    getFriends: async () => {
        const users = await http.get('/friends')
        return Array.isArray(users) ? users.map(normalizeUser) : []
    },
    getFriendRequests: async () => {
        const requests = await http.get('/friends/requests')
        return {
            incoming: (requests?.incoming || []).map(normalizeUser),
            outgoing: (requests?.outgoing || []).map(normalizeUser),
        }
    },
    acceptFriend: (id) => http.post(`/friends/requests/${id}/accept`),
    declineFriend: (id) => http.post(`/friends/requests/${id}/decline`),
    cancelFriend: (id) => http.delete(`/friends/requests/${id}/cancel`),
    removeFriend: (id) => http.delete(`/friends/${id}`),
    sendFriendRequest: (p) => http.post('/friends/requests', p),
    searchUsers: (q) => http.get(`/search/users?q=${encodeURIComponent(q)}`),
    searchSpaces: (q) => http.get(`/search/spaces?q=${encodeURIComponent(q)}`),
    searchMessages: (q) => http.get(`/search/messages?q=${encodeURIComponent(q)}`),
    getDmConversations: async () => {
        const conversations = await http.get('/dm')
        return Array.isArray(conversations)
            ? conversations.map((conversation) => {
                const user = normalizeUser(conversation)
                return {
                    ...user,
                    name: user.displayName || user.name || user.username || '',
                    avatar: user.avatarUrl || user.avatar || '',
                    userId: conversation.userId || conversation.user_id || conversation.id,
                    last: conversation.last || conversation.lastMessage || conversation.last_message || null,
                }
            })
            : []
    },
    getDmUser: async (id) => normalizeUser(await http.get(`/dm/${id}`)),
    getDmPeer: async (id) => normalizeUser(await http.get(`/dm/${id}`)),
    getDmMessages: async (id) => {
        const messages = await http.get(`/dm/${id}/messages`)
        return Array.isArray(messages) ? messages.map(normalizeMessage) : []
    },
    markDmRead: (id) => http.post(`/dm/${id}/read`),
    getDmUnread: () => http.get('/dm/unread'),
    sendDm: (id, content, options = {}) => {
        const payload = typeof content === 'string' ? { ...options, text: content } : content
        return sendMessage(`/dm/${id}/messages`, payload)
    },
    editDmMessage: async (peerId, messageId, text) => normalizeMessage(await http.patch(`/dm/${peerId}/messages/${messageId}`, { text })),
    deleteDmMessage: (peerId, messageId) => http.delete(`/dm/${peerId}/messages/${messageId}`),
    getVoiceRooms: async (spaceId) => {
        const rooms = await http.get(spaceId ? `/spaces/${spaceId}/voice` : '/voice')
        return Array.isArray(rooms) ? rooms.map((room) => ({
            ...room,
            spaceId: room.spaceId || room.space_id || '',
            participants: (room.participants || []).map(normalizeUser),
        })) : []
    },
    getVoiceRoom: async (roomId) => {
        const room = await http.get(`/voice/${roomId}`)
        return room && typeof room === 'object' ? {
            ...room,
            spaceId: room.spaceId || room.space_id || '',
            participants: (room.participants || []).map(normalizeUser),
        } : room
    },
    getVoiceConfig: () => http.get('/voice/config'),
    joinVoice: (roomId, options = {}) => http.post(`/voice/${roomId}/join`, options),
    leaveVoice: (roomId) => http.post(`/voice/${roomId}/leave`),
    updateVoiceState: (roomId, state) => http.post(`/voice/${roomId}/state`, state),
    setVoiceState: (roomId, state) => http.post(`/voice/${roomId}/state`, state),
    sendVoiceSignal: (roomId, target, type, data) => {
        const payload = target && typeof target === 'object' ? target : { to: target, type, data }
        return http.post(`/voice/${roomId}/signal`, payload)
    },
    startCall: (userId, video = false) => http.post('/calls', { userId, video }),
    getPendingCalls: () => http.get('/calls/pending'),
    acceptCall: (id) => http.post(`/calls/${id}/accept`),
    declineCall: (id) => http.post(`/calls/${id}/decline`),
    cancelCall: (id) => http.post(`/calls/${id}/cancel`),
    endCall: (id) => http.post(`/calls/${id}/end`),
    createInvite: (p) => http.post('/invites', p),
    getInvite: async (code) => {
        const data = await http.get(`/invites/${encodeURIComponent(code)}`)
        return { ...data, space: normalizeSpace(data?.space) }
    },
    acceptInvite: async (p) => {
        const data = await http.post('/invites/accept', p)
        return { ...data, space: normalizeSpace(data?.space) }
    },
}

export const api = USE_MOCK ? mockApi : realApi
