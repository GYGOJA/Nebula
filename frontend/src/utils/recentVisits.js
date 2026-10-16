const KEY = 'nebula_recent_visits'

function readVisits() {
    try {
        const value = JSON.parse(localStorage.getItem(KEY) || '{}')
        return value && typeof value === 'object' ? value : {}
    } catch {
        return {}
    }
}

export function markRecentVisit(kind, id) {
    if (!kind || id == null) return
    try {
        const data = readVisits()
        const group = data[kind] && typeof data[kind] === 'object' ? data[kind] : {}
        group[String(id)] = Date.now()
        data[kind] = group
        localStorage.setItem(KEY, JSON.stringify(data))
        window.dispatchEvent(new CustomEvent('nebula:recent-visits-updated'))
    } catch {}
}

export function sortByRecentVisit(items, kind) {
    const timestamps = readVisits()[kind] || {}
    return [...items].sort((a, b) => {
        const av = Number(timestamps[String(a.id)] || 0)
        const bv = Number(timestamps[String(b.id)] || 0)
        if (av !== bv) return bv - av
        return 0
    })
}
