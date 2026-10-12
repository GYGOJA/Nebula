import { hasTranslation, t } from '@/i18n'

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')

const API_ORIGIN = (() => {
    try {
        return new URL(API_URL, window.location.href).origin
    } catch {
        return ''
    }
})()


export const assetUrl = (url) =>
    typeof url === 'string' && url.startsWith('/api/') ? API_ORIGIN + url : url

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
