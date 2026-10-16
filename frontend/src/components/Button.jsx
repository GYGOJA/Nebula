export default function Button({
                                   children,
                                   variant = 'primary',
                                   fullWidth = false,
                                   lg = false,
                                   loading = false,
                                   disabled = false,
                                   ...rest
                               }) {
    const classes = ['btn', `btn--${variant}`]

    if (fullWidth) classes.push('btn--full')
    if (lg) classes.push('btn--lg')

    return (
        <button
            className={classes.join(' ')}
            disabled={disabled || loading}
            {...rest}
        >
            {loading ? '…' : children}
        </button>
    )
}
