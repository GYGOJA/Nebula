import { Link, useLocation } from 'react-router-dom'
import { useI18n } from '@/i18n'
import { useCall } from '@/context/CallContext'
import Avatar from '@/components/Avatar'
import Icon from '@/assets/icon/Icon.jsx'
import { CallControls } from '@/components/VoiceStage'

export default function CallOverlay() {
    const { t } = useI18n()
    const location = useLocation()
    const { active, status, incoming, notice, dismissNotice, acceptIncoming, declineIncoming } = useCall()

    const stagePath = active
        ? active.kind === 'call'
            ? `/app/dm/${active.peer?.id}`
            : `/app/voice/${active.roomId}`
        : ''
    const showDock = Boolean(active) && location.pathname !== stagePath

    const peerName = incoming?.peer?.displayName || incoming?.peer?.name || ''

    return (
        <>
            {incoming && (
                <div className="incoming-call" role="alertdialog" aria-live="assertive" aria-label={peerName}>
                    <Avatar
                        src={incoming.peer?.avatarUrl || incoming.peer?.avatar}
                        label={peerName}
                        size={72}
                        className="incoming-call__avatar"
                    />

                    <div className="incoming-call__text">
                        <strong>{peerName}</strong>
                        <span>
                            {incoming.video
                                ? t('call.incomingVideo', { name: peerName })
                                : t('call.incoming', { name: peerName })}
                        </span>
                    </div>

                    <div className="incoming-call__actions">
                        <button
                            type="button"
                            className="incoming-call__btn incoming-call__btn--accept"
                            onClick={acceptIncoming}
                            title={t('call.accept')}
                            aria-label={t('call.accept')}
                        >
                            <Icon name="phone" />
                        </button>

                        <button
                            type="button"
                            className="incoming-call__btn incoming-call__btn--decline"
                            onClick={declineIncoming}
                            title={t('call.decline')}
                            aria-label={t('call.decline')}
                        >
                            <Icon name="phone-off" />
                        </button>
                    </div>
                </div>
            )}

            {showDock && (
                <div className="call-dock" role="region" aria-label={active.name}>
                    <Link to={stagePath} className="call-dock__info">
                        <span className="call-dock__state">
                            {status === 'ringing'
                                ? t('call.calling', { name: active.name })
                                : status === 'connecting'
                                    ? t('call.connecting')
                                    : t('voice.connected')}
                        </span>
                        <span className="call-dock__name">{active.name}</span>
                    </Link>

                    <CallControls variant="dock" />
                </div>
            )}

            {notice && (
                <button type="button" className="call-notice" onClick={dismissNotice} role="status">
                    {notice}
                </button>
            )}
        </>
    )
}
