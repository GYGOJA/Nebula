import { useI18n } from '@/i18n'

// "Whole group / this channel" switch shared by the Files and Threads tabs.
export default function PanelScope({ scope, onChange }) {
    const { t } = useI18n()

    return (
        <div className="spanel-scope" role="group">
            {['space', 'channel'].map((id) => (
                <button
                    key={id}
                    type="button"
                    className={`spanel-scope__btn${scope === id ? ' is-active' : ''}`}
                    aria-pressed={scope === id}
                    onClick={() => onChange(id)}
                >
                    {t(id === 'space' ? 'panel.scopeSpace' : 'panel.scopeChannel')}
                </button>
            ))}
        </div>
    )
}
