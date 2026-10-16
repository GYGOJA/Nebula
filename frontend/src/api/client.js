import { hasTranslation, t } from '@/i18n'

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')

const API_ORIGIN = (() => {
    try {
        return new URL(API_URL, window.location.href).origin
    } catch {
        return ''
    }
})()

export const resolveAssetURL = (url) => {
    if (typeof url !== 'string' || !url.trim()) return url || ''
    if (/^(https?:|data:|blob:)/i.test(url)) return url
    try {
        return new URL(url, API_ORIGIN || window.location.origin).toString()
    } catch {
        return url
    }
}

export const assetUrl = resolveAssetURL

const TOKEN_KEY = 'nebula_token'
const REFRESH_KEY = 'nebula_refresh_token'
const USER_KEY = 'nebula_user'
const PENDING_KEY = 'nebula_pending_registration'

export const UNAUTHORIZED_EVENT = 'nebula:unauthorized'

export class ApiError extends Error {
    constructor(message, { status = 0, code = '', data = null, cause } = {}) {
        super(message, cause ? { cause } : undefined)
        this.name = 'ApiError'
        this.status = status
        this.code = code
        this.data = data
    }
}

function read(storage, key) {
    try {
        return storage.getItem(key)
    } catch {
        return null
    }
}

function write(storage, key, value) {
    try {
        storage.setItem(key, value)
    } catch {}
}

function remove(storage, key) {
    try {
        storage.removeItem(key)
    } catch {}
}

export const session = {
    getToken: () => read(localStorage, TOKEN_KEY),

    getRefreshToken: () => read(localStorage, REFRESH_KEY),

    getUser() {
        const raw = read(localStorage, USER_KEY)
        if (!raw) return null

        try {
            return JSON.parse(raw)
        } catch {
            session.clear()
            return null
        }
    },

    // `refreshToken === undefined` keeps the stored one (profile updates),
    // an empty string removes it (new session without refresh support).
    save(token, user, refreshToken) {
        write(localStorage, TOKEN_KEY, token)
        write(localStorage, USER_KEY, JSON.stringify(user))

        if (refreshToken !== undefined) {
            if (refreshToken) write(localStorage, REFRESH_KEY, refreshToken)
            else remove(localStorage, REFRESH_KEY)
        }
    },

    setTokens(token, refreshToken) {
        write(localStorage, TOKEN_KEY, token)
        if (refreshToken) write(localStorage, REFRESH_KEY, refreshToken)
    },

    clear() {
        remove(localStorage, TOKEN_KEY)
        remove(localStorage, REFRESH_KEY)
        remove(localStorage, USER_KEY)
    },
}

export const pendingRegistration = {
    get() {
        const raw = read(sessionStorage, PENDING_KEY)
        if (!raw) return null

        try {
            return JSON.parse(raw)
        } catch {
            remove(sessionStorage, PENDING_KEY)
            return null
        }
    },

    set(value) {
        write(sessionStorage, PENDING_KEY, JSON.stringify(value))
    },

    clear() {
        remove(sessionStorage, PENDING_KEY)
    },
}

async function parseBody(response) {
    if (response.status === 204) return null

    const text = await response.text()
    if (!text) return null

    try {
        return JSON.parse(text)
    } catch {
        return text
    }
}

function extractMessage(data, status, code) {
    if (code && hasTranslation(`errors.code.${code}`)) {
        return t(`errors.code.${code}`)
    }

    if (typeof data === 'string' && data.trim()) {
        return data.trim()
    }

    if (data && typeof data === 'object') {
        if (typeof data.error === 'string') return data.error
        if (typeof data.error?.message === 'string') {
            return data.error.message
        }
        if (typeof data.message === 'string') return data.message
    }

    if (status >= 500) {
        return t('errors.server')
    }

    return t('errors.request', { status })
}

function extractCode(data) {
    if (data && typeof data === 'object') {
        if (typeof data.code === 'string') return data.code
        if (typeof data.error?.code === 'string') {
            return data.error.code
        }
    }

    return ''
}

