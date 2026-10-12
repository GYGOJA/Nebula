export default function Logo({
                                 variant = 'static',
                                 size,
                                 className = '',
                                 alt = 'Nebula',
                             }) {
    const src = variant === 'animation'
        ? '/logo_animation.svg'
        : '/logo_static.svg'

    return (
        <img
            src={src}
            alt={alt}
            width={size}
            height={size}
            className={`logo logo--${variant} ${className}`.trim()}
            draggable={false}
        />
    )
}
