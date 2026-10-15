import { useCallback, useEffect, useState } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { AuthProvider } from './context/AuthContext'
import SplashScreen from './components/SplashScreen'

function readPreferences() {
    try {
        return JSON.parse(localStorage.getItem('nebula_settings') || '{}')
    } catch {
        return {}
    }
}

function applyPreferences() {
    const preferences = readPreferences()
    const theme = preferences.theme || 'dark'

    const resolvedTheme = String(theme).startsWith('light') ? 'light' : 'dark'

    document.documentElement.dataset.theme = resolvedTheme
    document.documentElement.dataset.mascotBackground =
        String(theme).endsWith('-mascot') ? 'on' : 'off'
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    applyPreferences()
}

export default function App() {
    const [booted, setBooted] = useState(false)
    const handleReady = useCallback(() => setBooted(true), [])

    const syncPreferences = useCallback(() => {
        applyPreferences()
    }, [])

    useEffect(() => {
        const handleStorage = (event) => {
            if (event.key === 'nebula_settings') {
                syncPreferences()
            }
        }

        const handleFocus = () => {
            syncPreferences()
        }

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                syncPreferences()
            }
        }

        const handleSystemThemeChange = () => {
            if (readPreferences().theme === 'system') {
                syncPreferences()
            }
        }

        const media = window.matchMedia('(prefers-color-scheme: light)')

        window.addEventListener('storage', handleStorage)
        window.addEventListener('focus', handleFocus)
        document.addEventListener('visibilitychange', handleVisibility)
        media.addEventListener?.('change', handleSystemThemeChange)

        return () => {
            window.removeEventListener('storage', handleStorage)
            window.removeEventListener('focus', handleFocus)
            document.removeEventListener('visibilitychange', handleVisibility)
            media.removeEventListener?.('change', handleSystemThemeChange)
        }
    }, [syncPreferences])

    return (
        <AuthProvider>
            {booted && <RouterProvider router={router} />}
            <SplashScreen onReady={handleReady} />
        </AuthProvider>
    )
}
