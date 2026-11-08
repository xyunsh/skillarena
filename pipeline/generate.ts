/**
 * Generates HTML pages: (baseline + skills) × briefs × runs.
 *
 * Usage: npm run generate -- [--skill baseline,<id>] [--brief saas-landing] [--runs 1] [--force] [--yes] [--dry-run] [--mock]
 *   --dry-run  only print the plan + cost estimate
 *   --yes      skip the interactive cost confirmation
 *   --mock     write placeholder HTML without calling the API (pipeline smoke test, $0)
 */
import Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'node:child_process';
import { loadBriefTexts, scanSkill } from './scan-skill.ts';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import {
  BASELINE_ID,
  ROOT,
  VENDOR_DIR,
  loadBriefs,
  loadEnv,
  loadSkills,
  loadVendorInfo,
  parseCli,
  pool,
  readMeta,
  runConfig,
  runDir,
  sleep,
  writeMeta,
  type RunMeta,
} from './lib.ts';
import { SYSTEM_BASE } from '../config/run.config.ts';

interface Condition {
  skillId: string;
  system: string;
  skillCommit: string | null;
  referencesInlined: boolean;
}

export function buildConditions(skillFilter: string[]): { conditions: Condition[]; problems: string[] } {
  const conditions: Condition[] = [];
  const problems: string[] = [];
  const want = (id: string) => !skillFilter.length || skillFilter.includes(id);
  if (want(BASELINE_ID)) conditions.push({ skillId: BASELINE_ID, system: SYSTEM_BASE, skillCommit: null, referencesInlined: false });
  const briefTexts = loadBriefTexts();
  for (const s of loadSkills()) {
    if (!want(s.id)) continue;
    const info = loadVendorInfo(s.id);
    if (!info) {
      problems.push(`${s.id}: not fetched yet (run npm run fetch-skills)`);
      continue;
    }
    if (info.skipReason) {
      problems.push(`${s.id}: skipped – ${info.skipReason}`);
      continue;
    }
    const scan = scanSkill(s, briefTexts);
    if (scan?.high && !scan.reviewed) {
      const why = scan.findings.filter((x) => x.level === 'high').map((x) => `${x.rule}: ${x.detail}`).join('; ');
      problems.push(`${s.id}: refused – skill text has high-risk scan findings (${why}). Read it (npm run scan -- --skill ${s.id}); if it is fine, set scanReviewed: ${scan.commit} in config/skills.yaml`);
      continue;
    }
    const dir = path.join(VENDOR_DIR, s.id);
    let system = `${SYSTEM_BASE}\n\n${fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8').trim()}`;
    for (const ref of info.inlinedReferences) {
      system += `\n\n---\n# ${ref}\n\n${fs.readFileSync(path.join(dir, ref), 'utf8').trim()}`;
    }
    conditions.push({ skillId: s.id, system, skillCommit: info.commit, referencesInlined: info.inlinedReferences.length > 0 });
  }
  for (const id of skillFilter) {
    if (id !== BASELINE_ID && !loadSkills().some((s) => s.id === id)) problems.push(`${id}: not in config/skills.yaml`);
  }
  return { conditions, problems };
}

/** Very rough token estimate (mixed CJK/English) – only used for the pre-run cost estimate. */
const approxTokens = (s: string) => Math.ceil(s.length / 3);
const costOf = (inTok: number, outTok: number) =>
  (inTok * runConfig.pricing.inputPerMTok + outTok * runConfig.pricing.outputPerMTok) / 1e6;

export function extractHtml(text: string): string | null {
  const start = text.search(/<!DOCTYPE html/i);
  const end = text.toLowerCase().lastIndexOf('</html>');
  if (start < 0 || end < start) return null;
  return text.slice(start, end + '</html>'.length);
}

function isRetryable(e: unknown) {
  if (e instanceof RetryableError) return true;
  if (e instanceof Anthropic.APIConnectionError) return true; // includes timeouts
  if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError) return true;
  if (e instanceof Anthropic.APIError) return e.status === 408 || e.status === 409 || (e.status ?? 0) >= 500 || e.status === 529;
  return false;
}

