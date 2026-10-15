import { useEffect, useRef } from 'react'



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


export function emitAppEvent(type, data = {}) {
    window.dispatchEvent(new CustomEvent('nebula:event', { detail: { type, data } }))
}
