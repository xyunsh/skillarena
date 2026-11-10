import { notFound } from 'next/navigation';
import { InlineScript } from '~/components/InlineScript';
import { JsonLd } from '~/components/JsonLd';
import { Status } from '~/components/Status';
import { ui } from '~/lib/copy';
import {
    asset, briefs, commitUrl, compareUrl, fmtDate, isMobileFirst, manifest, manualInstall, runsFor, shortSha, skillMdUrl, skills, sourceUrl, upstreamFor, type Run,
} from '~/lib/data';
import { abs, meta } from '~/lib/seo';

type Params = { params: Promise<{ id: string }> };
export const dynamicParams = false;
export function generateStaticParams() {
    return skills.map((s) => ({ id: s.id }));
}

function info(id: string) {
    const skill = skills.find((s) => s.id === id);
    if (!skill) return null;
    const allRuns = briefs.flatMap((b) => runsFor(b.id, skill.id));
    const okRuns = allRuns.filter((r) => r.status === 'ok').length;
    const ogRun = briefs.map((b) => runsFor(b.id, skill.id).find((r) => r.hasShots)).find(Boolean);
    const description = skill.isBaseline
        ? `Control group: ${okRuns} pages generated from ${briefs.length} product briefs with no skill, to compare against every UI skill on SkillArena.`
        : `See what the ${skill.name} UI skill by ${skill.author} builds: ${okRuns} pages from ${briefs.length} fixed briefs, compared with no skill. Install commands included.`;
    const title = skill.isBaseline ? 'No skill (baseline) — control group' : `${skill.name} by ${skill.author} — UI skill results`;
    return { skill, allRuns, okRuns, ogRun, description, title };
}

export async function generateMetadata({ params }: Params) {
    const i = info((await params).id);
    if (!i) return {};
    return meta({ title: i.title, description: i.description, path: `/skill/${i.skill.id}/`, ogImage: i.ogRun ? asset(i.ogRun, 'og.jpg') : undefined });
}

const pageScript = `(function () {
  var page = document.getElementById('skill-page');
  page.addEventListener('click', function (e) {
    var b = e.target.closest('[data-set-view]');
    if (!b) return;
    var v = b.getAttribute('data-set-view');
    page.dataset.view = v;
    page.querySelectorAll('[data-set-view]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
  });
  page.addEventListener('click', function (e) {
    var c = e.target.closest('[data-copy]');
    if (!c) return;
    var code = c.closest('.install-method').querySelector('code');
    var label = c.textContent;
    function done(ok) {
      c.textContent = ok ? 'Copied' : 'Press ⌘C / Ctrl+C';
      setTimeout(function () { c.textContent = label; }, 2000);
    }
    function fallback() {
      var range = document.createRange();
      range.selectNodeContents(code);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) {}
      if (ok) sel.removeAllRanges();
      done(ok);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code.textContent).then(function () { done(true); }, fallback);
    } else fallback();
  });
})();`;

