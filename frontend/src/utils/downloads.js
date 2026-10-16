import { fetchBlob } from '@/api/client'

const KEY = 'nebula.downloads'
const MAX = 50

export function readDownloads() {
    try {
        const list = JSON.parse(localStorage.getItem(KEY) || '[]')
        return Array.isArray(list) ? list : []
    } catch {
        return []
    }
}

export function recordDownload(file) {
    try {
        const entry = {
            id: String(file.id || file.url || file.name),
            name: file.name || 'file',
            size: file.size || 0,
            url: file.url || '',
            at: Date.now(),
        }
        const list = [entry, ...readDownloads().filter((item) => item.id !== entry.id)].slice(0, MAX)
        localStorage.setItem(KEY, JSON.stringify(list))
        window.dispatchEvent(new CustomEvent('nebula:downloads'))
    } catch { /* storage unavailable */ }
}

export function clearDownloads() {
    try {
        localStorage.removeItem(KEY)
        window.dispatchEvent(new CustomEvent('nebula:downloads'))
    } catch { /* storage unavailable */ }
}

// Authenticated download of a stored attachment (the browser cannot send the bearer token itself).
export async function saveAttachment(attachment) {
    const href = await fetchBlob(attachment.url, { download: true })
    const link = document.createElement('a')

    link.href = href
    link.download = attachment.name || 'file'
    document.body.appendChild(link)
    link.click()
    link.remove()
    recordDownload(attachment)
}
