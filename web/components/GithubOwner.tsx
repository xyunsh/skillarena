import { fmtStars, type SkillRow } from '~/lib/data';

/** Repo owner's avatar (served by this site) + display name, linked to the repo, with the star count. */
export function GithubOwner({ skill, size = 18 }: { skill: SkillRow; size?: number }) {
    const g = skill.github;
    const name = g?.ownerName || skill.author;
    return (
        <span className="gh">
            <a href={skill.homepage ?? skill.repo ?? '#'} rel="noopener" target="_blank" title={`${skill.name} on GitHub`} className="gh-owner">
                {g?.avatar && <img src={g.avatar} alt="" width={size} height={size} loading="lazy" decoding="async" className="gh-avatar" />}
                <span>{name}</span>
            </a>
            {g && (
                <span className="gh-stars" title={`${g.stars.toLocaleString('en')} stars on GitHub (${g.starsAt.slice(0, 10)})`}>
                    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                        <path fill="currentColor" d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
                    </svg>
                    <span className="sr-only">GitHub stars: </span>
                    {fmtStars(g.stars)}
                </span>
            )}
        </span>
    );
}
