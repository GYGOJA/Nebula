export default function Input({
                                  label,
                                  error,
                                  hint,
                                  wrapClassName = '',
                                  ...rest
                              }) {
    return (
        <label className="field">
            {label && (
                <span className="field__label">{label}</span>
            )}

            <span
                className={`field__wrap ${error ? 'field__wrap--error' : ''} ${wrapClassName}`}
            >
                <input className="field__input" {...rest} />
            </span>

            {error && (
                <span className="field__error">{error}</span>
            )}

            {!error && hint && (
                <span className="field__hint">{hint}</span>
            )}
        </label>
    )
}
