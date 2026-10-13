import { useSyncExternalStore } from 'react'

/*
 * Tiny shared store for the slide-over navigation panel used on tablets.
 * The rail (toggle button) and the sidebar (panel) are siblings rendered by
 * every page, so they share the open/closed state through this module.
 */
let open = false
const listeners = new Set()

const emit = () => listeners.forEach((listener) => listener())

export const navPanel = {
    get: () => open,

    set(value) {
        if (open === value) return
        open = value
        emit()
    },

    toggle() {
        navPanel.set(!open)
    },

    close() {
        navPanel.set(false)
    },

    subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
    },
}

export function useNavPanel() {
    return useSyncExternalStore(navPanel.subscribe, navPanel.get, () => false)
}