function mockHtml(briefId: string, skillId: string, run: number) {
  const hue = [...`${skillId}${briefId}`].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MOCK ${briefId} / ${skillId} / ${run}</title>
<style>body{margin:0;font:16px system-ui;background:hsl(${hue} 60% 96%);color:#222}
header{padding:80px 24px;background:hsl(${hue} 55% 45%);color:#fff;text-align:center}
section{max-width:900px;margin:40px auto;padding:0 24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.card{background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px #0002;min-height:${200 + run * 40}px}</style></head>
<body><header><h1>MOCK — ${briefId}</h1><p>${skillId} · run ${run}</p><button onclick="this.textContent='clicked'">Button</button></header>
<section>${Array.from({ length: 6 }, (_, i) => `<div class="card">Card ${i + 1}</div>`).join('')}</section></body></html>`;
}

interface CallResult {
  text: string;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  /** Set when the backend reports its own cost (claude CLI). */
  costUsd?: number;
  refusalCategory?: string | null;
}

class RetryableError extends Error {}

const CLI_CWD = path.join(ROOT, 'vendor', '.cli-cwd'); // empty, stable dir → identical env block for every call
const CLI_PROMPTS = path.join(ROOT, 'vendor', '.cli-prompts');

/**
 * Generates via the local Claude Code CLI (`claude -p`) using the user's existing login instead of an API key.
 * The default Claude Code system prompt is replaced by ours; tools, MCP, settings, slash commands and skills are off.
 * The CLI still adds a short SDK prefix + environment block (cwd/date/model) — identical for every condition.
 */
function callCli(cond: Condition, briefText: string): Promise<CallResult> {
  fs.mkdirSync(CLI_CWD, { recursive: true });
  fs.mkdirSync(CLI_PROMPTS, { recursive: true });
  const sysFile = path.join(CLI_PROMPTS, `${cond.skillId}.txt`);
  fs.writeFileSync(sysFile, cond.system);
  const args = [
    '-p',
    '--model', runConfig.model,
    '--system-prompt-file', sysFile,
    '--tools', '',
    '--strict-mcp-config',
    '--setting-sources', '',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--output-format', 'json',
  ];
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, {
      cwd: CLI_CWD,
      env: { ...process.env, CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(runConfig.maxTokens) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), 15 * 60 * 1000);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`could not start claude CLI: ${e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      let r: any;
      try {
        r = JSON.parse(out);
      } catch {
        return reject(new RetryableError(`claude CLI exit ${code}: ${(err || out).slice(0, 300)}`));
      }
      if (r.is_error && r.stop_reason !== 'max_tokens' && r.stop_reason !== 'refusal') {
        return reject(new RetryableError(`claude CLI error: ${String(r.result ?? r.subtype ?? '').slice(0, 300)}`));
      }
      const u = r.usage ?? {};
      // When a response hits the output cap the CLI auto-continues in another turn and `result` holds only the
      // last turn's text, so a multi-turn result means the page was truncated at max_tokens.
      const continued = (r.num_turns ?? 1) > 1 || (u.iterations?.length ?? 1) > 1;
      resolve({
        text: String(r.result ?? ''),
        stopReason: continued ? 'max_tokens' : r.stop_reason ?? null,
        inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
        outputTokens: u.output_tokens ?? 0,
        costUsd: typeof r.total_cost_usd === 'number' ? r.total_cost_usd : undefined,
        refusalCategory: null,
      });
    });
    child.stdin.end(briefText);
  });
}

async function callApi(client: Anthropic, cond: Condition, briefText: string): Promise<CallResult> {
  const stream = client.messages.stream({
    model: runConfig.model,
    max_tokens: runConfig.maxTokens,
    system: cond.system,
    messages: [{ role: 'user', content: briefText }],
  });
  const msg = await stream.finalMessage();
  const u = msg.usage;
  return {
    text: msg.content.map((b) => (b.type === 'text' ? b.text : '')).join(''),
    stopReason: msg.stop_reason,
    inputTokens: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    outputTokens: u.output_tokens,
    refusalCategory: msg.stop_details?.category ?? null,
  };
}

async function confirm(question: string) {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question(question);
  rl.close();
  return /^y(es)?$/i.test(ans.trim());
}

export async function generate(cli: ReturnType<typeof parseCli>) {
  loadEnv();
  const briefs = loadBriefs().filter((b) => !cli.briefs.length || cli.briefs.includes(b.id));
  for (const id of cli.briefs) if (!briefs.some((b) => b.id === id)) console.warn(`! brief "${id}" not found in config/briefs/`);
  const { conditions, problems } = buildConditions(cli.skills);
  problems.forEach((p) => console.warn(`! ${p}`));

  type Job = { cond: Condition; brief: (typeof briefs)[number]; run: number; dir: string };
  const jobs: Job[] = [];
  let skipped = 0;
  for (const brief of briefs)
    for (const cond of conditions)
      for (let run = 1; run <= cli.runs; run++) {
        const dir = runDir(brief.id, cond.skillId, run);
        const meta = readMeta(dir);
        const reusable = meta && meta.status !== 'failed' && (cli.mock || meta.model !== 'mock');
        if (reusable && !cli.force) {
          skipped++;
          continue;
        }
        jobs.push({ cond, brief, run, dir });
      }

  const estIn = jobs.reduce((a, j) => a + approxTokens(j.cond.system) + approxTokens(j.brief.text), 0);
  const estOut = jobs.length * runConfig.estimatedOutputTokens;
  const estCost = costOf(estIn, estOut);
  console.log(
    `\nPlan: ${jobs.length} generation call(s) (${skipped} already done, skipped) · model ${cli.mock ? "mock" : runConfig.model} · backend ${cli.mock ? "mock" : cli.backend}\n` +
      `      est. ~${(estIn / 1e3).toFixed(0)}k input + ~${(estOut / 1e3).toFixed(0)}k output tokens ≈ $${estCost.toFixed(2)}` +
      ` (budget cap $${runConfig.budgetUsd})\n`,
  );
  if (!jobs.length || cli.dryRun) return { jobs: 0, costUsd: 0 };

  let client: Anthropic | null = null;
  const useCli = cli.backend === 'cli';
  if (!cli.mock) {
    if (!useCli && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new Error('ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in, or use --backend cli.');
    }
    if (estCost > runConfig.budgetUsd) throw new Error(`Estimated cost $${estCost.toFixed(2)} exceeds budget $${runConfig.budgetUsd}. Narrow with --skill/--brief/--runs.`);
    if (jobs.length > 1 && !cli.yes && !(await confirm(`Proceed with ${jobs.length} calls (≈ $${estCost.toFixed(2)})? [y/N] `))) {
      console.log('Aborted. Re-run with --yes to skip this prompt.');
      return { jobs: 0, costUsd: 0 };
    }
    if (!useCli) client = new Anthropic({ maxRetries: 0, timeout: 15 * 60 * 1000 });
  }

  let spent = 0;
  let stopped = false;
  const perCallEst = estCost / jobs.length;

  await pool(jobs, runConfig.concurrency, async ({ cond, brief, run, dir }) => {
    const tag = `${brief.id}/${cond.skillId}/run-${run}`;
    if (stopped || spent + perCallEst > runConfig.budgetUsd) {
      if (!stopped) console.warn(`! budget cap $${runConfig.budgetUsd} reached – stopping`);
      stopped = true;
      return;
    }
    const meta: RunMeta = {
      briefId: brief.id,
      skillId: cond.skillId,
      run,
      model: cli.mock ? 'mock' : runConfig.model,
      skillCommit: cond.skillCommit,
      referencesInlined: cond.referencesInlined,
      generatedAt: new Date().toISOString(),
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durationMs: 0,
      status: 'failed',
      error: null,
      stopReason: null,
      backend: cli.mock ? undefined : useCli ? 'claude-cli' : 'api',
      costIsEstimate: useCli || undefined,
    };
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const t0 = Date.now();

    if (cli.mock) {
      fs.writeFileSync(path.join(dir, 'index.html'), mockHtml(brief.id, cond.skillId, run));
      meta.status = 'ok';
      meta.durationMs = Date.now() - t0;
      writeMeta(dir, meta);
      console.log(`✓ ${tag} (mock)`);
      return;
    }

    for (let attempt = 0; attempt <= runConfig.retries; attempt++) {
      try {
        const res = useCli ? await callCli(cond, brief.text) : await callApi(client!, cond, brief.text);
        meta.inputTokens += res.inputTokens;
        meta.outputTokens += res.outputTokens;
        if (res.costUsd !== undefined) meta.costUsd += res.costUsd;
        meta.stopReason = res.stopReason;
        const text = res.text;
        const html = res.stopReason === 'max_tokens' ? null : extractHtml(text);
        if (res.stopReason === 'refusal') {
          meta.status = 'failed';
          meta.error = `refusal${res.refusalCategory ? ` (${res.refusalCategory})` : ''}`;
        } else if (html) {
          fs.writeFileSync(path.join(dir, 'index.html'), html);
          meta.status = 'ok';
          meta.error = null;
        } else {
          meta.status = 'invalid_html';
          meta.error = res.stopReason === 'max_tokens' ? `truncated at max_tokens=${runConfig.maxTokens}` : 'no <!DOCTYPE html>…</html> block in output';
        }
        if (meta.status !== 'ok') fs.writeFileSync(path.join(dir, 'raw.txt'), text);
        break;
      } catch (e) {
        meta.error = (e as Error).message?.slice(0, 500) ?? String(e);
        if (attempt < runConfig.retries && isRetryable(e)) {
          const wait = 2000 * 2 ** attempt + Math.random() * 1000;
          console.warn(`… ${tag} attempt ${attempt + 1} failed (${meta.error}); retrying in ${(wait / 1000).toFixed(1)}s`);
          await sleep(wait);
          continue;
        }
        meta.status = 'failed';
        break;
      }
    }
    meta.durationMs = Date.now() - t0;
    meta.costUsd = Number((useCli && meta.costUsd ? meta.costUsd : costOf(meta.inputTokens, meta.outputTokens)).toFixed(5));
    spent += meta.costUsd;
    writeMeta(dir, meta);
    const mark = meta.status === 'ok' ? '✓' : '✗';
    console.log(
      `${mark} ${tag} ${meta.status} · ${meta.inputTokens} in / ${meta.outputTokens} out · $${meta.costUsd.toFixed(4)} · ${(meta.durationMs / 1000).toFixed(0)}s${meta.error ? ` · ${meta.error}` : ''}`,
    );
  });

  console.log(`\nActual spend this run: $${spent.toFixed(4)}`);
  return { jobs: jobs.length, costUsd: spent };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await generate(parseCli());
}
