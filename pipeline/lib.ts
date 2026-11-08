import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import YAML from 'yaml';
import { BASELINE_ID, runConfig } from '../config/run.config.ts';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_DIR = path.join(ROOT, 'config');
export const BRIEFS_DIR = path.join(CONFIG_DIR, 'briefs');
export const SKILLS_YAML = path.join(CONFIG_DIR, 'skills.yaml');
export const VENDOR_DIR = path.join(ROOT, 'vendor', 'skills');
export const OUTPUT_DIR = path.join(ROOT, 'output');
/** The site (Next, static export). Build data goes to web/data, static files to web/public. */
export const SITE_DIR = path.join(ROOT, 'web');
export const DATA_DIR = path.join(SITE_DIR, 'data');
export const PUBLIC_DIR = path.join(SITE_DIR, 'public');

export interface SkillEntry {
  id: string;
  name: string;
  author: string;
  repo: string;
  path: string;
  commit?: string | null;
  license: string;
  homepage?: string;
  /** Frontmatter name: folder name for a manual install and the skill's slash command. */
  installName?: string;
  /** One line on how the skill is triggered, if it is not picked up automatically. */
  usage?: string;
  /** Commit whose scan findings (npm run scan) a person has read and accepted; generate refuses unreviewed high findings. */
  scanReviewed?: string;
  /** Install methods from the skill's own README. */
  install?: { label: string; commands: string; note?: string }[];
}

/** Written by fetch-skills next to the vendored files. */
export interface VendorInfo {
  id: string;
  commit: string;
  fetchedAt: string;
  description: string;
  /** Files (relative to the skill dir) to append after SKILL.md, in order. */
  inlinedReferences: string[];
  /** Non-null when the skill depends on executing scripts and is therefore skipped. */
  skipReason: string | null;
}

export interface RunMeta {
  briefId: string;
  skillId: string;
  run: number;
  model: string;
  skillCommit: string | null;
  referencesInlined: boolean;
  generatedAt: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  status: 'ok' | 'failed' | 'invalid_html';
  error: string | null;
  stopReason?: string | null;
  /** 'api' = direct Messages API call; 'claude-cli' = `claude -p` with the system prompt replaced (see README). */
  backend?: 'api' | 'claude-cli';
  /** For claude-cli: list-price estimate reported by the CLI; actual usage is billed to the subscription. */
  costIsEstimate?: boolean;
  screenshots?: {
    takenAt: string;
    fullPageHeight: number;
    fullPageTruncated: boolean;
    networkIdleTimedOut: boolean;
    scrolledForReveal?: boolean;
    hiddenAfterScroll?: number;
    /** Requests to localhost / private networks / other local files that the net guard blocked. */
    blockedRequests?: string[];
  };
}

export function loadEnv() {
  const envFile = path.join(ROOT, '.env');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
}

export function loadSkills(): SkillEntry[] {
  const list = YAML.parse(fs.readFileSync(SKILLS_YAML, 'utf8')) as SkillEntry[] | null;
  return list ?? [];
}

export function loadVendorInfo(id: string): VendorInfo | null {
  const f = path.join(VENDOR_DIR, id, '.skillarena.json');
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as VendorInfo) : null;
}

export interface Brief {
  id: string;
  text: string;
  title: string;
  /** From config/live-briefs/: a working page with real data, generated with SYSTEM_LIVE; not part of the matrix. */
  live?: boolean;
}

/** Live briefs: pages meant to be published and used (not compared in the matrix). Generated only when named with --brief. */
export const LIVE_BRIEFS_DIR = path.join(CONFIG_DIR, 'live-briefs');

/** Briefs in the order of runConfig.briefTitles, then any other .md files alphabetically. */
export function loadBriefs(dir = BRIEFS_DIR): Brief[] {
  if (!fs.existsSync(dir)) return [];
  const order = Object.keys(runConfig.briefTitles);
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort((a, b) => rank(a.replace(/\.md$/, '')) - rank(b.replace(/\.md$/, '')) || a.localeCompare(b))
    .map((f) => {
      const id = f.replace(/\.md$/, '');
      return {
        id,
        text: fs.readFileSync(path.join(dir, f), 'utf8'),
        title: runConfig.briefTitles[id] ?? id,
        ...(dir === LIVE_BRIEFS_DIR ? { live: true } : {}),
      };
    });
}

