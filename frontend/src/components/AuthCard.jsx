import Logo from './Logo'

export default function AuthCard({
                                     title,
                                     subtitle,
                                     children,
                                     footer,
                                     showLogo = true,
                                     logoVariant = 'static',
                                     variant,
                                 }) {
    const classes = ['auth-card']

    if (variant === 'narrow') classes.push('auth-card--narrow')
    if (variant === 'wide') classes.push('auth-card--wide')

    return (
        <div className={classes.join(' ')}>
            <div className="auth-card__head">
                <h1 className="auth-card__title">{title}</h1>

                {showLogo && (
                    <div className="auth-card__logo">
                        <Logo
                            variant={logoVariant}
                            size={variant === 'wide' ? 180 : 120}
                        />
                    </div>
                )}
            </div>

            {subtitle && (
                <p className="auth-card__subtitle">{subtitle}</p>
            )}

            <div className="auth-card__body">{children}</div>

            {footer && (
                <div className="auth-card__footer">{footer}</div>
            )}
        </div>
    )
}
