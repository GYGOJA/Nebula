import { useRef } from 'react'
import { useI18n } from '@/i18n'
import Icon from "@/assets/icon/Icon.jsx";

export default function OtpInput({
                                     length = 6,
                                     value = '',
                                     onChange,
                                     disabled = false,
                                     phase = 'idle',
                                 }) {
    const { t } = useI18n()
    const refs = useRef([])
    const latest = useRef(value)
    latest.current = value
    const cells = value.split('').concat(Array(length).fill('')).slice(0, length)
    const locked = disabled || phase !== 'idle' && phase !== 'error'

    const handleChange = (i, val) => {
        const digit = val.replace(/\D/g, '').slice(-1)

        const next = latest.current.split('').concat(Array(length).fill('')).slice(0, length)
        next[i] = digit

        const joined = next.join('')
        latest.current = joined
        onChange(joined)

        if (digit && i < length - 1) {
            refs.current[i + 1]?.focus()
        }
    }

    const handleKeyDown = (i, e) => {
        if (e.key === 'Backspace' && !cells[i] && i > 0) {
            refs.current[i - 1]?.focus()
        }
    }

    const handlePaste = (e) => {
        e.preventDefault()

        const text = (e.clipboardData.getData('text') || '')
            .replace(/\D/g, '')
            .slice(0, length)

        latest.current = text
        onChange(text)
        refs.current[Math.min(text.length, length - 1)]?.focus()
    }

    return (
        <div
            className="otp"
            data-phase={phase}
            style={{ '--n': length }}
        >
            {cells.map((c, i) => (
                <input
                    key={i}
                    ref={(el) => {
                        refs.current[i] = el
                    }}
                    className={`otp__cell${c ? ' is-filled' : ''}`}
                    style={{ '--o': i - (length - 1) / 2, '--k': i }}
                    value={c}
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    autoFocus={i === 0}
                    maxLength={1}
                    disabled={locked}
                    aria-label={t('auth.otpDigit', { index: i + 1, length })}
                    aria-invalid={phase === 'error' ? 'true' : undefined}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={handlePaste}
                />
            ))}

            <span className="otp__result" aria-hidden="true">
                <span className="otp__spinner" />
                <Icon name="check" />
            </span>
        </div>
    )
}
