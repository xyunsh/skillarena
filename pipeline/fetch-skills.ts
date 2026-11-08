/**
 * Fetches every skill in config/skills.yaml at a pinned git commit into vendor/skills/<id>/.
 * - If `commit` is empty, pins the repo's current default-branch HEAD and writes the SHA back to skills.yaml.
 * - Detects referenced files to inline (references/…) and skills that depend on running scripts (→ skipped.md).
 *
 * Usage: npm run fetch-skills [-- --skill <id>] [--force]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { scanSkill } from './scan-skill.ts';
import { ROOT, SKILLS_YAML, VENDOR_DIR, ensureRepo, git, loadSkills, loadVendorInfo, parseCli, type SkillEntry, type VendorInfo } from './lib.ts';

function parseFrontmatter(md: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  if (!m) return {};
  try {
    return (YAML.parse(m[1]) ?? {}) as Record<string, string>;
  } catch {
    return {};
  }
}

function walk(dir: string, base = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, base) : [path.relative(base, p)];
  });
}

const TEXT_EXT = new Set(['.md', '.txt', '.css', '.html', '.json', '.yaml', '.yml', '.csv']);
const SCRIPT_EXT = new Set(['.py', '.sh', '.js', '.mjs', '.ts', '.rb']);

/** Files referenced by SKILL.md (in order of first mention) that live under references/ (or are other .md docs). */
function findReferences(skillMd: string, files: string[]): string[] {
  const candidates = files.filter(
    (f) => f !== 'SKILL.md' && TEXT_EXT.has(path.extname(f)) && (f.startsWith('references/') || f.endsWith('.md')) && !/^LICENSE/i.test(path.basename(f)),
  );
  const hits = candidates
    .map((f) => ({ f, pos: skillMd.indexOf(f) }))
    .filter((h) => h.pos >= 0)
    .sort((a, b) => a.pos - b.pos);
  return hits.map((h) => h.f);
}

/** Heuristic: the skill ships executable scripts and SKILL.md tells the agent to run them. */
function detectScriptDependency(skillMd: string, files: string[]): string | null {
  // Extension-less files under scripts/ count too (launchers such as scripts/<tool>), but only when
  // SKILL.md names their full path, since their basename is often just the skill's own name.
  const isLauncher = (f: string) => !path.extname(f) && /(^|\/)scripts\//.test(f);
  const scripts = files.filter((f) => SCRIPT_EXT.has(path.extname(f)) || isLauncher(f));
  if (!scripts.length) return null;
  const mentioned = scripts.filter((s) => skillMd.includes(s) || (!isLauncher(s) && skillMd.includes(path.basename(s))));
  const runVerb = /\b(python3?|node|bash|sh|npx|uv run|run the script|execute)\b|\brun\s+`[^`]*scripts\//i.test(skillMd);
  if (mentioned.length && runVerb) {
    return `SKILL.md instructs running bundled scripts (${mentioned.slice(0, 3).join(', ')}${mentioned.length > 3 ? ', …' : ''}); results would not be reproducible via a plain API call.`;
  }
  return null;
}

function fetchSkill(skill: SkillEntry, force: boolean): VendorInfo {
  const dest = path.join(VENDOR_DIR, skill.id);
  const existing = loadVendorInfo(skill.id);
  if (!force && existing && skill.commit && existing.commit === skill.commit) {
    console.log(`= ${skill.id} @ ${skill.commit.slice(0, 7)} (cached)`);
    return existing;
  }
  const cache = ensureRepo(skill.repo);
  const commit = skill.commit || git(['rev-parse', 'HEAD'], cache);
  const skillPath = skill.path.replace(/^\/+|\/+$/g, '');

  const tmp = fs.mkdtempSync(path.join(VENDOR_DIR, `.tmp-${skill.id}-`));
  try {
    const tar = execFileSync('git', ['archive', '--format=tar', commit, skillPath], { cwd: cache, maxBuffer: 256 * 1024 * 1024 });
    execFileSync('tar', ['-x', '-C', tmp], { input: tar });
    const src = path.join(tmp, skillPath);
    if (!fs.existsSync(path.join(src, 'SKILL.md'))) throw new Error(`No SKILL.md at ${skill.repo}/${skillPath}@${commit}`);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(src, dest);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const skillMd = fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8');
  const files = walk(dest);
  const fm = parseFrontmatter(skillMd);
  const info: VendorInfo = {
    id: skill.id,
    commit,
    fetchedAt: new Date().toISOString(),
    description: String(fm.description ?? '').trim(),
    inlinedReferences: findReferences(skillMd, files),
    skipReason: detectScriptDependency(skillMd, files),
  };
  fs.writeFileSync(path.join(dest, '.skillarena.json'), JSON.stringify(info, null, 2) + '\n');
  console.log(
    `✓ ${skill.id} @ ${commit.slice(0, 7)}` +
      (info.inlinedReferences.length ? ` (+${info.inlinedReferences.length} references)` : '') +
      (info.skipReason ? ' [SKIPPED: depends on scripts]' : ''),
  );
  const scan = scanSkill(skill);
  for (const x of scan?.findings ?? []) console.log(`    ${x.level === 'high' ? (scan!.reviewed ? '✓ reviewed' : '✗ HIGH') : '! medium'} ${x.rule}: ${x.detail}`);
  if (scan?.high && !scan.reviewed) console.log(`    → generate refuses ${skill.id} until you read it and set scanReviewed: ${commit}`);
  return info;
}

function writeCommitsBack(commits: Record<string, string>) {
  const doc = YAML.parseDocument(fs.readFileSync(SKILLS_YAML, 'utf8'));
  const seq = doc.contents as YAML.YAMLSeq<YAML.YAMLMap>;
  let changed = false;
  for (const item of seq.items) {
    const id = String(item.get('id'));
    if (commits[id] && item.get('commit') !== commits[id]) {
      item.set('commit', commits[id]);
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(SKILLS_YAML, doc.toString());
}

function writeSkipped(skills: SkillEntry[]) {
  const rows = skills
    .map((s) => ({ s, info: loadVendorInfo(s.id) }))
    .filter((x) => x.info?.skipReason);
  const body = rows.length
    ? rows.map(({ s, info }) => `| ${s.id} | ${s.repo} | ${info!.commit.slice(0, 7)} | ${info!.skipReason} |`).join('\n')
    : '| – | – | – | No skills skipped. |';
  fs.writeFileSync(
    path.join(ROOT, 'skipped.md'),
    `# Skipped skills\n\nSkills that depend on executing scripts (not just written rules) are not generated, because a plain API call can't reproduce them.\n\n| id | repo | commit | reason |\n|---|---|---|---|\n${body}\n`,
  );
}

export async function fetchSkills(opts: { skills?: string[]; force?: boolean } = {}) {
  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  const all = loadSkills();
  const selected = opts.skills?.length ? all.filter((s) => opts.skills!.includes(s.id)) : all;
  const commits: Record<string, string> = {};
  for (const skill of selected) {
    try {
      commits[skill.id] = fetchSkill(skill, !!opts.force).commit;
    } catch (e) {
      console.error(`✗ ${skill.id}: ${(e as Error).message}`);
      process.exitCode = 1;
    }
  }
  writeCommitsBack(commits);
  writeSkipped(all);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = parseCli();
  await fetchSkills({ skills: cli.skills, force: cli.force });
}
