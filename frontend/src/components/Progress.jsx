export default function Progress({ step = 1, total = 3, ...rest }) {
    return (
        <div className="progress" {...rest}>
            {Array.from({ length: total }).map((_, i) => (
                <span
                    key={i}
                    className={`progress__seg ${i < step ? 'progress__seg--active' : ''}`}
                />
            ))}
        </div>
    )
}
