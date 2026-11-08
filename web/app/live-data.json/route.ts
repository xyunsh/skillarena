import { asset, briefs, isMobileFirst, manifest, runsFor, skills } from '~/lib/data';
import { abs } from '~/lib/seo';

// Compact data for the live SkillArena pages (config/live-briefs/skillarena-live.md): what a generated
// home page needs to render the real matrix. Served with Access-Control-Allow-Origin: * (nginx), since the
// live pages run in an opaque (sandboxed) origin on the asset domain. The contract is in that brief; keep them in sync.
export const dynamic = 'force-static';

// Same values as ROLES in contract/index.ts (the API rejects anything else).
const ROLE_LABELS = { author: 'Skill author', developer: 'Developer', designer: 'Designer', lead: 'Team lead', other: 'Other' };
const ROLES = Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[];

export function GET() {
  const shown = briefs.filter((b) => b.id !== 'skillarena-live');
  const data = {
    version: 1,
    site: {
      name: 'SkillArena',
      url: abs('/'),
      waitlistUrl: abs('/api/waitlist'),
      model: manifest.models[0] ?? null,
      generatedAt: manifest.lastGeneratedAt,
    },
    totals: {
      skills: skills.filter((s) => !s.isBaseline).length,
      briefs: shown.length,
      pages: manifest.totals.calls,
      costUsd: Math.round(manifest.totals.costUsd * 100) / 100,
    },
    briefs: shown.map((b) => ({ id: b.id, title: b.title, mobileFirst: isMobileFirst(b.id) })),
    roles: ROLES.map((value) => ({ value, label: ROLE_LABELS[value] })),
    skills: skills.map((s) => ({
      id: s.id,
      name: s.name,
      author: s.github?.ownerName || s.author,
      isBaseline: s.isBaseline,
      description: s.description,
      stars: s.github?.stars ?? null,
      url: abs(`/skill/${s.id}/`),
      thumbs: Object.fromEntries(shown.map((b) => {
        const r = runsFor(b.id, s.id).find((x) => x.status === 'ok' && x.hasShots && x.base);
        return [b.id, r ? abs(asset(r, isMobileFirst(b.id) ? 'thumb-mobile.webp' : 'thumb-desktop.webp')) : null];
      })),
    })),
  };
  return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
