import { http, USE_MOCK } from './client'
import { mockApi } from './mock'

const PUBLIC = { skipAuth: true }

const realApi = {
    login:           (p) => http.post('/auth/login', p, PUBLIC),
    sendCode:        (p) => http.post('/auth/register', p, PUBLIC),
    verifyCode:      (p) => http.post('/auth/verify', p, PUBLIC),
    completeProfile: (p) => http.post('/auth/profile', p, PUBLIC),
    recover:         (p) => http.post('/auth/recover', p, PUBLIC),
    resetPassword:   (p) => http.post('/auth/reset', p, PUBLIC),
    getMe:           ()  => http.get('/me'),
    updateProfile:   (p) => http.patch('/me', p),
    getSettings:     ()  => http.get('/me/settings'),
    updateSettings:  (p) => http.patch('/me/settings', p),
    changePassword:  (p) => http.post('/me/password', p),
    changeEmail:     (p) => http.post('/me/email', p),
    getSpaces:       ()  => http.get('/spaces'),
    getSpace:        (id) => http.get(`/spaces/${id}`),
    getChannels:     (spaceId) => http.get(
        spaceId ? `/spaces/${spaceId}/channels` : '/channels'
    ),
    createSpace:     (p) => http.post('/spaces', p),
    getMessages:     (channelId) => http.get(`/channels/${channelId}/messages`),
    sendMessage:     (channelId, content) => http.post(
        `/channels/${channelId}/messages`,
        { content }
    ),
    getFriends:        () => http.get('/friends'),
    getFriendRequests: () => http.get('/friends/requests'),
    acceptFriend:      (id) => http.post(`/friends/requests/${id}/accept`),
    declineFriend:     (id) => http.post(`/friends/requests/${id}/decline`),
    removeFriend:      (id) => http.delete(`/friends/${id}`),
    sendFriendRequest: (p) => http.post('/friends/requests', p),
    searchUsers:       (q) => http.get(`/search/users?q=${encodeURIComponent(q)}`),
    searchSpaces:      (q) => http.get(`/search/spaces?q=${encodeURIComponent(q)}`),
    searchMessages:    (q) => http.get(`/search/messages?q=${encodeURIComponent(q)}`),
    getDmConversations: () => http.get('/dm'),
    getDmMessages:      (id) => http.get(`/dm/${id}/messages`),
    sendDm:             (id, text) => http.post(`/dm/${id}/messages`, { text }),
    getVoiceRooms:      (spaceId) => http.get(
        spaceId ? `/spaces/${spaceId}/voice` : '/voice'
    ),
    joinVoice:     (roomId) => http.post(`/voice/${roomId}/join`),
    leaveVoice:    (roomId) => http.post(`/voice/${roomId}/leave`),
    createInvite:  (p) => http.post('/invites', p),
    acceptInvite:  (p) => http.post('/invites/accept', p),
}

export const api = USE_MOCK ? mockApi : realApi
