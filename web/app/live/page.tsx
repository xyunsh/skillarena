import { GithubOwner, Stars } from '~/components/GithubOwner';
import { asset, liveRunFor, manifest, skills } from '~/lib/data';
import { meta } from '~/lib/seo';

const list = skills.flatMap((s) => {
    const r = liveRunFor(s.id);
    return r ? [{ s, r }] : [];
});

export const metadata = meta({
    title: 'SkillArena, built by each skill',
    description: `${list.length} working versions of the SkillArena home page, each built by ${manifest.models[0] ?? 'the same model'} with a different UI skill. They load the real results and the waitlist works.`,
    path: '/live/',
});

export default function Live() {
    return (
        <div className="wrap">
            <section className="hero">
                <h1>SkillArena, built by each skill</h1>
                <p className="hero-sub">
                    Same brief, same model, one run per skill: every page below is a working SkillArena home page. Each one loads the real
                    results from <a href="/live-data.json">live-data.json</a>, and its waitlist form signs you up for real.
                </p>
                <p className="muted small">
                    The pages are generated code, so they open on the asset domain in a sandbox, away from this site. {list.length} so far.
                </p>
            </section>
            {list.length ? (
                <ul className="live-grid">
                    {list.map(({ s, r }) => (
                        <li key={s.id} className="live-card">
                            <a className="live-shot" href={`${r.base}index.html?ref=gallery`} aria-label={`Open the SkillArena page built with ${s.name}`}>
                                {r.hasShots ? <img src={asset(r, 'thumb-desktop.webp')} alt="" width={600} height={375} loading="lazy" /> : null}
                            </a>
                            <div className="live-body">
                                <a className="skill-name" href={`/skill/${s.id}/`}>
                                    {s.name}
                                </a>
                                {s.isBaseline ? (
                                    <div className="skill-meta">
                                        <span className="tag">control group</span>
                                    </div>
                                ) : (
                                    <>
                                        <GithubOwner skill={s} />
                                        <div className="skill-meta">
                                            <Stars skill={s} />
                                        </div>
                                    </>
                                )}
                                <a className="live-open" href={`${r.base}index.html?ref=gallery`}>
                                    Open live page →
                                </a>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="muted">No live pages yet.</p>
            )}
        </div>
    );
}
