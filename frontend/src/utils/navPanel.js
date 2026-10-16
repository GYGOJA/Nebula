import { useSyncExternalStore } from 'react'

function createPanel() {
    let open = false
    const listeners = new Set()
    const emit = () => listeners.forEach((listener) => listener())

    const panel = {
        get: () => open,

        set(value) {
            if (open === value) return
            open = value
            emit()
        },

        toggle() {
            panel.set(!open)
        },

        close() {
            panel.set(false)
        },

        subscribe(listener) {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },
    }

    return panel
}

export const navPanel = createPanel()
export const rightPanel = createPanel()
// Phone-only left drawer with spaces and direct messages.
export const menuPanel = createPanel()

export function usePanel(panel) {
    return useSyncExternalStore(panel.subscribe, panel.get, () => false)
}

export const useNavPanel = () => usePanel(navPanel)
export const useRightPanel = () => usePanel(rightPanel)
export const useMenuPanel = () => usePanel(menuPanel)
