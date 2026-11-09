/**
 * Jobs for an external generator (e.g. Codex with a GPT model): the same prompts generate.ts sends to Claude,
 * written to files, so another model can build the same pages and the results stay comparable.
 *
 *   yarn external-jobs export --model gpt-5.5 [--skill a,b] [--brief x] [--runs 1]
 *     → vendor/.jobs/<model>/<brief>/<skill>/run-<n>/{system.md, brief.md, job.json}
 *       (vendor/ is gitignored: system.md contains the skill text, which is never committed)
 *   yarn external-jobs run --model gpt-5.5 [--concurrency 3] [--codex-model <id>]
 *     → one fresh `codex exec` per job, writes output-ext/<model>/… (skips jobs already done)
 *   yarn external-jobs check --model gpt-5.5
 *     → validates output-ext/<model>/<brief>/<skill>/run-<n>/{index.html, meta.json} for every exported job
 *
 * See HANDOFF.md (cloud repo) for the generator's instructions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { BASELINE_ID, LIVE_BRIEFS_DIR, ROOT, VENDOR_DIR, loadBriefs, runConfig } from './lib.ts';
import { buildConditions, extractHtml } from './generate.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: 'string' },
    skill: { type: 'string' },
    brief: { type: 'string' },
    runs: { type: 'string' },
    concurrency: { type: 'string' },
    'codex-model': { type: 'string' },
  },
});
const cmd = positionals[0];
const model = values.model ?? '';
if (!['export', 'run', 'check'].includes(cmd ?? '') || !/^[a-z0-9][a-z0-9._-]{1,40}$/i.test(model)) {
  console.error('Usage: yarn external-jobs export|run|check --model <tag> [--skill a,b] [--brief x] [--runs 1] [--concurrency 3] [--codex-model <id>]');
  process.exit(2);
}
const list = (v?: string) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const JOBS_DIR = path.join(VENDOR_DIR, '..', '.jobs', model);
const OUT_DIR = path.join(ROOT, 'output-ext', model);

type Job = { briefId: string; skillId: string; run: number; skillCommit: string | null; referencesInlined: boolean; live: boolean; outputDir: string };

if (cmd === 'export') {
  const want = list(values.brief);
  const briefs = [...loadBriefs(), ...loadBriefs(LIVE_BRIEFS_DIR).filter((b) => want.includes(b.id))].filter((b) => !want.length || want.includes(b.id));
  const runs = values.runs ? Number(values.runs) : runConfig.runsPerPair;
  const { conditions, problems } = buildConditions(list(values.skill));
  problems.forEach((p) => console.warn(`! ${p}`));
  const { SYSTEM_BASE, SYSTEM_LIVE } = await import('../config/run.config.ts');
  fs.rmSync(JOBS_DIR, { recursive: true, force: true });
  const index: Job[] = [];
  for (const b of briefs)
    for (const c of conditions)
      for (let run = 1; run <= runs; run++) {
        const rel = path.join(b.id, c.skillId, `run-${run}`);
        const dir = path.join(JOBS_DIR, rel);
        fs.mkdirSync(dir, { recursive: true });
        const system = b.live ? SYSTEM_LIVE + c.system.slice(SYSTEM_BASE.length) : c.system;
        fs.writeFileSync(path.join(dir, 'system.md'), system);
        fs.writeFileSync(path.join(dir, 'brief.md'), b.text);
        const job: Job = {
          briefId: b.id, skillId: c.skillId, run, skillCommit: c.skillCommit, referencesInlined: c.referencesInlined, live: !!b.live,
          outputDir: path.relative(ROOT, path.join(OUT_DIR, rel)),
        };
        fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(job, null, 2) + '\n');
        index.push(job);
      }
  fs.writeFileSync(path.join(JOBS_DIR, 'jobs.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`${index.length} job(s) (${briefs.length} brief(s) × ${conditions.length} condition(s) × ${runs} run(s)) → ${path.relative(ROOT, JOBS_DIR)}/`);
  console.log(`Outputs go to ${path.relative(ROOT, OUT_DIR)}/<brief>/<skill>/run-<n>/`);
  if (!conditions.some((c) => c.skillId === BASELINE_ID)) console.log('Note: no baseline (no-skill) condition in this set.');
}

/**
 * run: one fresh `codex exec` per job (ephemeral session, read-only sandbox, empty working dir, so it cannot
 * read the repo or other results). Instructions = system.md, request = brief.md, like generate.ts does for Claude.
 * Codex adds its own agent prompt on top; that difference is recorded as backend "codex-exec".
 */
