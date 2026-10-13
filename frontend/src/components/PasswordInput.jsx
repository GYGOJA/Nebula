import { useState } from 'react'
import { useI18n } from '@/i18n'
import Icon from "@/assets/icon/Icon.jsx";

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
                    <Icon name={visible ? 'eye-off' : 'eye'} />
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
                <Icon name={visible ? 'eye-off' : 'eye'} />
            </button>
        </div>
    )
}
