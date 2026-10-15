import { useState } from 'react'
import { useI18n } from '@/i18n'
import Icon from "@/assets/icon/Icon.jsx";

export default function Avatar({
                                   src,
                                   label = '',
                                   size = 40,
                                   className = '',
                               }) {
    const { t } = useI18n()
    const [failedSrc, setFailedSrc] = useState(null)
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
            {src && src !== failedSrc ? (
                <img
                    className="avatar__image"
                    src={src}
                    alt=""
                    loading="lazy"
                    onError={() => setFailedSrc(src)}
                />
            ) : (
                <Icon name="user" className="avatar__placeholder" />
            )}
        </span>
    )
}
