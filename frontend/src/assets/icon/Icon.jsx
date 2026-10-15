import { ICONS } from '@/assets/icon/index.js'

const toCssUrl = (url) =>
    `url("${url.replace(/"/g, '%22').replace(/#/g, '%23')}")`

export default function Icon({ name, className = '', ...props }) {
    const url = ICONS[name]

    if (!url) return null

    return (
        <span
            className={`icon ${className}`.trim()}
            style={{ '--icon-url': toCssUrl(url) }}
            aria-hidden="true"
            {...props}
        />
    )
}
