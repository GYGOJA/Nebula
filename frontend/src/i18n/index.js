import { useSyncExternalStore } from 'react'
import ru from './locales/ru'
import en from './locales/en'
import de from './locales/de'

export const LANGUAGES = [
    { code: 'ru', label: 'Русский', locale: 'ru-RU' },
    { code: 'en', label: 'English', locale: 'en-US' },
    { code: 'de', label: 'Deutsch', locale: 'de-DE' },
]

export const DEFAULT_LANGUAGE = 'ru'
export const LANGUAGE_STORAGE_KEY = 'nebula_language'

const dictionaries = { ru, en, de }
const listeners = new Set()
const pluralRules = new Map()

const isSupported = (code) => LANGUAGES.some((item) => item.code === code)

function readStoredLanguage() {
    try {
        const value = localStorage.getItem(LANGUAGE_STORAGE_KEY)
        return isSupported(value) ? value : null
    } catch {
        return null
    }
}

function detectBrowserLanguage() {
    if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE

    const candidates = navigator.languages?.length
        ? navigator.languages
        : [navigator.language]

    for (const candidate of candidates) {
        const code = String(candidate || '').toLowerCase().split('-')[0]
        if (isSupported(code)) return code
    }

    return DEFAULT_LANGUAGE
}

let current = readStoredLanguage() || detectBrowserLanguage()

function applyDocumentLanguage() {
    if (typeof document !== 'undefined') {
        document.documentElement.lang = current
    }
}

function update(next) {
    if (next === current) return

    current = next
    applyDocumentLanguage()
    listeners.forEach((listener) => listener())
}

applyDocumentLanguage()

if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
        if (event.key === LANGUAGE_STORAGE_KEY || event.key === null) {
            update(readStoredLanguage() || detectBrowserLanguage())
        }
    })
}

export function getLanguage() {
    return current
}

export function getLocale() {
    return LANGUAGES.find((item) => item.code === current).locale
}

export function setLanguage(code) {
    if (!isSupported(code)) return

    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
    } catch {}

    update(code)
}

function subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

function pluralCategory(count) {
    const locale = getLocale()

    if (!pluralRules.has(locale)) {
        pluralRules.set(locale, new Intl.PluralRules(locale))
    }

    return pluralRules.get(locale).select(count)
}

function interpolate(template, params) {
    return template.replace(/\{(\w+)\}/g, (match, name) => {
        if (!(name in params)) return match

        const value = params[name]

        return typeof value === 'number'
            ? new Intl.NumberFormat(getLocale()).format(value)
            : String(value)
    })
}

export function hasTranslation(key) {
    return dictionaries[current][key] !== undefined
}

export function t(key, params = {}) {
    const entry = dictionaries[current][key] ?? dictionaries[DEFAULT_LANGUAGE][key]

    if (entry === undefined) return key

    const template =
        typeof entry === 'string'
            ? entry
            : entry[pluralCategory(params.count)] ?? entry.other

    return interpolate(template, params)
}

export function useI18n() {
    const language = useSyncExternalStore(subscribe, getLanguage)

    return {
        t,
        language,
        locale: getLocale(),
        languages: LANGUAGES,
        setLanguage,
    }
}
