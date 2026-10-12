export default function EmptyState({ title, description, action }) {
    return (
        <div className="empty-state">
            <span
                className="icon-placeholder empty-state__icon"
                aria-hidden="true"
            />

            {title && (
                <h3 className="empty-state__title">{title}</h3>
            )}

            {description && (
                <p className="empty-state__desc">{description}</p>
            )}

            {action && (
                <div className="empty-state__action">{action}</div>
            )}
        </div>
    )
}