export function runDir(briefId: string, skillId: string, run: number) {
  return path.join(OUTPUT_DIR, briefId, skillId, `run-${run}`);
}

export function readMeta(dir: string): RunMeta | null {
  const f = path.join(dir, 'meta.json');
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as RunMeta) : null;
}

export function writeMeta(dir: string, meta: RunMeta) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
}

/** Lists every existing run directory in output/, optionally filtered. */
export function listRunDirs(filter: { skills?: string[]; briefs?: string[] } = {}) {
  const out: { briefId: string; skillId: string; run: number; dir: string }[] = [];
  if (!fs.existsSync(OUTPUT_DIR)) return out;
  for (const briefId of fs.readdirSync(OUTPUT_DIR)) {
    if (filter.briefs?.length && !filter.briefs.includes(briefId)) continue;
    const bdir = path.join(OUTPUT_DIR, briefId);
    if (!fs.statSync(bdir).isDirectory()) continue;
    for (const skillId of fs.readdirSync(bdir)) {
      if (filter.skills?.length && !filter.skills.includes(skillId)) continue;
      const sdir = path.join(bdir, skillId);
      if (!fs.statSync(sdir).isDirectory()) continue;
      for (const r of fs.readdirSync(sdir)) {
        const m = /^run-(\d+)$/.exec(r);
        if (m) out.push({ briefId, skillId, run: Number(m[1]), dir: path.join(sdir, r) });
      }
    }
  }
  return out.sort((a, b) =>
    a.briefId === b.briefId ? (a.skillId === b.skillId ? a.run - b.run : a.skillId.localeCompare(b.skillId)) : a.briefId.localeCompare(b.briefId),
  );
}

const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v : v ? [v] : []).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);

/** Shared CLI flags: --skill a,b --brief x --runs 3 --force --yes --mock --dry-run */
export function parseCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      skill: { type: 'string', multiple: true },
      brief: { type: 'string', multiple: true },
      runs: { type: 'string' },
      force: { type: 'boolean', default: false },
      yes: { type: 'boolean', short: 'y', default: false },
      mock: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      'skip-fetch': { type: 'boolean', default: false },
      backend: { type: 'string' },
      all: { type: 'boolean', default: false },
      verify: { type: 'boolean', default: false },
      base: { type: 'string' },
    },
  });
  return {
    skills: list(values.skill),
    briefs: list(values.brief),
    runs: values.runs ? Number(values.runs) : runConfig.runsPerPair,
    force: values.force!,
    yes: values.yes!,
    mock: values.mock!,
    dryRun: values['dry-run']!,
    skipFetch: values['skip-fetch']!,
    backend: (values.backend ?? runConfig.backend) as 'api' | 'cli',
  };
}

export async function pool<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const git = (args: string[], cwd?: string) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Bare, blob-less clones of skill repos (vendor/.repos/), shared by fetch-skills and upstream. */
export const REPO_CACHE = path.join(ROOT, 'vendor', '.repos');
function repoCacheDir(repo: string) {
  const m = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(repo);
  const name = m ? `${m[1]}__${m[2]}` : Buffer.from(repo).toString('base64url');
  return path.join(REPO_CACHE, name);
}
const fetchedRepos = new Set<string>();
/** Clones the repo into the cache if missing, otherwise fetches all branches (once per process). */
export function ensureRepo(repo: string): string {
  const dir = repoCacheDir(repo);
  if (!fs.existsSync(path.join(dir, '.git')) && !fs.existsSync(path.join(dir, 'HEAD'))) {
    fs.mkdirSync(REPO_CACHE, { recursive: true });
    console.log(`  cloning ${repo}`);
    git(['clone', '--quiet', '--bare', '--filter=blob:none', repo, dir]);
  } else if (!fetchedRepos.has(dir)) {
    git(['fetch', '--quiet', 'origin', '+refs/heads/*:refs/heads/*'], dir);
  }
  fetchedRepos.add(dir);
  return dir;
}

export { BASELINE_ID, runConfig };
