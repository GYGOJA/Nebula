import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/api'
import { useI18n } from '@/i18n'
import Avatar from '@/components/Avatar'
import { emitAppEvent } from '@/hooks/useAppEvent'

const INVITE_RE = /(?:https?:\/\/[^\s/]+)?\/invite\/([A-Za-z0-9_-]{6,64})/g


export function extractInviteCodes(text) {
    if (typeof text !== 'string' || !text.includes('/invite/')) return []

    const found = []

    for (const match of text.matchAll(INVITE_RE)) {
        if (/^https?:/i.test(match[0])) {
            try {
                if (new URL(match[0]).origin !== window.location.origin) continue
            } catch {
                continue
            }
        }

        if (!found.includes(match[1])) found.push(match[1])
    }

    return found.slice(0, 3)
}

export default function InviteCard({ code }) {
    const { t } = useI18n()
    const [state, setState] = useState({ status: 'loading', space: null, isMember: false, error: '' })
    const [joining, setJoining] = useState(false)

    useEffect(() => {
        let alive = true

        setState({ status: 'loading', space: null, isMember: false, error: '' })

        api.getInvite(code)
            .then((data) => {
                if (!alive) return
                setState({ status: 'ready', space: data.space, isMember: Boolean(data.isMember), error: '' })
            })
            .catch((error) => {
                if (!alive) return
                setState({
                    status: 'error',
                    space: null,
                    isMember: false,
                    error: error?.message || t('invite.card.invalid'),
                })
            })

        return () => {
            alive = false
        }
    }, [code])

    const join = async () => {
        setJoining(true)

        try {
            const data = await api.acceptInvite({ code })

            setState((previous) => ({
                status: 'ready',
                space: data.space || previous.space,
                isMember: true,
                error: '',
            }))
            emitAppEvent('space_updated', { spaceId: data.space?.id })
        } catch (error) {
            setState((previous) => ({ ...previous, error: error?.message || t('invite.acceptFailed') }))
        } finally {
            setJoining(false)
        }
    }

    const { status, space, isMember, error } = state

    return (
        <div className="invite-card">
            <div className="invite-card__label">{t('invite.card.title')}</div>

            {status === 'loading' && <div className="invite-card__muted">{t('invite.checking')}</div>}

            {status === 'error' && <div className="invite-card__error">{error}</div>}

            {status === 'ready' && space && (
                <>
                    <div className="invite-card__row">
                        <span className="invite-card__avatar">
                            {space.avatarUrl ? (
                                <Avatar src={space.avatarUrl} label={space.name} size={48} />
                            ) : (
                                <span className="invite-card__initial">
                                    {(space.name || 'N').slice(0, 1).toUpperCase()}
                                </span>
                            )}
                        </span>

                        <div className="invite-card__info">
                            <strong>{space.name}</strong>
                            {typeof space.members === 'number' && (
                                <span>{t('invite.card.members', { count: space.members })}</span>
                            )}
                        </div>

                        {isMember ? (
                            <Link className="btn btn--ghost invite-card__btn" to={`/app/spaces/${space.id}`}>
                                {t('invite.card.open')}
                            </Link>
                        ) : (
                            <button
                                type="button"
                                className="btn btn--primary invite-card__btn"
                                onClick={join}
                                disabled={joining}
                            >
                                {joining ? t('invite.card.joining') : t('invite.card.join')}
                            </button>
                        )}
                    </div>

                    {error && <div className="invite-card__error">{error}</div>}
                </>
            )}
        </div>
    )
}
