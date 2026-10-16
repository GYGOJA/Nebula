import { useEffect, useRef } from 'react'

// Server-sent events are re-dispatched on `window` as "nebula:event".
// This hook lets any component react to specific event types.
export function useAppEvent(types, handler) {
    const handlerRef = useRef(handler)
    const key = (Array.isArray(types) ? types : [types]).join('|')

    useEffect(() => {
        handlerRef.current = handler
    })

    useEffect(() => {
        const list = key.split('|')

        const onEvent = (event) => {
            const { type, data } = event.detail || {}

            if (list.includes(type)) handlerRef.current?.(data, type)
        }

        window.addEventListener('nebula:event', onEvent)

        return () => window.removeEventListener('nebula:event', onEvent)
    }, [key])
}

// Lets the page that made a change refresh other parts of the UI immediately.
export function emitAppEvent(type, data = {}) {
    window.dispatchEvent(new CustomEvent('nebula:event', { detail: { type, data } }))
}
