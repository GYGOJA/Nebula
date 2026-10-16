export default function PageHeader({ title, subtitle, actions }) {
    return (
        <header className="page-header">
            <div className="page-header__text">
                <h1 className="page-header__title">{title}</h1>
                {subtitle && (
                    <p className="page-header__sub">{subtitle}</p>
                )}
            </div>

            {actions && (
                <div className="page-header__actions">{actions}</div>
            )}
        </header>
    )
}
