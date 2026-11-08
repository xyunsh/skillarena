import { briefs, manifest, runsFor, skills } from '~/lib/data';
import { abs } from '~/lib/seo';

// Public, machine-readable results (no SKILL.md contents).
export const dynamic = 'force-static';

export function GET() {
  const u = (p: string) => abs(p);
  const data = {
    name: 'SkillArena UI skill comparison',
    url: u('/'),
    generatedAt: manifest.lastGeneratedAt,
    models: manifest.models,
    runsPerPair: manifest.runsPerPair,
    totals: manifest.totals,
    briefs: briefs.map((b) => ({ id: b.id, title: b.title, text: b.text })),
    skills: skills.map((s) => ({
      id: s.id, name: s.name, author: s.author, isBaseline: s.isBaseline, description: s.description,
      repo: s.repo, commit: s.commit, path: s.path, license: s.license, page: u(`/skill/${s.id}/`),
    })),
    runs: skills.flatMap((s) => briefs.flatMap((b) => runsFor(b.id, s.id).map((r) => ({
      skill: s.id, brief: b.id, run: r.run, status: r.status, model: r.model, generatedAt: r.generatedAt,
      outputTokens: r.outputTokens,
      screenshots: r.hasShots && r.base ? {
        desktop: u(`${r.base}desktop.webp`), desktopFull: u(`${r.base}desktop-full.webp`), mobile: u(`${r.base}mobile.webp`),
      } : null,
      compare: u(`/compare/?a=baseline&b=${s.id}&brief=${b.id}&run=${r.run}`),
    })))),
  };
  return new Response(JSON.stringify(data, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
