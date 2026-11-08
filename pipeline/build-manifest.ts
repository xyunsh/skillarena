import { createHash } from 'node:crypto';
/**
 * Collects output/ into web/data/manifest.json and copies the public assets into web/public/runs/ (unless ASSET_BASE is set).
 * Never copies SKILL.md or any vendor/ content — only metadata (name, author, description, repo, commit, license).
 *
 * Usage: npm run manifest
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { BASELINE_ID, DATA_DIR, PUBLIC_DIR, listRunDirs, loadEnv, loadBriefs, loadSkills, loadVendorInfo, readMeta, runConfig, type RunMeta } from './lib.ts';

/** Files of a run that the site serves (from web/public/runs/, or from R2 when ASSET_BASE is set). */
export const PUBLIC_FILES = ['index.html', 'desktop.webp', 'desktop-full.webp', 'mobile.webp', 'thumb-desktop.webp', 'thumb-mobile.webp', 'og.jpg'];

export interface ManifestRun {
  run: number;
  status: RunMeta['status'];
  error: string | null;
  model: string;
  generatedAt: string;
  costUsd: number;
  outputTokens: number;
  fullPageTruncated: boolean;
  /** Base URL path, e.g. /runs/saas-landing/baseline/run-1/ — null when nothing is publishable. */
  base: string | null;
  /** Cache-busting version for asset URLs; changes whenever the run is regenerated or re-screenshotted. */
  v: string;
  hasShots: boolean;
}

/**
 * readyOnly (CLI: --ready-only): leave out skills that don't yet have a finished run for every
 * brief × run, so the site can be redeployed while a new batch of skills is still generating.
 * Finished = ok and screenshotted, or invalid_html (a final result the site shows as "Generation failed");
 * a plain `failed` (API or CLI error) can be retried, so it still counts as not done.
 */
