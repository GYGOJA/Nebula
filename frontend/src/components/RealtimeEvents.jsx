import { useEffect } from 'react'
import { API_URL, session, UNAUTHORIZED_EVENT } from '@/api/client'

export default function RealtimeEvents() {
    useEffect(() => {
        let closed = false
        let retryTimer = null
        let controller = null

        const connect = async () => {
            while (!closed) {
                const token = session.getToken()
                if (!token) return
                controller = new AbortController()
                try {
                    const response = await fetch(`${API_URL}/events`, {
                        headers: { Authorization: `Bearer ${token}` },
                        signal: controller.signal,
                    })
                    if (response.status === 401) {
                        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
                        return
                    }
                    if (!response.ok || !response.body) throw new Error('Event stream unavailable')
                    const reader = response.body.getReader()
                    const decoder = new TextDecoder()
                    let buffer = ''
                    while (!closed) {
                        const { value, done } = await reader.read()
                        if (done) break
                        buffer += decoder.decode(value, { stream: true })
                        const blocks = buffer.split(/\r?\n\r?\n/)
                        buffer = blocks.pop() || ''
                        for (const block of blocks) {
                            let type = 'message'
                            const dataLines = []
                            for (const line of block.split(/\r?\n/)) {
                                if (line.startsWith('event:')) type = line.slice(6).trim()
                                if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
                            }
                            if (!dataLines.length) continue
                            try {
                                const data = JSON.parse(dataLines.join('\n'))
                                window.dispatchEvent(new CustomEvent('nebula:event', { detail: { type, data } }))
                            } catch {}
                        }
                    }
                    if (!closed) throw new Error('Event stream closed')
                } catch {
                    if (closed || controller?.signal.aborted) return
                    await new Promise((resolve) => {
                        retryTimer = window.setTimeout(resolve, 2500)
                    })
                }
            }
        }

        connect()
        return () => {
            closed = true
            controller?.abort()
            if (retryTimer) window.clearTimeout(retryTimer)
        }
    }, [])

    return null
}
