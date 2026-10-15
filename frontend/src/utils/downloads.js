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
    } catch {  }
}

export function clearDownloads() {
    try {
        localStorage.removeItem(KEY)
        window.dispatchEvent(new CustomEvent('nebula:downloads'))
    } catch {  }
}