export default async function SkillPage({ params }: Params) {
    const i = info((await params).id);
    if (!i) notFound();
    const { skill, allRuns, okRuns } = i;
    const models = [...new Set(allRuns.map((r) => r.model))];
    const lastDate = allRuns.map((r) => r.generatedAt).sort().at(-1);
    const displayName = skill.isBaseline ? 'No skill (baseline)' : skill.name;
    const other = skills.find((s) => s.id !== skill.id && !s.isBaseline)?.id ?? 'baseline';
    const n = manifest.runsPerPair;
    const manual = manualInstall(skill);
    const up = upstreamFor(skill.id);
    const cmpUrl = compareUrl(skill);
    const previewBrief = skill.isBaseline
        ? undefined
        : briefs.find((b) => !isMobileFirst(b.id) && runsFor(b.id, skill.id)[0]?.hasShots && runsFor(b.id, 'baseline')[0]?.hasShots);
    const preview = previewBrief && { brief: previewBrief, base: runsFor(previewBrief.id, 'baseline')[0], mine: runsFor(previewBrief.id, skill.id)[0] };
    const pageUrl = abs(`/skill/${skill.id}/`);
    const ld = [
        {
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Matrix', item: abs('/') },
                { '@type': 'ListItem', position: 2, name: displayName, item: pageUrl },
            ],
        },
        ...(skill.isBaseline
            ? []
            : [
                  {
                      '@type': 'SoftwareSourceCode',
                      '@id': `${pageUrl}#skill`,
                      name: skill.name,
                      alternateName: skill.installName ?? undefined,
                      description: skill.description || undefined,
                      codeRepository: skill.repo ?? undefined,
                      url: skill.homepage ?? skill.repo ?? undefined,
                      license: skill.license ?? undefined,
                      version: skill.commit ?? undefined,
                      author: skill.github
                          ? { '@type': 'Person', name: skill.github.ownerName || skill.author, url: skill.github.ownerUrl }
                          : { '@type': 'Person', name: skill.author },
                      ...(skill.github ? { interactionStatistic: { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: skill.github.stars } } : {}),
                      applicationCategory: 'Agent skill (SKILL.md) for AI coding agents such as Claude Code',
                      subjectOf: { '@type': 'WebPage', url: pageUrl },
                  },
              ]),
    ];
    const vsHref = (briefId: string) => `/compare/?a=baseline&b=${skill.id}&brief=${briefId}`;

    return (
        <div className="wrap" data-view="desktop" id="skill-page">
            <JsonLd items={ld} />
            <section className="skill-head">
                <div>
                    <h1>
                        {displayName}
                        {skill.featured && (
                            <>
                                {' '}
                                <span className="tag tag-featured" style={{ verticalAlign: 'middle' }}>
                                    Featured
                                </span>
                            </>
                        )}
                    </h1>
                    {skill.isBaseline ? <p className="muted">{ui['skill.baselineNote']}</p> : skill.description && <p className="muted">{skill.description}</p>}
                    {!skill.isBaseline && <p className="note">{ui['skill.disclaimer']}</p>}
                </div>
                <dl className="facts">
                    {!skill.isBaseline && (
                        <>
                            <dt>{ui['skill.author']}</dt>
                            <dd>
                                {skill.github ? (
                                    <a className="gh-owner" href={skill.github.ownerUrl} rel="noopener" target="_blank">
                                        {skill.github.avatar && <img src={skill.github.avatar} alt="" width={20} height={20} className="gh-avatar" />}
                                        <span>{skill.github.ownerName || skill.author}</span>
                                    </a>
                                ) : (
                                    skill.author
                                )}
                            </dd>
                            {skill.github && (
                                <>
                                    <dt>{ui['skill.stars']}</dt>
                                    <dd>
                                        {skill.github.stars.toLocaleString('en')} <span className="muted small">on {skill.github.starsAt.slice(0, 10)}</span>
                                    </dd>
                                </>
                            )}
                            <dt>{ui['skill.repo']}</dt>
                            <dd>
                                <a href={skill.homepage ?? skill.repo ?? '#'} rel="noopener" target="_blank">
                                    {skill.repo?.replace(/^https?:\/\//, '')}
                                </a>
                            </dd>
                            <dt>{ui['skill.source']}</dt>
                            <dd>
                                <a className="mono" href={sourceUrl(skill) ?? '#'} rel="noopener" target="_blank">
                                    {skill.path}
                                </a>
                                {skillMdUrl(skill) && (
                                    <>
                                        {' · '}
                                        <a href={skillMdUrl(skill)!} rel="noopener" target="_blank">
                                            SKILL.md
                                        </a>
                                    </>
                                )}
                            </dd>
                            <dt>{ui['skill.commit']}</dt>
                            <dd>
                                <a className="mono" href={commitUrl(skill) ?? '#'} rel="noopener" target="_blank">
                                    {shortSha(skill.commit)}
                                </a>
                            </dd>
                            <dt>{ui['skill.license']}</dt>
                            <dd>{skill.license}</dd>
                            {skill.referencesInlined && (
                                <>
                                    <dt>{ui['skill.refs']}</dt>
                                    <dd>✓</dd>
                                </>
                            )}
                        </>
                    )}
                    <dt>{ui['skill.model']}</dt>
                    <dd className="mono">{models.join(', ') || '—'}</dd>
                    <dt>{ui['skill.date']}</dt>
                    <dd>{fmtDate(lastDate)}</dd>
                </dl>
            </section>

            {preview && (
                <section className="vs-preview" aria-labelledby="vs-title">
                    <div className="vs-head">
                        <h2 id="vs-title">
                            {preview.brief.title}: no skill vs {skill.name}
                        </h2>
                        <a className="btn btn-primary" href={vsHref(preview.brief.id)}>
                            Compare side by side →
                        </a>
                    </div>
                    <div className="vs-grid">
                        {(
                            [
                                ['No skill', preview.base],
                                [skill.name, preview.mine],
                            ] as [string, Run][]
                        ).map(([label, r]) => (
                            <a key={label} className="vs-cell" href={vsHref(preview.brief.id)}>
                                <img src={asset(r, 'desktop.webp')} alt={`${label} — ${preview.brief.title}, run 1`} width={1440} height={900} decoding="async" />
                                <span className="vs-label">{label}</span>
                            </a>
                        ))}
                    </div>
                    <p className="small muted">
                        Run 1 of {n}, same brief and model. <a href="#results">All {okRuns} pages from this skill ↓</a>
                    </p>
                </section>
            )}

            {!skill.isBaseline && (
                <section className="install" id="install" aria-labelledby="install-title">
                    <h2 id="install-title">{ui['install.title']}</h2>
                    {skill.usage && <p className="muted small">{skill.usage}</p>}
                    {up?.changed && (
                        <div className="install-warn" role="note">
                            <p>
                                <strong>⚠</strong> {ui['install.changed']}{' '}
                                {cmpUrl && (
                                    <a href={cmpUrl} rel="noopener nofollow" target="_blank">
                                        {ui['install.viewChanges']}
                                    </a>
                                )}
                            </p>
                            {up.scripts.length > 0 && (
                                <p className="small">
                                    {ui['install.changedScripts']} <code>{up.scripts.join(', ')}</code>
                                </p>
                            )}
                        </div>
                    )}
                    <div className="install-grid">
                        {manual && (
                            <div className="install-method install-pinned">
                                <div className="method-head">
                                    <h3>{ui['install.manual']}</h3>
                                    <button type="button" className="btn copy" data-copy>
                                        {ui['install.copy']}
                                    </button>
                                </div>
                                <pre className="code">
                                    <code>{manual}</code>
                                </pre>
                                <p className="small muted">
                                    Copies the skill folder at commit <code>{shortSha(skill.commit)}</code> — the exact files used for the results on this page — into{' '}
                                    <code>~/.claude/skills/{skill.installName}</code>. For a single project, use <code>.claude/skills/</code> inside it instead.
                                </p>
                            </div>
                        )}
                        {skill.install.map((m) => (
                            <div key={m.label} className="install-method">
                                <div className="method-head">
                                    <h3>
                                        {m.label} <span className="muted small">({ui['install.latest']})</span>
                                    </h3>
                                    <button type="button" className="btn copy" data-copy>
                                        {ui['install.copy']}
                                    </button>
                                </div>
                                <pre className="code">
                                    <code>{m.commands}</code>
                                </pre>
                                {m.note && <p className="small muted">{m.note}</p>}
                            </div>
                        ))}
                    </div>
                    {skill.install.length > 0 && <p className="small muted">{ui['install.latestNote']}</p>}
                </section>
            )}

            {!skill.isBaseline && (
                <section className="badge-box" aria-labelledby="badge-title" style={{ margin: '0 0 28px' }}>
                    <div className="install-method">
                        <div className="method-head">
                            <h3 id="badge-title">Badge for your README</h3>
                            <button type="button" className="btn copy" data-copy>
                                {ui['install.copy']}
                            </button>
                        </div>
                        <p className="small muted" style={{ margin: '0 0 10px' }}>
                            Is this your skill? Link people to these results.{' '}
                            <img src="/badge.svg" alt="SkillArena: compare vs no skill" width={180} height={20} style={{ verticalAlign: 'middle' }} />
                        </p>
                        <pre className="code">
                            <code>{`[![SkillArena: compare vs no skill](${abs('/badge.svg')})](${abs(`/skill/${skill.id}/`)}?ref=badge)`}</code>
                        </pre>
                    </div>
                </section>
            )}

            <div className="toolbar" id="results">
                <div className="seg" role="group" aria-label="View">
                    <button type="button" data-set-view="desktop" aria-pressed="true">
                        {ui['view.desktop']}
                    </button>
                    <button type="button" data-set-view="mobile" aria-pressed="false">
                        {ui['view.mobile']}
                    </button>
                </div>
                {skill.isBaseline ? (
                    <a className="btn" href={`/compare/?a=baseline&b=${other}&brief=${briefs[0]?.id}`}>
                        {ui['skill.compareOther']}
                    </a>
                ) : (
                    <a className="btn btn-primary" href={vsHref(briefs[0]?.id ?? '')}>
                        {ui['skill.vsBaseline']}
                    </a>
                )}
            </div>

            {briefs.map((b) => {
                const runs = runsFor(b.id, skill.id);
                const slots = Array.from({ length: Math.max(n, runs.length) }, (_, k) => runs.find((r) => r.run === k + 1));
                const cmp = skill.isBaseline ? `/compare/?a=baseline&b=${other}&brief=${b.id}` : vsHref(b.id);
                return (
                    <section key={b.id} className="brief-row" id={b.id}>
                        <div className="brief-row-head">
                            <h2>{b.title}</h2>
                            <a className="btn" href={cmp}>
                                {skill.isBaseline ? ui['skill.compareOther'] : ui['skill.vsBaseline']}
                            </a>
                        </div>
                        <blockquote className="brief-quote">
                            <span className="lbl">{ui['brief.label']}</span>
                            {b.text}
                        </blockquote>
                        <div className="runs">
                            {slots.map((r, k) => (
                                <figure key={k} className="shot">
                                    {r?.hasShots ? (
                                        <>
                                            <div className="shot-img v-desktop">
                                                <img src={asset(r, 'desktop.webp')} alt={`${displayName} — ${b.title}, run ${r.run}, desktop`} width={1440} height={900} loading="lazy" decoding="async" />
                                            </div>
                                            <div className="shot-img m v-mobile">
                                                <img src={asset(r, 'mobile.webp')} alt={`${displayName} — ${b.title}, run ${r.run}, mobile`} width={390} height={844} loading="lazy" decoding="async" />
                                            </div>
                                        </>
                                    ) : (
                                        <Status run={r} />
                                    )}
                                    <figcaption>
                                        <span>Run {k + 1}</span>
                                        {r?.hasShots && (
                                            <span className="actions">
                                                <a className="btn v-desktop" href={asset(r, 'desktop-full.webp')} target="_blank" rel="noopener" title={r.fullPageTruncated ? 'truncated at 8000px' : undefined}>
                                                    {ui['action.full']}
                                                </a>
                                                <button type="button" className="btn" data-live-src={asset(r, 'index.html')} data-live-skill={skill.id} data-live-brief={b.id} data-live-run={String(r.run)} data-live-name={displayName}>
                                                    {ui['action.open']}
                                                </button>
                                            </span>
                                        )}
                                    </figcaption>
                                </figure>
                            ))}
                        </div>
                    </section>
                );
            })}
            <InlineScript code={pageScript} />
        </div>
    );
}