// ---- Access token refresh -------------------------------------------------
// The access token lives 15 minutes; the refresh token (30 days) silently
// exchanges it for a new pair, so the user is only logged out when the
// refresh token itself is invalid or expired.

const REFRESH_SKEW_MS = 60 * 1000

function tokenExpiresAt(token) {
    try {
        const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
        const { exp } = JSON.parse(atob(payload))
        return typeof exp === 'number' ? exp * 1000 : 0
    } catch {
        return 0
    }
}

function isExpiring(token) {
    const expiresAt = token ? tokenExpiresAt(token) : 0
    return expiresAt > 0 && expiresAt - Date.now() < REFRESH_SKEW_MS
}

let refreshing = null

async function exchangeRefreshToken() {
    const refreshToken = session.getRefreshToken()
    if (!refreshToken) return false

    let response

    try {
        response = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        })
    } catch {
        return null
    }

    if (response.status === 400 || response.status === 401 || response.status === 403) {
        return false
    }

    if (!response.ok) return null

    const data = await parseBody(response)
    const token = data?.token || data?.access_token
    const nextRefresh = data?.refresh_token

    if (!token || !nextRefresh) return false

    session.setTokens(token, nextRefresh)
    return true
}

// Resolves to true (fresh token stored), false (session is really over)
// or null (could not reach the server, keep the session and try later).
export function refreshSession(staleToken = session.getToken()) {
    if (refreshing) return refreshing

    // Another request or another tab has already refreshed.
    const current = session.getToken()
    if (current && current !== staleToken && !isExpiring(current)) {
        return Promise.resolve(true)
    }

    refreshing = (async () => {
        const run = async () => {
            // Re-check inside the lock: another tab may have rotated the tokens meanwhile.
            const latest = session.getToken()
            if (latest && latest !== staleToken && !isExpiring(latest)) return true

            return exchangeRefreshToken()
        }

        if (typeof navigator !== 'undefined' && navigator.locks?.request) {
            return navigator.locks.request('nebula-token-refresh', run)
        }

        return run()
    })().finally(() => {
        refreshing = null
    })

    return refreshing
}

async function ensureFreshToken() {
    const token = session.getToken()

    if (token && isExpiring(token) && session.getRefreshToken()) {
        await refreshSession(token)
        return session.getToken()
    }

    return token
}

// Returns true when the failed request may be retried with the new token.
async function recoverFromUnauthorized(failedToken) {
    const refreshed = await refreshSession(failedToken)

    if (refreshed === false) {
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    }

    return refreshed === true
}

async function request(path, { skipAuth = false, headers, _retried = false, ...options } = {}) {
    const token = skipAuth ? null : await ensureFreshToken()

    let response

    try {
        response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers: {
                ...(options.body instanceof FormData
                    ? {}
                    : { 'Content-Type': 'application/json' }),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...headers,
            },
        })
    } catch (cause) {
        throw new ApiError(t('errors.network'), {
            code: 'NETWORK_ERROR',
            cause,
        })
    }

    const data = await parseBody(response)

    if (!response.ok) {
        if (response.status === 401 && token) {
            if (!_retried && await recoverFromUnauthorized(token)) {
                return request(path, { skipAuth, headers, _retried: true, ...options })
            }

            if (_retried) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
        }

        const code = extractCode(data)

        throw new ApiError(extractMessage(data, response.status, code), {
            status: response.status,
            code,
            data: data && typeof data === 'object' ? data : null,
        })
    }

    return data
}

export const http = {
    get: (path, options) => request(path, options),

    post: (path, body, options) =>
        request(path, {
            ...options,
            method: 'POST',
            body: JSON.stringify(body ?? {}),
        }),

    patch: (path, body, options) =>
        request(path, {
            ...options,
            method: 'PATCH',
            body: JSON.stringify(body ?? {}),
        }),

    upload: (path, formData, options) =>
        request(path, {
            ...options,
            method: 'POST',
            body: formData,
        }),

    delete: (path, options) =>
        request(path, {
            ...options,
            method: 'DELETE',
        }),
}

