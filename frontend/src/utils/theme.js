export function resolveAppearance(theme) {
    const value = String(theme || 'dark')
    const base = value === 'system'
        ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
        : value
    return {
        theme: base.startsWith('light') ? 'light' : 'dark',
        mascot: base.endsWith('-mascot'),
    }
}
