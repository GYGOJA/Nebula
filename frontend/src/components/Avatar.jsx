import { useI18n } from '@/i18n'
import { assetUrl } from '@/api/client'

export default function Avatar({
                                   src,
                                   label = '',
                                   size = 40,
                                   className = '',
                               }) {
    const { t } = useI18n()
    const classes = ['avatar', className].filter(Boolean).join(' ')

    return (
        <span
            className={classes}
            style={{
                width: size,
                height: size,
                flexBasis: size,
            }}
            aria-label={label || t('common.userAvatar')}
        >
            {src ? (
                <img
                    className="avatar__image"
                    src={assetUrl(src)}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                        event.currentTarget.style.display = 'none'
                    }}
                />
            ) : (
                <span
                    className="icon-placeholder avatar__placeholder"
                    aria-hidden="true"
                />
            )}
        </span>
    )
}