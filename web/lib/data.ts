/**
 * Build-time data for the site: the manifest written by the pipeline (npm run manifest), the display
 * settings edited in the admin (SITE_SETTINGS), and the upstream check (npm run upstream).
 * Read with fs at build time only; nothing here runs in the browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalizeSettings, type SiteSettings } from './settings';

const DATA_DIR = path.resolve(process.env.SKILLARENA_DATA ?? 'data');
const readJson = <T,>(file: string, fallback: T): T => {
    const p = path.join(DATA_DIR, file);
    const t = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : '';
    return t ? (JSON.parse(t) as T) : fallback;
};

export interface Run {
    run: number;
    status: 'ok' | 'failed' | 'invalid_html';
    error: string | null;
    model: string;
    generatedAt: string;
    costUsd: number;
    outputTokens: number;
    fullPageTruncated: boolean;
    base: string | null;
    v: string;
    hasShots: boolean;
}
export interface InstallMethod {
    label: string;
    commands: string;
    note: string | null;
}
export interface SkillRow {
    id: string;
    name: string;
    author: string;
    isBaseline: boolean;
    description: string;
    repo: string | null;
    path: string | null;
    commit: string | null;
    license: string | null;
    homepage: string | null;
    installName: string | null;
    usage: string | null;
    install: InstallMethod[];
    referencesInlined: boolean;
    github?: { owner: string; ownerName: string | null; ownerUrl: string; avatar: string | null; stars: number; starsAt: string } | null;
}
export interface Brief {
    id: string;
    title: string;
    text: string;
}
interface RawManifest {
    builtAt: string | null;
    lastGeneratedAt: string | null;
    models: string[];
    runsPerPair: number;
    mobileFirstBriefs: string[];
    skills: SkillRow[];
    briefs: Brief[];
    runs: Record<string, Record<string, Run[]>>;
    totals: { calls: number; costUsd: number };
}

const raw = readJson<RawManifest>('manifest.json', {
    builtAt: null, lastGeneratedAt: null, models: [], runsPerPair: 3, mobileFirstBriefs: [], skills: [], briefs: [], runs: {}, totals: { calls: 0, costUsd: 0 },
});

/** URL of a run asset with a cache-busting version. The live page is 'index.html' (R2 has no directory index). */
export const asset = (r: Pick<Run, 'base' | 'v'>, file = '') => `${r.base}${file}?v=${r.v}`;

/** Display settings: SITE_SETTINGS (the server's copy) or data/site-settings.json; defaults when neither exists. */
const settingsFile = process.env.SITE_SETTINGS || path.join(DATA_DIR, 'site-settings.json');
const settingsText = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, 'utf8').trim() : '';
export const siteSettings: SiteSettings = normalizeSettings(settingsText ? JSON.parse(settingsText) : {});

type UpstreamEntry = { head: string; changed: boolean; gone: boolean; files: string[]; scripts: string[] };
const upstream = readJson<{ checkedAt: string; skills: Record<string, UpstreamEntry> }>('upstream.json', { checkedAt: '', skills: {} });
export const upstreamFor = (id: string): UpstreamEntry | null => upstream.skills[id] ?? null;
/** GitHub compare view from the tested commit to the current upstream head. */
export const compareUrl = (s: SkillRow) => {
    const u = upstreamFor(s.id);
    return u?.changed && s.repo?.includes('github.com') && s.commit ? `${s.repo.replace(/\.git$/, '')}/compare/${s.commit}...${u.head}` : null;
};

const cfg = (id: string) => siteSettings.skills[id] ?? {};
const rank = (id: string) => {
    const i = siteSettings.order.indexOf(id);
    return i < 0 ? Infinity : i;
};
export type ShownSkill = SkillRow & { featured: boolean };
/** Visible skills: the baseline first, then the admin order (skills not in it keep manifest order). */
export const skills: ShownSkill[] = raw.skills
    .filter((s) => s.isBaseline || !cfg(s.id).hidden)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => Number(b.s.isBaseline) - Number(a.s.isBaseline) || rank(a.s.id) - rank(b.s.id) || a.i - b.i)
    .map(({ s }) => ({ ...s, description: cfg(s.id).description || s.description, featured: !s.isBaseline && !!cfg(s.id).featured }));
const shown = new Set(skills.map((s) => s.id));
export const briefs = raw.briefs;
export const runsFor = (briefId: string, skillId: string): Run[] => (shown.has(skillId) ? raw.runs[briefId]?.[skillId] ?? [] : []);
const visibleRuns = briefs.flatMap((b) => skills.flatMap((s) => runsFor(b.id, s.id)));
/** The manifest with totals recomputed over visible skills only. */
export const manifest = {
    ...raw,
    totals: { calls: visibleRuns.length, costUsd: visibleRuns.reduce((a, r) => a + (r.costUsd ?? 0), 0) },
};
export const isMobileFirst = (briefId: string) => manifest.mobileFirstBriefs.includes(briefId);
export const shortSha = (sha: string | null) => (sha ? sha.slice(0, 7) : '—');
export const commitUrl = (s: SkillRow) =>
    s.repo && s.commit && s.repo.includes('github.com') ? `${s.repo.replace(/\.git$/, '')}/tree/${s.commit}` : s.repo;
const gh = (s: SkillRow) => (s.repo && s.commit && s.path && s.repo.includes('github.com') ? s.repo.replace(/\.git$/, '') : null);
/** The skill folder at the tested commit. */
export const sourceUrl = (s: SkillRow) => {
    const r = gh(s);
    return r ? `${r}/tree/${s.commit}/${s.path}` : s.repo;
};
/** SKILL.md at the tested commit (a link only; the site never shows its text). */
export const skillMdUrl = (s: SkillRow) => {
    const r = gh(s);
    return r ? `${r}/blob/${s.commit}/${s.path}/SKILL.md` : null;
};
/** Shell commands that install exactly the tested version into ~/.claude/skills/. */
export const manualInstall = (s: SkillRow) =>
    s.repo && s.commit && s.path
        ? [
              'tmp=$(mktemp -d)',
              `git clone --filter=blob:none --no-checkout ${s.repo} "$tmp"`,
              `git -C "$tmp" checkout ${s.commit} -- ${s.path}`,
              'mkdir -p ~/.claude/skills',
              `cp -R "$tmp/${s.path}" ~/.claude/skills/${s.installName}`,
              'rm -rf "$tmp"',
          ].join('\n')
        : null;
/** 54170 → "54.2k". */
export const fmtStars = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n));
export const fmtDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '—');
