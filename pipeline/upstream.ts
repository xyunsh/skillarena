/**
 * Checks whether each skill's folder changed upstream since the commit SkillArena tested.
 * The author install methods (npx skills add …) install the latest version, so a skill whose
 * folder changed is no longer the one the results are about — and could now contain anything.
 *
 * Writes web/data/upstream.json (read by the site: warning on the skill page, flag in the admin).
 * Usage: npm run upstream [-- --skill <id>] [-- --dry]   (--dry prints only, writes nothing)
 * Uses the bare repo cache in vendor/.repos/ (fetches branches; never checks out or runs anything).
 */
import fs from 'node:fs';
import path from 'node:path';
import { BASELINE_ID, DATA_DIR, ensureRepo, git, loadSkills } from './lib.ts';
import { UNTRUSTED_NOTE, cleanName } from './untrusted.ts';

export type Upstream = {
  checkedAt: string;
  skills: Record<string, { head: string; changed: boolean; gone: boolean; files: string[]; scripts: string[] }>;
};

const OUT = path.join(DATA_DIR, 'upstream.json');
const dry = process.argv.includes('--dry');
const only = (() => { const i = process.argv.indexOf('--skill'); return i > -1 ? process.argv[i + 1].split(',') : null; })();
const SCRIPT = /\.(py|sh|js|mjs|cjs|ts|rb|ps1|bat|exe)$/i;

const prev: Upstream = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { checkedAt: '', skills: {} };
const result: Upstream = { checkedAt: new Date().toISOString(), skills: only ? { ...prev.skills } : {} };

const skills = loadSkills().filter((s) => s.id !== BASELINE_ID && s.repo && s.commit && s.path && (!only || only.includes(s.id)));
let changed = 0;
console.log(UNTRUSTED_NOTE);
for (const s of skills) {
  try {
    const dir = ensureRepo(s.repo!);
    const head = git(['rev-parse', 'HEAD'], dir);
    const files = head === s.commit ? [] : git(['diff', '--name-only', s.commit!, head, '--', s.path!], dir).split('\n').filter(Boolean);
    const gone = head !== s.commit && !git(['ls-tree', '-d', '--name-only', head, '--', s.path!], dir);
    const rel = files.map((f) => cleanName(path.posix.relative(s.path!, f), 120)); // file names come from the upstream repo
    const entry = { head, changed: files.length > 0, gone, files: rel.slice(0, 50), scripts: rel.filter((f) => SCRIPT.test(f)) };
    result.skills[s.id] = entry;
    if (entry.changed) {
      changed++;
      console.log(`! ${s.id}: ${files.length} file(s) changed since ${s.commit!.slice(0, 7)}${gone ? ' (folder removed)' : ''}${entry.scripts.length ? ` · scripts: ${entry.scripts.join(', ')}` : ''}`);
    }
  } catch (e) {
    console.error(`? ${s.id}: ${(e as Error).message.split('\n')[0]}`);
    if (prev.skills[s.id]) result.skills[s.id] = prev.skills[s.id];
  }
}
console.log(`${skills.length} skill(s) checked, ${changed} changed upstream since the tested commit.`);
if (!dry) {
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
  console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
}
