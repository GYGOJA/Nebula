import { useEffect } from 'react'
import { useI18n } from '@/i18n'
import { rightPanel, useRightPanel } from '@/utils/navPanel'
import Icon from '@/assets/icon/Icon.jsx'

export const canHover = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches

// The slide-out panel shared by the home screens and the channel screens:
// handle, sliding accent tab on the rail, hover-to-open, mobile drawer and backdrop.
// `tabs` is [{ id, icon, labelKey }]; the caller renders the body as `children`.
export default function RightPanel({ tabs, tab, onTabChange, className = '', children }) {
    const { t } = useI18n()
    const panelOpen = useRightPanel()
    const tabIndex = Math.max(tabs.findIndex((item) => item.id === tab), 0)

    useEffect(() => {
        rightPanel.close()
    }, [])

    useEffect(() => {
        if (!panelOpen) return undefined

        const onKeyDown = (event) => {
            if (event.key === 'Escape') rightPanel.close()
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [panelOpen])

    const selectTab = (id) => {
        onTabChange(id)

        if (!canHover()) rightPanel.set(true)
    }

    return (
        <>
            <button
                type="button"
                className={`rightbar-backdrop${panelOpen ? ' is-open' : ''}`}
                aria-label={t('rightbar.close')}
                tabIndex={-1}
                onClick={rightPanel.close}
            />

            <aside
                className={`rightbar${panelOpen ? ' rightbar--open' : ''}${className ? ` ${className}` : ''}`}
                style={{ '--i': tabIndex, '--n': tabs.length }}
                onMouseLeave={() => {
                    if (canHover()) {
                        rightPanel.close()

                        const active = document.activeElement
                        if (active instanceof HTMLElement && active.closest('.rightbar')) {
                            active.blur()
                        }
                    }
                }}
            >
                <button
                    type="button"
                    className="rightbar__handle"
                    onClick={rightPanel.toggle}
                    aria-label={t('rightbar.open')}
                    aria-expanded={panelOpen}
                >
                    <Icon name="users" />
                </button>

                <div className="rightbar__panel">
                    <div className="rightbar__body">
                        <h2 className="rightbar__title">
                            {t(tabs[tabIndex].labelKey)}
                            <button
                                type="button"
                                className="rightbar__close"
                                onClick={rightPanel.close}
                                aria-label={t('rightbar.close')}
                            >
                                <Icon name="x" />
                            </button>
                        </h2>

                        {children}
                    </div>

                    <div className="rightbar__rail" role="tablist" aria-orientation="vertical">
                        <span className="rightbar__slider" aria-hidden="true" />

                        {tabs.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                role="tab"
                                aria-selected={tab === item.id}
                                title={t(item.labelKey)}
                                className={`rightbar__rail-btn${tab === item.id ? ' is-active' : ''}`}
                                onClick={() => selectTab(item.id)}
                            >
                                <Icon name={item.icon} />
                                <span className="rightbar__rail-label">{t(item.labelKey)}</span>
                            </button>
                        ))}

                        <button
                            type="button"
                            className="rightbar__rail-close"
                            onClick={rightPanel.close}
                            aria-label={t('rightbar.close')}
                        >
                            <Icon name="x" />
                        </button>
                    </div>
                </div>
            </aside>
        </>
    )
}
