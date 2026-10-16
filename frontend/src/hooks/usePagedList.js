import { useCallback, useEffect, useRef, useState } from 'react'

// Paged list for the side panel. `fetchPage(offset)` resolves to { items, hasMore }.
// The list reloads from the start whenever `deps` change.
export default function usePagedList(fetchPage, deps = []) {
    const [state, setState] = useState({ items: [], hasMore: false, loading: true, loadingMore: false, error: '' })
    const fetchRef = useRef(fetchPage)
    const itemsRef = useRef([])
    const requestRef = useRef(0)
    const timerRef = useRef(0)

    fetchRef.current = fetchPage
    itemsRef.current = state.items

    const reload = useCallback(async ({ silent = false } = {}) => {
        const request = ++requestRef.current

        if (!silent) setState((previous) => ({ ...previous, loading: true, error: '' }))

        try {
            const page = await fetchRef.current(0)

            if (request !== requestRef.current) return

            setState({ items: page.items, hasMore: page.hasMore, loading: false, loadingMore: false, error: '' })
        } catch (error) {
            if (request !== requestRef.current) return

            setState((previous) => ({
                ...previous,
                loading: false,
                loadingMore: false,
                error: error?.message || 'error',
            }))
        }
    }, [])

    const loadMore = useCallback(async () => {
        const request = ++requestRef.current

        setState((previous) => ({ ...previous, loadingMore: true }))

        try {
            const page = await fetchRef.current(itemsRef.current.length)

            if (request !== requestRef.current) return

            setState((previous) => ({
                ...previous,
                items: [...previous.items, ...page.items],
                hasMore: page.hasMore,
                loadingMore: false,
            }))
        } catch {
            if (request === requestRef.current) setState((previous) => ({ ...previous, loadingMore: false }))
        }
    }, [])

    // Debounced silent refresh for realtime events.
    const scheduleReload = useCallback(() => {
        window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => reload({ silent: true }), 600)
    }, [reload])

    useEffect(() => {
        reload()

        return () => {
            window.clearTimeout(timerRef.current)
            requestRef.current += 1
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps)

    return { ...state, reload, loadMore, scheduleReload }
}
