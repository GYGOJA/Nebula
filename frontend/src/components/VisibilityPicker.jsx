import { useI18n } from '@/i18n'

// Public / private switch for spaces.
export default function VisibilityPicker({ value, onChange, disabled = false }) {
    const { t } = useI18n()
    const options = [
        { id: false, label: t('spaces.private'), hint: t('spaces.privateHint') },
        { id: true, label: t('spaces.public'), hint: t('spaces.publicHint') },
    ]

    return (
        <div className="visibility-picker" role="radiogroup" aria-label={t('spaces.visibility')}>
            {options.map((option) => (
                <button
                    key={String(option.id)}
                    type="button"
                    role="radio"
                    aria-checked={value === option.id}
                    className={`visibility-picker__option${value === option.id ? ' is-active' : ''}`}
                    disabled={disabled}
                    onClick={() => onChange(option.id)}
                >
                    <strong>{option.label}</strong>
                    <span>{option.hint}</span>
                </button>
            ))}
        </div>
    )
}
