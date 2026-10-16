import { useEffect, useRef, useState } from 'react'
import Icon from '@/assets/icon/Icon.jsx'
import ChevronDown from '@/assets/icon/chevron-down.svg'
import ChevronUp from '@/assets/icon/chevron-up.svg'

export default function ThemeSelect({ id, value, options, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const selected = options.find((option) => option.value === value) || options[0]

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <div className={`nebula-select ${open ? 'is-open' : ''}`} ref={rootRef} id={id}>
      <button type="button" className="nebula-select__trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} onClick={() => setOpen((current) => !current)}>
        <span>{selected?.label}</span><img className="nebula-select__chevron" src={open ? ChevronUp : ChevronDown} alt="" aria-hidden="true" />
      </button>
      {open && <div className="nebula-select__menu" role="listbox" aria-label={ariaLabel}>
        {options.map((option) => (
          <button type="button" role="option" aria-selected={option.value === value} key={option.value} className={`nebula-select__option ${option.value === value ? 'is-selected' : ''}`} onClick={() => { onChange(option.value); setOpen(false) }}>
            <span>{option.label}</span>{option.value === value && <Icon name="check" />}
          </button>
        ))}
      </div>}
    </div>
  )
}
