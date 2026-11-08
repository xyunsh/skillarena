import { fmtStars, type SkillRow } from '~/lib/data';

const Star = () => (
    <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
    </svg>
);

/** Repo owner: avatar (served by this site) and display name, linked to the repo. */
export function GithubOwner({ skill }: { skill: SkillRow }) {
    const g = skill.github;
    return (
        <a className="owner" href={skill.homepage ?? skill.repo ?? '#'} rel="noopener" target="_blank" title={`${skill.name} on GitHub`}>
            {g?.avatar ? <img src={g.avatar} alt="" width={16} height={16} loading="lazy" decoding="async" /> : <span className="owner-dot" />}
            <span className="owner-name">{g?.ownerName || skill.author}</span>
        </a>
    );
}

/** GitHub stars as a small pill, dated in the tooltip. */
export function Stars({ skill }: { skill: SkillRow }) {
    const g = skill.github;
    if (!g) return null;
    return (
        <span className="stars" title={`${g.stars.toLocaleString('en')} stars on GitHub (${g.starsAt.slice(0, 10)})`}>
            <Star />
            <span className="sr-only">GitHub stars: </span>
            {fmtStars(g.stars)}
        </span>
    );
}
