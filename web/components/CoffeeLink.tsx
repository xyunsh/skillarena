/** Buy Me a Coffee: a plain link (no third-party widget script). Outbound clicks are counted by the site's own beacon. */
export const COFFEE_URL = 'https://buymeacoffee.com/xyunsh';

export const CoffeeIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
        <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
        <path d="M7 2v2M11 2v2M15 2v2" />
    </svg>
);

export function CoffeeLink() {
    return (
        <a className="gh-link coffee-link" href={COFFEE_URL} rel="noopener" target="_blank" aria-label="Support SkillArena on Buy Me a Coffee" title="Buy me a coffee">
            <CoffeeIcon />
            <span className="gh-link-text">Support</span>
        </a>
    );
}
