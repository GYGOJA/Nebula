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

    save(token, user) {
        write(localStorage, TOKEN_KEY, token)
        write(localStorage, USER_KEY, JSON.stringify(user))
    },

    clear() {
        remove(localStorage, TOKEN_KEY)
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

async function request(path, { skipAuth = false, headers, ...options } = {}) {
    const token = skipAuth ? null : session.getToken()

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
            window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
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
    return new Promise((resolve, reject) => {
        const token = session.getToken()
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

        xhr.onload = () => {
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
                window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
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
}

const blobCache = new Map()

export async function fetchBlob(url, { download = false } = {}) {
    const key = `${url}|${download}`
    if (blobCache.has(key)) return blobCache.get(key)

    const promise = (async () => {
        const token = session.getToken()
        const full = assetUrl(url) + (download ? '?download=1' : '')

        let response

        try {
            response = await fetch(full, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
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
            const token = session.getToken()

            if (!token) return

            controller = new AbortController()

            try {
                const response = await fetch(`${API_URL}/events`, {
                    headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
                    signal: controller.signal,
                })

                if (response.status === 401) {
                    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
                    return
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
