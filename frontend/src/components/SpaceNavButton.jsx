import { useI18n } from '@/i18n'
import Icon from '@/assets/icon/Icon.jsx'

export const SPACE_NAV_EVENT = 'nebula:space-nav'

// Mobile only: opens the channel list / group settings drawer (the sidebar is hidden on phones).
export default function SpaceNavButton() {
    const { t } = useI18n()

    return (
        <button
            type="button"
            className="space-nav-btn"
            title={t('spacenav.open')}
            aria-label={t('spacenav.open')}
            onClick={() => window.dispatchEvent(new CustomEvent(SPACE_NAV_EVENT))}
        >
            <Icon name="hash" />
        </button>
    )
}