export function uploadWithProgress(path, formData, { onProgress, signal } = {}) {
    const send = (token, retried) => new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        xhr.open('POST', `${API_URL}${path}`)
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.setRequestHeader('Accept', 'application/json')

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) onProgress?.(event.loaded / event.total)
        }

        xhr.onerror = () =>
            reject(new ApiError(t('errors.network'), { code: 'NETWORK_ERROR' }))

        xhr.onabort = () =>
            reject(new ApiError('', { code: 'ABORTED' }))

        xhr.onload = async () => {
            let data = null

            try {
                data = xhr.responseText ? JSON.parse(xhr.responseText) : null
            } catch {
                data = xhr.responseText
            }

            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(data)
                return
            }

            if (xhr.status === 401 && token) {
                if (!retried && await recoverFromUnauthorized(token)) {
                    send(session.getToken(), true).then(resolve, reject)
                    return
                }

                if (retried) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
            }

            const code = extractCode(data)

            reject(new ApiError(extractMessage(data, xhr.status, code), {
                status: xhr.status,
                code,
                data: data && typeof data === 'object' ? data : null,
            }))
        }

        signal?.addEventListener('abort', () => xhr.abort(), { once: true })
        xhr.send(formData)
    })

    return ensureFreshToken().then((token) => send(token, false))
}

const blobCache = new Map()

export async function fetchBlob(url, { download = false } = {}) {
    const key = `${url}|${download}`
    if (blobCache.has(key)) return blobCache.get(key)

    const promise = (async () => {
        let token = await ensureFreshToken()
        const full = assetUrl(url) + (download ? '?download=1' : '')

        let response

        const load = () => fetch(full, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        })

        try {
            response = await load()

            if (response.status === 401 && token && await recoverFromUnauthorized(token)) {
                token = session.getToken()
                response = await load()
            }
        } catch (cause) {
            throw new ApiError(t('errors.network'), { code: 'NETWORK_ERROR', cause })
        }

        if (!response.ok) {
            if (response.status === 401 && token) {
                window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
            }

            throw new ApiError(t('errors.request', { status: response.status }), {
                status: response.status,
            })
        }

        return URL.createObjectURL(await response.blob())
    })()

    blobCache.set(key, promise)
    promise.catch(() => blobCache.delete(key))

    return promise
}

export function subscribeEvents(onEvent, onStatus) {
    let stopped = false
    let controller = null
    let retry = 1000

    const run = async () => {
        while (!stopped) {
            const token = await ensureFreshToken()

            if (!token) return
            if (stopped) return

            controller = new AbortController()

            try {
                const response = await fetch(`${API_URL}/events`, {
                    headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
                    signal: controller.signal,
                })

                if (response.status === 401) {
                    // Expired access token: refresh and reconnect right away.
                    if (await recoverFromUnauthorized(token)) {
                        retry = 1000
                        continue
                    }

                    if (!session.getToken()) return
                    throw new Error('sse')
                }

                if (!response.ok || !response.body) throw new Error('sse')

                retry = 1000
                onStatus?.(true)

                const reader = response.body.getReader()
                const decoder = new TextDecoder()
                let buffer = ''

                for (;;) {
                    const { value, done } = await reader.read()

                    if (done) break

                    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')

                    let index
                    while ((index = buffer.indexOf('\n\n')) >= 0) {
                        const block = buffer.slice(0, index)
                        buffer = buffer.slice(index + 2)

                        let type = 'message'
                        const data = []

                        for (const line of block.split('\n')) {
                            if (line.startsWith('event:')) type = line.slice(6).trim()
                            else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
                        }

                        if (!data.length) continue

                        try {
                            onEvent({ type, data: JSON.parse(data.join('\n')) })
                        } catch {

                        }
                    }
                }
            } catch {

            }

            onStatus?.(false)

            if (stopped) return

            await new Promise((resolve) => setTimeout(resolve, retry))
            retry = Math.min(retry * 2, 15000)
        }
    }

    run()

    return () => {
        stopped = true
        controller?.abort()
    }
}
