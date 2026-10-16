import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react'
import { api } from '@/api'
import { http, session, UNAUTHORIZED_EVENT, USE_MOCK } from '@/api/client'
import { t } from '@/i18n'

const AuthCtx = createContext(null)
const restoreUser = () => (session.getToken() ? session.getUser() : null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(restoreUser)

    const logout = useCallback(() => {
        const refreshToken = session.getRefreshToken()

        // Revoke the refresh token on the server (best effort).
        if (refreshToken && !USE_MOCK) {
            http.post('/auth/logout', { refresh_token: refreshToken }, { skipAuth: true }).catch(() => {})
        }

        session.clear()
        setUser(null)
    }, [])

    const updateUser = useCallback((patch) => {
        setUser((previous) => {
            if (!previous) return previous

            const next = { ...previous, ...patch }
            session.save(session.getToken(), next)
            return next
        })
    }, [])

    const startSession = useCallback((payload) => {
        const { user: nextUser, token } = payload || {}
        const refreshToken = payload?.refresh_token || payload?.refreshToken || ''

        if (!nextUser || !token) {
            throw new Error(t('errors.badResponse'))
        }

        session.save(token, nextUser, refreshToken)
        setUser(nextUser)
        return nextUser
    }, [])

    useEffect(() => {
        const onStorage = (e) => {
            if (e.key === null || e.key === 'nebula_token') {
                setUser(restoreUser())
            }
        }

        window.addEventListener(UNAUTHORIZED_EVENT, logout)
        window.addEventListener('storage', onStorage)

        return () => {
            window.removeEventListener(UNAUTHORIZED_EVENT, logout)
            window.removeEventListener('storage', onStorage)
        }
    }, [logout])

    const login = useCallback(
        async (credentials) => startSession(await api.login(credentials)),
        [startSession]
    )

    const register = useCallback(
        async (payload) => startSession(await api.completeProfile(payload)),
        [startSession]
    )

    const value = useMemo(
        () => ({
            user,
            isAuthenticated: Boolean(user),
            login,
            register,
            logout,
            updateUser,
        }),
        [user, login, register, logout, updateUser]
    )

    return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
    const ctx = useContext(AuthCtx)

    if (!ctx) {
        throw new Error('useAuth must be used within <AuthProvider>')
    }

    return ctx
}