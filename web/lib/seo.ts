// Shared helpers for page metadata and the machine-readable endpoints (sitemap, robots, llms.txt, results.json).
import type { Metadata } from 'next';
import { briefs, manifest, runsFor, skills } from './data';

export const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://skillarena.dev').replace(/\/+$/, '');
export const abs = (p: string) => new URL(p, SITE + '/').href;
export const real = skills.filter((s) => !s.isBaseline);
export const models = manifest.models.join(', ');
export const pages = () => [
    { path: '/', priority: 1.0 },
    { path: '/compare/', priority: 0.8 },
    { path: '/about/', priority: 0.7 },
    { path: '/try/', priority: 0.5 },
    ...skills.map((s) => ({ path: `/skill/${s.id}/`, priority: s.isBaseline ? 0.5 : 0.8 })),
];

/** Per-skill run stats over all briefs. */
export function stats(skillId: string) {
    const runs = briefs.flatMap((b) => runsFor(b.id, skillId));
    const ok = runs.filter((r) => r.status === 'ok');
    const avgOut = ok.length ? Math.round(ok.reduce((a, r) => a + (r.outputTokens ?? 0), 0) / ok.length) : 0;
    return { runs: runs.length, ok: ok.length, avgOutputTokens: avgOut };
}

export const text = (body: string, type = 'text/plain') => new Response(body, { headers: { 'content-type': `${type}; charset=utf-8` } });

const DEFAULT_DESC = 'Same product brief, different UI skills — compare generated pages before you install a skill.';
/** Head tags for a page: canonical, robots, Open Graph, Twitter card. */
export function meta(o: { title: string; path: string; description?: string; ogImage?: string; noindex?: boolean; rawTitle?: boolean }): Metadata {
    const title = o.rawTitle || o.title === 'SkillArena' ? o.title : `${o.title} · SkillArena`;
    const description = o.description ?? DEFAULT_DESC;
    const image = { url: abs(o.ogImage ?? '/og/default.jpg'), width: 1200, height: 630, alt: 'SkillArena: screenshots of pages generated from the same brief with different UI skills' };
    return {
        title: { absolute: title },
        description,
        alternates: { canonical: abs(o.path) },
        robots: o.noindex ? 'noindex, follow' : { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
        openGraph: { type: 'website', siteName: 'SkillArena', title, description, url: abs(o.path), images: [image], locale: 'en_US' },
        twitter: { card: 'summary_large_image', title, description, images: [image.url] },
    };
}

/** schema.org graph for a page; the Organization is always included. */
export function jsonLd(items: Record<string, unknown>[] = []) {
    const org = { '@type': 'Organization', '@id': abs('/#org'), name: 'SkillArena', url: abs('/'), logo: abs('/apple-touch-icon.png') };
    return JSON.stringify({ '@context': 'https://schema.org', '@graph': [org, ...items] }).replace(/</g, '\\u003c');
}
