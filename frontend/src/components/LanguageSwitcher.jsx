import { useI18n } from '@/i18n'
import CustomSelect from '@/components/CustomSelect'

export default function LanguageSwitcher() {
  const { t, language, languages, setLanguage } = useI18n()
  return <CustomSelect className="language-switcher" value={language} ariaLabel={t('settings.language')} options={languages.map((item) => ({ value: item.code, label: item.label }))} onChange={setLanguage} />
}