export async function buildManifest({ readyOnly = false }: { readyOnly?: boolean } = {}) {
  const briefs = loadBriefs();
  // GitHub owner, avatar and stars per repo (yarn github-meta).
  const githubFile = path.join(DATA_DIR, 'github.json');
  const github: Record<string, { repo: string; owner: { login: string; name: string | null; type: string; url: string; avatar: string | null }; stars: number; fetchedAt: string }> =
    fs.existsSync(githubFile) ? JSON.parse(fs.readFileSync(githubFile, 'utf8')).repos ?? {} : {};
  const githubFor = (repo: string | null) => {
    const m = /github\.com\/([^/]+)\/([^/.]+)/.exec(repo ?? '');
    const g = m ? github[`${m[1]}/${m[2]}`.toLowerCase()] : undefined;
    return g ? { owner: g.owner.login, ownerName: g.owner.name, ownerUrl: g.owner.url, avatar: g.owner.avatar, stars: g.stars, starsAt: g.fetchedAt } : null;
  };
  const prevFile = path.join(DATA_DIR, 'manifest.json');
  const prev = new Map<string, { description?: string; referencesInlined?: boolean }>(
    fs.existsSync(prevFile) ? (JSON.parse(fs.readFileSync(prevFile, 'utf8')).skills ?? []).map((x: { id: string }) => [x.id, x]) : [],
  );
  const runDirs = listRunDirs({});
  const isReady = (skillId: string) =>
    briefs.every((b) => Array.from({ length: runConfig.runsPerPair }, (_, i) => i + 1).every((n) => {
      const r = runDirs.find((d) => d.briefId === b.id && d.skillId === skillId && d.run === n);
      const m = r && readMeta(r.dir);
      return !!m && ((m.status === 'ok' && !!m.screenshots) || m.status === 'invalid_html');
    }));
  const skills = loadSkills().filter((s) => {
    if (!readyOnly || loadVendorInfo(s.id)?.skipReason || isReady(s.id)) return true; // skipped ones are dropped below
    console.log(`– ${s.id}: not complete yet, left out (--ready-only)`);
    return false;
  });
  const publicRuns = path.join(PUBLIC_DIR, 'runs');
  fs.rmSync(publicRuns, { recursive: true, force: true });
  // With ASSET_BASE (e.g. https://assets.skillarena.dev) the run files are served from R2
  // (npm run upload-assets) and nothing is copied into the site.
  const assetBase = (process.env.ASSET_BASE ?? '').replace(/\/+$/, '');
  const localDirs = new Map<string, string>();

  const skillRows = [
    {
      id: BASELINE_ID,
      name: 'No skill (baseline)',
      author: '—',
      description: 'Control group: only the shared generic instructions, no skill in the system prompt.',
      repo: null as string | null,
      homepage: null as string | null,
      commit: null as string | null,
      license: null as string | null,
      path: null as string | null,
      installName: null as string | null,
      usage: null as string | null,
      install: [] as { label: string; commands: string; note: string | null }[],
      referencesInlined: false,
      github: null as ReturnType<typeof githubFor>,
      isBaseline: true,
    },
    ...skills.flatMap((s) => {
      const info = loadVendorInfo(s.id);
      const before = prev.get(s.id); // without vendor/ (a fresh clone) keep what the last manifest knew
      if (info?.skipReason) return [];
      return [
        {
          id: s.id,
          name: s.name,
          author: s.author,
          description: (info?.description ?? before?.description ?? '').slice(0, 400),
          repo: s.repo,
          homepage: s.homepage ?? s.repo,
          commit: info?.commit ?? s.commit ?? null,
          license: s.license,
          path: s.path,
          installName: s.installName ?? s.path.split('/').pop() ?? s.id,
          usage: s.usage ?? null,
          install: (s.install ?? []).map((i) => ({ label: i.label, commands: i.commands.trim(), note: i.note ?? null })),
          referencesInlined: info ? info.inlinedReferences.length > 0 : !!before?.referencesInlined,
          github: githubFor(s.repo),
          isBaseline: false,
        },
      ];
    }),
  ];
  const known = new Set(skillRows.map((s) => s.id));

  const runs: Record<string, Record<string, ManifestRun[]>> = {};
  let totalCost = 0;
  let totalCalls = 0;
  const models = new Set<string>();
  let latest = '';

  for (const r of listRunDirs()) {
    if (!known.has(r.skillId) || !briefs.some((b) => b.id === r.briefId)) continue;
    const meta = readMeta(r.dir);
    if (!meta) continue;
    totalCost += meta.costUsd;
    totalCalls++;
    models.add(meta.model);
    if (meta.generatedAt > latest) latest = meta.generatedAt;

    // With ASSET_BASE the files are on the asset domain, so a clone with only meta.json still has screenshots.
    const hasShots = meta.status === 'ok' && (assetBase ? !!meta.screenshots : fs.existsSync(path.join(r.dir, 'thumb-desktop.webp')));
    let base: string | null = null;
    if (meta.status === 'ok') {
      const rel = path.join(r.briefId, r.skillId, `run-${r.run}`);
      if (!assetBase) {
        const dest = path.join(publicRuns, rel);
        fs.mkdirSync(dest, { recursive: true });
        for (const f of PUBLIC_FILES) {
          const src = path.join(r.dir, f);
          if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dest, f));
        }
      }
      base = `${assetBase}/runs/${rel.split(path.sep).join('/')}/`;
      localDirs.set(base, r.dir);
    }
    ((runs[r.briefId] ??= {})[r.skillId] ??= []).push({
      run: r.run,
      status: meta.status,
      error: meta.error,
      model: meta.model,
      generatedAt: meta.generatedAt,
      costUsd: meta.costUsd,
      outputTokens: meta.outputTokens,
      fullPageTruncated: meta.screenshots?.fullPageTruncated ?? false,
      base,
      v: createHash('sha256').update(`${meta.generatedAt}|${meta.screenshots?.takenAt ?? ''}`).digest('hex').slice(0, 8),
      hasShots,
    });
  }
  for (const b of Object.values(runs)) for (const list of Object.values(b)) list.sort((a, c) => a.run - c.run);

  // Default Open Graph image: grid of first-run thumbnails (baseline row + first skills).
  const ogDir = path.join(PUBLIC_DIR, 'og');
  fs.mkdirSync(ogDir, { recursive: true });
  const tiles: { input: string; left: number; top: number }[] = [];
  const cols = Math.min(briefs.length, 4);
  const tileW = 280, tileH = 175, gap = 16, top = 150;
  skillRows.slice(0, 2).forEach((s, row) =>
    briefs.slice(0, cols).forEach((b, col) => {
      const first = runs[b.id]?.[s.id]?.find((x) => x.hasShots);
      if (!first) return;
      const src = path.join(localDirs.get(first.base!)!, 'thumb-desktop.webp');
      if (!fs.existsSync(src)) return; // clone with meta.json only (assets on ASSET_BASE)
      tiles.push({ input: src, left: 40 + col * (tileW + gap), top: top + row * (tileH + gap) });
    }),
  );
  const resized = await Promise.all(
    tiles.map(async (t) => ({ ...t, input: await sharp(t.input).resize(tileW, tileH, { position: 'top' }).toBuffer() })),
  );
  const title = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="630" fill="#f6f6f4"/>
    <text x="40" y="78" font-family="Helvetica, Arial, sans-serif" font-size="52" font-weight="700" fill="#111">SkillArena</text>
    <text x="40" y="118" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#555">Same brief, different UI skills — compare before you install.</text></svg>`;
  // Without local thumbnails keep the existing image (npm run og draws the final one anyway).
  if (tiles.length || !fs.existsSync(path.join(ogDir, 'default.jpg')))
    await sharp(Buffer.from(title)).composite(resized).jpeg({ quality: 82 }).toFile(path.join(ogDir, 'default.jpg'));

  const manifest = {
    builtAt: new Date().toISOString(),
    lastGeneratedAt: latest || null,
    models: [...models],
    runsPerPair: runConfig.runsPerPair,
    mobileFirstBriefs: runConfig.mobileFirstBriefs,
    totals: { calls: totalCalls, costUsd: Number(totalCost.toFixed(4)) },
    briefs: briefs.map((b) => ({ id: b.id, title: b.title, text: b.text.trim() })),
    skills: skillRows,
    runs,
  };
  const out = path.join(DATA_DIR, 'manifest.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\nManifest: ${skillRows.length} skill rows × ${briefs.length} briefs, ${totalCalls} runs, total generation cost $${totalCost.toFixed(4)} → ${path.relative(process.cwd(), out)}`);
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv(); // ASSET_BASE
  await buildManifest({ readyOnly: process.argv.includes('--ready-only') });
}
