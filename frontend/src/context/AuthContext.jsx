import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react'
import { api } from '@/api'
import { session, UNAUTHORIZED_EVENT } from '@/api/client'
import { t } from '@/i18n'

const AuthCtx = createContext(null)
const restoreUser = () => (session.getToken() ? session.getUser() : null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(restoreUser)

    const logout = useCallback(() => {
        session.clear()
        setUser(null)
    }, [])

    const startSession = useCallback((payload) => {
        const { user: nextUser, token } = payload || {}

        if (!nextUser || !token) {
            throw new Error(t('errors.badResponse'))
        }

        session.save(token, nextUser)
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

    const updateUser = useCallback((patch) => {
        setUser((previous) => {
            const next = { ...(previous || {}), ...patch }
            const token = session.getToken()
            if (token) session.save(token, next)
            return next
        })
    }, [])

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