/**
 * Uploads the public files of every generated run (index.html, screenshots, og.jpg) to Cloudflare R2,
 * at runs/<brief>/<skill>/run-N/<file>. The site then reads them from ASSET_BASE (see build-manifest).
 * Only files whose content changed since the last upload are sent (sha256, remembered in
 * vendor/.r2-uploaded.json; --verify re-checks against R2 instead).
 *
 * Env (.env): CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
 * R2's S3 API needs an access key pair (R2 → Manage API tokens), not the Cloudflare API token.
 * Usage: npm run upload-assets [-- --skill a,b] [-- --brief x] [-- --dry-run] [-- --verify]
 *
 * Generated pages are untrusted: they are served from the asset domain, a different origin from the
 * site, and the site shows them only in sandboxed iframes. Also add a response header rule on the asset
 * domain: Content-Security-Policy: sandbox allow-scripts, for paths ending in index.html (see README).
 */
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_FILES } from './build-manifest.ts';
import { ROOT, listRunDirs, loadEnv, parseCli, pool, readMeta } from './lib.ts';

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const STATE = path.join(ROOT, 'vendor', '.r2-uploaded.json');

loadEnv();
const cli = parseCli();
const dry = cli.dryRun;
const verify = process.argv.includes('--verify');
const need = ['CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].filter((k) => !process.env[k]);
if (need.length && !dry) {
  console.error(`Missing in .env: ${need.join(', ')}`);
  process.exit(1);
}
const bucket = process.env.R2_BUCKET!;
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '', secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '' },
});

const state: Record<string, string> = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
const files: { key: string; file: string; sha: string }[] = [];
for (const r of listRunDirs({ skills: cli.skills, briefs: cli.briefs })) {
  if (readMeta(r.dir)?.status !== 'ok') continue;
  for (const f of PUBLIC_FILES) {
    const file = path.join(r.dir, f);
    if (!fs.existsSync(file)) continue;
    const key = `runs/${r.briefId}/${r.skillId}/run-${r.run}/${f}`;
    files.push({ key, file, sha: createHash('sha256').update(fs.readFileSync(file)).digest('hex') });
  }
}

async function remoteSha(key: string) {
  try {
    return (await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))).Metadata?.sha256 ?? null;
  } catch {
    return null;
  }
}

let sent = 0, bytes = 0, same = 0, failed = 0;
const todo = verify ? files : files.filter((x) => state[x.key] !== x.sha);
same = files.length - todo.length;
console.log(`${files.length} file(s) in ${new Set(files.map((x) => path.dirname(x.key))).size} run(s); ${todo.length} to check/upload${dry ? ' (dry run)' : ''}`);
if (!dry) {
  await pool(todo, 8, async (x) => {
    try {
      if (verify && (await remoteSha(x.key)) === x.sha) { state[x.key] = x.sha; same++; return; }
      const body = fs.readFileSync(x.file);
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: x.key,
        Body: body,
        ContentType: TYPES[path.extname(x.file)] ?? 'application/octet-stream',
        // URLs carry ?v=<hash of generation + screenshot time>, so long caching is safe.
        CacheControl: 'public, max-age=604800',
        Metadata: { sha256: x.sha },
      }));
      state[x.key] = x.sha;
      sent++;
      bytes += body.length;
      if (sent % 200 === 0) { fs.writeFileSync(STATE, JSON.stringify(state)); console.log(`  … ${sent} uploaded`); }
    } catch (e) {
      failed++;
      console.error(`✗ ${x.key}: ${(e as Error).message}`);
    }
  });
  fs.writeFileSync(STATE, JSON.stringify(state));
}
console.log(`uploaded ${sent} (${(bytes / 1048576).toFixed(1)} MB), unchanged ${same}, failed ${failed}`);
if (failed) process.exitCode = 1;
