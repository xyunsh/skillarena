/**
 * Downloads the published files of every run (screenshots, generated page, og.jpg) from the public
 * asset domain into output/, so a fresh clone (which only has meta.json) can build the site and run the
 * scans without generating anything. Read-only on the remote; skips files that already exist.
 *
 * Usage: npm run fetch-assets [-- --skill a,b] [-- --brief x] [-- --base https://assets.skillarena.dev]
 */
import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_FILES } from './build-manifest.ts';
import { listRunDirs, loadEnv, parseCli, pool, readMeta } from './lib.ts';

loadEnv();
const i = process.argv.indexOf('--base');
const base = (i > -1 ? process.argv[i + 1] : process.env.ASSET_BASE || 'https://assets.skillarena.dev').replace(/\/+$/, '');
const cli = parseCli();

const jobs: { url: string; file: string }[] = [];
for (const r of listRunDirs({ skills: cli.skills, briefs: cli.briefs })) {
  if (readMeta(r.dir)?.status !== 'ok') continue;
  for (const f of PUBLIC_FILES) {
    const file = path.join(r.dir, f);
    if (!fs.existsSync(file)) jobs.push({ url: `${base}/runs/${r.briefId}/${r.skillId}/run-${r.run}/${f}`, file });
  }
}
console.log(`${jobs.length} file(s) to download from ${base}`);
let ok = 0, missing = 0, failed = 0;
await pool(jobs, 8, async (j) => {
  try {
    const res = await fetch(j.url, { headers: { 'user-agent': 'SkillArena-fetch-assets' } });
    if (res.status === 404) { missing++; return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(j.file, Buffer.from(await res.arrayBuffer()));
    ok++;
  } catch (e) {
    failed++;
    console.error(`✗ ${j.url}: ${(e as Error).message}`);
  }
});
console.log(`downloaded ${ok}, not published ${missing}, failed ${failed}`);
if (failed) process.exitCode = 1;
