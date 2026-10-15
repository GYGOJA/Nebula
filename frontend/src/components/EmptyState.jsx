import Icon from "@/assets/icon/Icon.jsx";

export default function EmptyState({ icon, title, description, action }) {
    return (
        <div className="empty-state">
            {icon && <Icon name={icon} className="empty-state__icon" />}

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