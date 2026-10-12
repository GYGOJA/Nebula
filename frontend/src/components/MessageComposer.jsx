import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/i18n'
import { canRecordVoice, useVoiceRecorder } from '@/hooks/useVoiceRecorder'
import { formatBytes, formatDuration, MAX_FILE_BYTES, MAX_FILES } from '@/utils/format'

function Chip({ file, onRemove, disabled, language }) {
    const isImage = file.type.startsWith('image/')
    const preview = useMemo(() => (isImage ? URL.createObjectURL(file) : ''), [file, isImage])

    useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

    return (
        <div className="composer-chip">
            {preview ? (
                <img className="composer-chip__thumb" src={preview} alt="" />
            ) : (
                <span className="composer-chip__thumb composer-chip__thumb--file" aria-hidden="true">
                    {(file.name.split('.').pop() || '').slice(0, 4).toUpperCase() || '•'}
                </span>
            )}

            <span className="composer-chip__info">
                <span className="composer-chip__name">{file.name}</span>
                <span className="composer-chip__size">{formatBytes(file.size, language)}</span>
            </span>

            <button type="button" className="composer-chip__x" onClick={onRemove} disabled={disabled} aria-label="×">
                ×
            </button>
        </div>
    )
}

export default function MessageComposer({
    placeholder,
    onSend,
    disabled = false,
    allowAttachments = false,
}) {
    const { t, language } = useI18n()
    const resolvedPlaceholder = placeholder ?? t('messages.placeholder')
    const [text, setText] = useState('')
    const [files, setFiles] = useState([])
    const [sending, setSending] = useState(false)
    const [progress, setProgress] = useState(null)
    const [notice, setNotice] = useState('')
    const [dragging, setDragging] = useState(false)
    const fileInput = useRef(null)
    const textarea = useRef(null)
    const dragDepth = useRef(0)
    const voice = useVoiceRecorder()
    const voiceSupported = allowAttachments && canRecordVoice()

    const busy = disabled || sending
    const canSend = !busy && (text.trim() || files.length > 0)

    const addFiles = (list) => {
        if (!allowAttachments || busy) return

        const incoming = Array.from(list || [])
        const accepted = []
        let message = ''

        for (const file of incoming) {
            if (file.size === 0) message = t('attach.empty', { name: file.name })
            else if (file.size > MAX_FILE_BYTES) message = t('attach.tooBig', { name: file.name })
            else accepted.push(file)
        }

        setFiles((current) => {
            const merged = [...current, ...accepted]

            if (merged.length > MAX_FILES) {
                message = t('attach.tooMany', { count: MAX_FILES })
                return merged.slice(0, MAX_FILES)
            }

            return merged
        })

        setNotice(message)
    }

    const submit = async (payload) => {
        setSending(true)
        setProgress(null)
        setNotice('')

        try {
            await onSend(payload.text, payload.options)
            return true
        } catch {
            return false
        } finally {
            setSending(false)
            setProgress(null)
        }
    }

    const handleSend = async () => {
        if (!canSend) return

        const value = text.trim()
        const options = files.length
            ? { files, onProgress: setProgress }
            : undefined

        if (await submit({ text: value, options })) {
            setText('')
            setFiles([])
            textarea.current?.focus()
        }
    }

    const sendVoice = async () => {
        const result = await voice.stop()

        if (!result) return

        await submit({
            text: '',
            options: { files: [result.file], voice: true, duration: result.duration, onProgress: setProgress },
        })
    }

    const handleKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            handleSend()
        }
    }

    const handlePaste = (event) => {
        const pasted = Array.from(event.clipboardData?.files || [])

        if (!pasted.length) return

        event.preventDefault()
        addFiles(pasted)
    }

    const dragProps = allowAttachments
        ? {
            onDragEnter: (event) => {
                if (!event.dataTransfer?.types?.includes('Files')) return
                dragDepth.current += 1
                setDragging(true)
            },
            onDragOver: (event) => {
                if (event.dataTransfer?.types?.includes('Files')) event.preventDefault()
            },
            onDragLeave: () => {
                dragDepth.current = Math.max(0, dragDepth.current - 1)
                if (!dragDepth.current) setDragging(false)
            },
            onDrop: (event) => {
                event.preventDefault()
                dragDepth.current = 0
                setDragging(false)
                addFiles(event.dataTransfer.files)
            },
        }
        : {}

    const voiceError = voice.error
        ? t(voice.error === 'denied' ? 'attach.micDenied' : 'attach.micUnavailable')
        : ''

    return (
        <div className={`chat__composer ${dragging ? 'chat__composer--drag' : ''}`} {...dragProps}>
            {dragging && <div className="composer-drop">{t('attach.dropHere')}</div>}

            {files.length > 0 && (
                <div className="composer-chips">
                    {files.map((file, index) => (
                        <Chip
                            key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                            file={file}
                            language={language}
                            disabled={sending}
                            onRemove={() => setFiles((list) => list.filter((_, i) => i !== index))}
                        />
                    ))}
                </div>
            )}

            {sending && progress != null && (
                <div className="composer-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
                    <div style={{ width: `${progress * 100}%` }} />
                </div>
            )}

            {(notice || voiceError) && <p className="composer-notice">{notice || voiceError}</p>}

            <div className="chat__composer-inner">
                {voice.recording ? (
                    <>
                        <button
                            type="button"
                            className="composer-btn composer-btn--danger"
                            onClick={voice.cancel}
                            title={t('attach.cancelRecording')}
                            aria-label={t('attach.cancelRecording')}
                        >
                            ✕
                        </button>

                        <div className="composer-recording" aria-live="polite">
                            <span className="composer-recording__dot" aria-hidden="true" />
                            <span>{t('attach.recording')}</span>
                            <span className="composer-recording__time">{formatDuration(voice.elapsed)}</span>
                        </div>

                        <button
                            type="button"
                            className="chat__composer-send"
                            onClick={sendVoice}
                            title={t('messages.send')}
                            aria-label={t('attach.sendVoice')}
                        >
                            <span className="icon-placeholder" aria-hidden="true" />
                        </button>
                    </>
                ) : (
                    <>
                        {allowAttachments && (
                            <>
                                <button
                                    type="button"
                                    className="composer-btn"
                                    onClick={() => fileInput.current?.click()}
                                    disabled={busy || files.length >= MAX_FILES}
                                    title={t('attach.add')}
                                    aria-label={t('attach.add')}
                                >
                                    +
                                </button>
                                <input
                                    ref={fileInput}
                                    type="file"
                                    multiple
                                    hidden
                                    onChange={(event) => {
                                        addFiles(event.target.files)
                                        event.target.value = ''
                                    }}
                                />
                            </>
                        )}

                        <textarea
                            ref={textarea}
                            className="chat__composer-input"
                            placeholder={resolvedPlaceholder}
                            value={text}
                            disabled={busy}
                            onChange={(event) => setText(event.target.value)}
                            onKeyDown={handleKeyDown}
                            onPaste={allowAttachments ? handlePaste : undefined}
                            rows={1}
                            aria-label={resolvedPlaceholder}
                        />

                        {voiceSupported && !text.trim() && files.length === 0 ? (
                            <button
                                type="button"
                                className="chat__composer-send"
                                onClick={voice.start}
                                disabled={busy}
                                title={t('attach.record')}
                                aria-label={t('attach.record')}
                            >
                                🎤
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="chat__composer-send"
                                onClick={handleSend}
                                disabled={!canSend}
                                title={t('messages.send')}
                                aria-label={t('messages.sendLabel')}
                            >
                                <span className="icon-placeholder" aria-hidden="true" />
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
