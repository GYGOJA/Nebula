export function formatBytes(bytes, locale) {
    const value = Number(bytes)

    if (!Number.isFinite(value) || value < 0) return ''
    if (value < 1024) return `${value} B`

    const units = ['KB', 'MB', 'GB']
    let size = value / 1024
    let unit = 0

    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024
        unit += 1
    }

    return `${size.toLocaleString(locale, { maximumFractionDigits: size < 10 ? 1 : 0 })} ${units[unit]}`
}

export function formatDuration(ms) {
    const total = Math.max(0, Math.round((Number(ms) || 0) / 1000))
    const minutes = Math.floor(total / 60)
    const seconds = String(total % 60).padStart(2, '0')

    return `${minutes}:${seconds}`
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const MAX_FILES = 10
