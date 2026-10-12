import { useState } from 'react'
import { useI18n } from '@/i18n'

function EyeIcon({ className }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <path
                d="M2.5 12C2.5 12 6 6.5 12 6.5C18 6.5 21.5 12 21.5 12C21.5 12 18 17.5 12 17.5C6 17.5 2.5 12 2.5 12Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
            />
            <circle
                cx="12"
                cy="12"
                r="2.8"
                stroke="currentColor"
                strokeWidth="1.8"
            />
        </svg>
    )
}

export default function PasswordInput({
                                          variant = 'login',
                                          invalid = false,
                                          ...inputProps
                                      }) {
    const { t } = useI18n()
    const [visible, setVisible] = useState(false)

    const type = visible ? 'text' : 'password'
    const label = visible ? t('auth.hidePassword') : t('auth.showPassword')
    const toggle = () => setVisible((value) => !value)

    if (variant === 'profile') {
        return (
            <div className={`pass-wrap ${invalid ? 'pass-wrap--error' : ''}`.trim()}>
                <input className="auth-input" type={type} {...inputProps} />

                <button
                    type="button"
                    className="pass-eye"
                    aria-label={label}
                    onClick={toggle}
                >
                    <EyeIcon />
                </button>
            </div>
        )
    }

    return (
        <div className="password-wrapper">
            <input className="input" type={type} {...inputProps} />

            <span className="password-divider" aria-hidden="true" />

            <button
                className="password-toggle"
                type="button"
                aria-label={label}
                onClick={toggle}
            >
                <EyeIcon className="eye-icon" />
            </button>
        </div>
    )
}
