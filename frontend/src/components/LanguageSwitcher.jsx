import { useI18n } from '@/i18n'

export default function LanguageSwitcher() {
    const { t, language, languages, setLanguage } = useI18n()

    return (
        <select
            className="language-switcher"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            aria-label={t('settings.language')}
        >
            {languages.map((item) => (
                <option key={item.code} value={item.code}>
                    {item.label}
                </option>
            ))}
        </select>
    )
}
