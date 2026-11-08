/**
 * Lists skills on ui-skills.com (a category page, default /skills/frontend) that SkillArena doesn't have yet,
 * ranked by their GitHub repo's stars. Read-only: changes nothing in config/.
 * Usage: npm run discover [-- --top 30] [-- --category frontend] [-- --json] [-- --all]
 * config/discover-ignore.txt lists repos ("owner/repo") or skills ("owner/repo#skill") already judged not
 * page-related; they are left out unless --all.
 *
 * Skill pages are cached in vendor/.ui-skills/ (a skill's repo doesn't change), so later runs only fetch new
 * skills. Stars are cached for 24 hours. Needs the `gh` CLI (logged in) for star counts.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { UNTRUSTED_NOTE, clean, cleanName } from './untrusted.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, 'vendor', '.ui-skills');
const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const top = Number(arg('top', '30'));
const category = arg('category', 'frontend');
const asJson = process.argv.includes('--json');
fs.mkdirSync(path.join(CACHE, 'pages'), { recursive: true });

const UA = { 'user-agent': 'SkillArena-discover (+https://skillarena.dev)' };
const get = async (url: string) => {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
};
const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// 1. Skill URLs and names from the category page's JSON-LD ItemList.
const list = await get(`https://www.ui-skills.com/skills/${category}`);
const items = new Map<string, string>();
for (const m of list.matchAll(/"url":"https:\/\/www\.ui-skills\.com\/skills\/([^"]+)","name":"([^"]+)"/g)) items.set(m[1], unescape(m[2]));

// 2. Repo + skill name from each skill page ("npx skills add <repo> --skill <name>"), cached.
type Info = { page: string; name: string; repo: string | null; skill: string | null; desc: string };
const infos: Info[] = [];
const pages = [...items.keys()];
for (let i = 0; i < pages.length; i += 4) {
  await Promise.all(pages.slice(i, i + 4).map(async (page) => {
    const f = path.join(CACHE, 'pages', page.replace(/\//g, '__') + '.json');
    if (fs.existsSync(f)) { infos.push(JSON.parse(fs.readFileSync(f, 'utf8'))); return; }
    try {
      const html = await get(`https://www.ui-skills.com/skills/${page}`);
      const m = /npx skills add (https:\/\/github\.com\/[^\s"&<]+)(?: --skill ([^\s"&<]+))?/.exec(html);
      const d = /<meta name="description" content="([^"]*)"/.exec(html);
      const info: Info = { page, name: items.get(page)!, repo: m ? m[1].replace(/\/$/, '').replace(/\.git$/, '') : null, skill: m?.[2] ?? null, desc: d ? unescape(d[1]).replace(/\s*Install from .*$/, '') : '' };
      fs.writeFileSync(f, JSON.stringify(info));
      infos.push(info);
    } catch (e) { console.error(`! ${page}: ${(e as Error).message}`); }
  }));
}

// 3. Stars per repo (24 h cache).
const starFile = path.join(CACHE, 'stars.json');
const stars: Record<string, { stars: number; license: string; at: number }> = fs.existsSync(starFile) ? JSON.parse(fs.readFileSync(starFile, 'utf8')) : {};
for (const repo of new Set(infos.map((x) => x.repo).filter((r): r is string => !!r))) {
  const key = repo.replace('https://github.com/', '').toLowerCase();
  if (stars[key] && Date.now() - stars[key].at < 86400000) continue;
  try {
    const out = execFileSync('gh', ['api', `repos/${key}`, '--jq', '[.stargazers_count, (.license.spdx_id // "NONE")] | @tsv'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\t');
    stars[key] = { stars: Number(out[0]), license: out[1], at: Date.now() };
  } catch { stars[key] = { stars: 0, license: '?', at: Date.now() }; }
}
fs.writeFileSync(starFile, JSON.stringify(stars));

// 4. Drop what SkillArena already has (same repo and the same skill name / folder).
const config = YAML.parse(fs.readFileSync(path.join(ROOT, 'config/skills.yaml'), 'utf8')) as { repo: string; path: string; installName?: string }[];
const have = new Set(config.flatMap((s) => {
  const r = s.repo.replace(/\.git$/, '').toLowerCase();
  return [`${r}#${(s.installName ?? '').toLowerCase()}`, `${r}#${s.path.split('/').pop()!.toLowerCase()}`];
}));
const ignore = new Set(
  (fs.existsSync(path.join(ROOT, 'config/discover-ignore.txt')) ? fs.readFileSync(path.join(ROOT, 'config/discover-ignore.txt'), 'utf8') : '')
    .split('\n').map((l) => l.replace(/#\s.*$/, '').trim().toLowerCase()).filter(Boolean),
);
const ignored = (x: Info) => {
  if (process.argv.includes('--all')) return false;
  const r = x.repo!.replace('https://github.com/', '').toLowerCase();
  return ignore.has(r) || ignore.has(`${r}#${(x.skill ?? x.page.split('/').pop()!).toLowerCase()}`);
};
const rows = infos
  .filter((x) => x.repo && !ignored(x) && !have.has(`${x.repo.toLowerCase()}#${(x.skill ?? x.page.split('/').pop()!).toLowerCase()}`))
  .map((x) => ({ ...x, ...stars[x.repo!.replace('https://github.com/', '').toLowerCase()] }))
  .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));

// Everything below came from ui-skills.com / GitHub: clean it before printing (see untrusted.ts).
const safe = rows.slice(0, top).map((r) => ({ ...r, page: cleanName(r.page), name: clean(r.name, 60), repo: cleanName(r.repo), skill: r.skill ? cleanName(r.skill) : null, desc: clean(r.desc, 110), license: cleanName(r.license, 30) }));
if (asJson) console.log(JSON.stringify({ note: UNTRUSTED_NOTE, skills: safe }, null, 2));
else {
  console.log(`ui-skills.com/${category}: ${infos.length} skills, ${rows.length} not on SkillArena. Top ${Math.min(top, rows.length)} by repo stars:\n`);
  console.log(`${UNTRUSTED_NOTE}\n`);
  console.log('| stars | repo | skill | license | description |\n|---:|---|---|---|---|');
  for (const r of safe)
    console.log(`| ${(r.stars ?? 0).toLocaleString('en')} | ${r.repo!.replace('https://github.com/', '')} | ${r.skill ?? r.page} | ${r.license} | ${r.desc} |`);
  console.log('\nStars are per repo, not per skill. Many listed skills are not about building pages (testing, tooling, codebase analysis); check before adding.');
}
