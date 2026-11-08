// Logo A (the matrix: outlined control row, one orange result) + wordmark with the orange "A" of Arena.
// The mark is inlined so it needs no extra request; the same SVG is public/favicon.svg.
export function Logo() {
    const o = { fill: 'none', stroke: '#fff', strokeOpacity: 0.55, strokeWidth: 1.4 } as const;
    return (
        <a className="brand" href="/" aria-label="SkillArena home">
            <svg className="brand-mark" width="30" height="30" aria-hidden="true" focusable="false" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="8" fill="#18181b" />
                <rect x="6.5" y="6.5" width="5" height="5" rx="1.2" {...o} />
                <rect x="13.5" y="6.5" width="5" height="5" rx="1.2" {...o} />
                <rect x="20.5" y="6.5" width="5" height="5" rx="1.2" {...o} />
                <rect x="6" y="13" width="6" height="6" rx="1.5" fill="#fff" />
                <rect x="13" y="13" width="6" height="6" rx="1.5" fill="#fff" />
                <rect x="20" y="13" width="6" height="6" rx="1.5" fill="#ff5a1f" />
                <rect x="6" y="20" width="6" height="6" rx="1.5" fill="#fff" />
                <rect x="13" y="20" width="6" height="6" rx="1.5" fill="#fff" />
                <rect x="20" y="20" width="6" height="6" rx="1.5" fill="#fff" />
            </svg>
            <span className="brand-word" aria-hidden="true">
                Skill<span className="brand-a">A</span>rena
            </span>
        </a>
    );
}