if (cmd === 'run') {
  const { spawn } = await import('node:child_process');
  const os = await import('node:os');
  const jobs = (JSON.parse(fs.readFileSync(path.join(JOBS_DIR, 'jobs.json'), 'utf8')) as Job[])
    .filter((j) => !values.skill || list(values.skill).includes(j.skillId))
    .filter((j) => !values.brief || list(values.brief).includes(j.briefId));
  const conc = Number(values.concurrency ?? 3);
  // The model actually used: --codex-model, else the default in ~/.codex/config.toml (exec events do not name it).
  const configured = (() => {
    try {
      const t = fs.readFileSync(path.join(os.homedir(), '.codex', 'config.toml'), 'utf8');
      const m = /^model\s*=\s*"([^"]+)"/m.exec(t);
      const e = /^model_reasoning_effort\s*=\s*"([^"]+)"/m.exec(t);
      return { model: m?.[1] ?? null, effort: e?.[1] ?? null };
    } catch {
      return { model: null, effort: null };
    }
  })();
  const codexModel = values['codex-model'];
  const usedModel = codexModel ?? configured.model ?? 'codex-default';
  console.log(`Codex model: ${usedModel}${configured.effort ? ` (reasoning effort ${configured.effort})` : ''}`);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-codex-'));
  const todo = jobs.filter((j) => {
    const f = path.join(ROOT, j.outputDir, 'meta.json');
    return !fs.existsSync(f) || JSON.parse(fs.readFileSync(f, 'utf8')).status === 'failed';
  });
  console.log(`${todo.length} of ${jobs.length} job(s) to run, ${conc} at a time`);
  const one = (j: Job) =>
    new Promise<void>((resolve) => {
      const jobDir = path.join(JOBS_DIR, j.briefId, j.skillId, `run-${j.run}`);
      const outDir = path.join(ROOT, j.outputDir);
      fs.rmSync(outDir, { recursive: true, force: true });
      fs.mkdirSync(outDir, { recursive: true });
      const last = path.join(outDir, 'raw.txt');
      const prompt =
        'Follow these instructions exactly. Do not run commands, read files or browse: answer from the instructions and the request alone.\n\n' +
        `<instructions>\n${fs.readFileSync(path.join(jobDir, 'system.md'), 'utf8').trim()}\n</instructions>\n\n` +
        `<request>\n${fs.readFileSync(path.join(jobDir, 'brief.md'), 'utf8').trim()}\n</request>`;
      const args = ['exec', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only', '-C', empty, '--json', '-o', last, ...(codexModel ? ['-m', codexModel] : []), '-'];
      const t0 = Date.now();
      const child = spawn('codex', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let events = '';
      let err = '';
      child.stdout.on('data', (d) => (events += d));
      child.stderr.on('data', (d) => (err += d));
      const timer = setTimeout(() => child.kill('SIGTERM'), 20 * 60 * 1000);
      child.on('close', (code) => {
        clearTimeout(timer);
        // Usage and model: take whatever the JSONL events report (field names differ between Codex versions).
        let inputTokens = 0, outputTokens = 0, model: string | null = null;
        for (const line of events.split('\n')) {
          try {
            const e = JSON.parse(line);
            const walk = (o: any) => {
              if (!o || typeof o !== 'object') return;
              if (typeof o.model === 'string') model = o.model;
              if (typeof o.input_tokens === 'number') inputTokens = Math.max(inputTokens, o.input_tokens);
              if (typeof o.output_tokens === 'number') outputTokens = Math.max(outputTokens, o.output_tokens);
              Object.values(o).forEach(walk);
            };
            walk(e);
          } catch {}
        }
        const text = fs.existsSync(last) ? fs.readFileSync(last, 'utf8') : '';
        const html = extractHtml(text);
        const meta = {
          briefId: j.briefId, skillId: j.skillId, run: j.run,
          model: model ?? usedModel,
          reasoningEffort: configured.effort,
          skillCommit: j.skillCommit, referencesInlined: j.referencesInlined,
          generatedAt: new Date().toISOString(), inputTokens, outputTokens, costUsd: 0, durationMs: Date.now() - t0,
          status: html ? 'ok' : code === 0 ? 'invalid_html' : 'failed',
          error: html ? null : code === 0 ? 'no <!DOCTYPE html>…</html> block in output' : `codex exit ${code}: ${err.slice(-300)}`,
          stopReason: null, backend: 'codex-exec', costIsEstimate: true,
        };
        if (html) {
          fs.writeFileSync(path.join(outDir, 'index.html'), html);
          fs.rmSync(last, { force: true });
        }
        fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
        console.log(`${html ? '✓' : '✗'} ${j.briefId}/${j.skillId}/run-${j.run} ${meta.status} · ${outputTokens} out · ${Math.round(meta.durationMs / 1000)}s${meta.error ? ` · ${meta.error.slice(0, 160)}` : ''}`);
        resolve();
      });
      child.stdin.end(prompt);
    });
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(conc, todo.length) }, async () => {
    while (i < todo.length) await one(todo[i++]);
  }));
  fs.rmSync(empty, { recursive: true, force: true });
}

