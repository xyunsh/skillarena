/**
 * Full pipeline: fetch-skills → generate → screenshot → build-manifest.
 *
 * Usage: npm run pipeline -- [--skill a,b] [--brief x] [--runs n] [--force] [--yes] [--dry-run] [--mock] [--skip-fetch]
 * `baseline` is always a valid --skill value. --force regenerates (and re-screenshots) the selected runs.
 */
import { BASELINE_ID, parseCli } from './lib.ts';
import { fetchSkills } from './fetch-skills.ts';
import { generate } from './generate.ts';
import { screenshot } from './screenshot.ts';
import { buildManifest } from './build-manifest.ts';

const cli = parseCli();
const fetchIds = cli.skills.filter((s) => s !== BASELINE_ID);
if (!cli.skipFetch && !(cli.skills.length && !fetchIds.length)) {
  console.log('== fetch-skills');
  await fetchSkills({ skills: fetchIds });
}
console.log('\n== generate');
const gen = await generate(cli);
if (cli.dryRun) process.exit(0);
console.log('\n== screenshot');
await screenshot(cli);
console.log('\n== build-manifest');
await buildManifest();
if (gen.jobs) console.log(`\nDone. Generation spend this run: $${gen.costUsd.toFixed(4)}`);
