import { useI18n } from '@/i18n'
import { useCall } from '@/context/CallContext'
import Avatar from '@/components/Avatar'
import Icon from '@/assets/icon/Icon.jsx'

export default function CallOverlay() {
    const { t } = useI18n()
    const { incoming, notice, dismissNotice, acceptIncoming, declineIncoming } = useCall()

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
                            <span className="incoming-call__label">{t('call.accept')}</span>
                        </button>

                        <button
                            type="button"
                            className="incoming-call__btn incoming-call__btn--decline"
                            onClick={declineIncoming}
                            title={t('call.decline')}
                            aria-label={t('call.decline')}
                        >
                            <Icon name="phone-off" />
                            <span className="incoming-call__label">{t('call.decline')}</span>
                        </button>
                    </div>
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