if (cmd === 'check') {
  const indexFile = path.join(JOBS_DIR, 'jobs.json');
  if (!fs.existsSync(indexFile)) {
    console.error(`No jobs for ${model}: run "yarn external-jobs export --model ${model}" first.`);
    process.exit(1);
  }
  const jobs = JSON.parse(fs.readFileSync(indexFile, 'utf8')) as Job[];
  const REQUIRED = ['briefId', 'skillId', 'run', 'model', 'skillCommit', 'generatedAt', 'status', 'backend'];
  let ok = 0, missing = 0, bad = 0;
  for (const j of jobs) {
    const dir = path.join(ROOT, j.outputDir);
    const tag = `${j.briefId}/${j.skillId}/run-${j.run}`;
    const metaFile = path.join(dir, 'meta.json');
    if (!fs.existsSync(metaFile)) {
      missing++;
      continue;
    }
    const problems: string[] = [];
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    } catch {
      problems.push('meta.json is not valid JSON');
    }
    for (const k of REQUIRED) if (!(k in meta)) problems.push(`meta.json lacks "${k}"`);
    if (meta.briefId !== j.briefId || meta.skillId !== j.skillId || meta.run !== j.run) problems.push('meta.json ids do not match the job');
    if (meta.skillCommit !== j.skillCommit) problems.push('skillCommit does not match job.json');
    if (meta.status === 'ok') {
      const htmlFile = path.join(dir, 'index.html');
      const html = fs.existsSync(htmlFile) ? fs.readFileSync(htmlFile, 'utf8') : '';
      if (!html) problems.push('status ok but index.html is missing');
      else if (extractHtml(html) !== html.trim()) problems.push('index.html must start with <!DOCTYPE html> and end with </html>, nothing around it');
    } else if (!['failed', 'invalid_html'].includes(String(meta.status))) problems.push(`unknown status "${String(meta.status)}"`);
    if (problems.length) {
      bad++;
      console.log(`✗ ${tag}: ${problems.join('; ')}`);
    } else ok++;
  }
  console.log(`${jobs.length} job(s): ${ok} done, ${bad} with problems, ${missing} not started`);
  if (bad) process.exitCode = 1;
}
