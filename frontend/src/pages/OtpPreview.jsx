import { useState } from 'react'
import OtpInput from '@/components/OtpInput'

const phases = [
    { value: 'idle', label: 'Ввод кода' },
    { value: 'fan', label: 'Разлёт цифр' },
    { value: 'stack', label: 'Сборка' },
    { value: 'checking', label: 'Проверка' },
    { value: 'success', label: 'Успех' },
    { value: 'error', label: 'Ошибка' },
]

export default function OtpPreview() {
    const [phase, setPhase] = useState('idle')
    const [code, setCode] = useState('123456')

    const play = async () => {
        setCode('123456')
        setPhase('fan')
        await new Promise((resolve) => setTimeout(resolve, 650))
        setPhase('stack')
        await new Promise((resolve) => setTimeout(resolve, 550))
        setPhase('checking')
        await new Promise((resolve) => setTimeout(resolve, 1400))
        setPhase('success')
    }

    return (
        <main className="otp-preview">
            <section className="otp-preview__card">
                <p className="otp-preview__eyebrow">NEBULA · ANIMATION TEST</p>
                <h1>Проверка кода</h1>
                <p className="otp-preview__lead">Проверь анимацию цифр, проверку кода и отображение галочки.</p>
                <OtpInput length={6} value={code} onChange={setCode} phase={phase} />
                <p className="otp-preview__status" aria-live="polite">
                    {phase === 'idle' && 'Введите код или выберите состояние ниже.'}
                    {phase === 'fan' && 'Цифры разлетаются…'}
                    {phase === 'stack' && 'Цифры собираются…'}
                    {phase === 'checking' && 'Проверяем код…'}
                    {phase === 'success' && 'Код подтверждён'}
                    {phase === 'error' && 'Неверный код'}
                </p>
                <div className="otp-preview__actions">
                    <button type="button" onClick={play}>Проиграть анимацию</button>
                    {phases.map((item) => (
                        <button key={item.value} type="button" className={phase === item.value ? 'is-active' : ''} onClick={() => setPhase(item.value)}>{item.label}</button>
                    ))}
                </div>
            </section>
        </main>
    )
}
