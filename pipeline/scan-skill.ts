/**
 * Static checks on the skill text that goes into the system prompt (SKILL.md + inlined references).
 * A skill is third-party text; these rules look for ways it could be poisoned:
 *   high   – hidden characters, instructions aimed at the agent's tools, secrets or the shell,
 *            encoded blobs. generate refuses the skill until a person has read it and set
 *            `scanReviewed: <commit>` for it in config/skills.yaml.
 *   medium – signs of gaming the benchmark (brief-specific text, whole pages to copy, huge size)
 *            or of putting the author's links into every result. Printed; generation continues.
 * Usage: npm run scan [-- --skill a,b]   (report for every fetched skill)
 */
import fs from 'node:fs';
import path from 'node:path';
import { BRIEFS_DIR, VENDOR_DIR, loadSkills, loadVendorInfo, type SkillEntry } from './lib.ts';

export type Finding = { level: 'high' | 'medium'; rule: string; detail: string };

/** The exact skill text generate puts into the prompt. */
export function skillPromptText(id: string): string | null {
  const info = loadVendorInfo(id);
  const dir = path.join(VENDOR_DIR, id);
  if (!info || !fs.existsSync(path.join(dir, 'SKILL.md'))) return null;
  let t = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
  for (const ref of info.inlinedReferences) t += `\n\n${fs.readFileSync(path.join(dir, ref), 'utf8')}`;
  return t;
}

const HIDDEN = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]|[\u{E0000}-\u{E007F}]/u;
const INJECTION: [string, RegExp][] = [
  ['override instructions', /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|system|all)\b[^.\n]{0,20}\b(instructions?|prompts?|rules?|messages?)\b/i],
  ['role hijack', /\byou are (now|no longer)\b|\bnew system prompt\b|\bdeveloper mode\b|\bjailbreak/i],
  ['secrets', /(~\/\.ssh|id_rsa|id_ed25519|\.aws\/credentials|\.netrc|keychain|\bprintenv\b|process\.env\b[^.\n]{0,40}(send|post|upload|fetch))/i],
  ['exfiltration', /\b(exfiltrat\w*|send (it|them|the (file|contents?|keys?|tokens?)) to|upload (it|them|the) to)\b/i],
  ['pipe to shell', /\b(curl|wget)\b[^\n|]{0,200}\|\s*(sudo\s+)?(ba|z)?sh\b|\bbase64\s+(-d|--decode)\b|\beval\s*\(\s*atob\b/i],
  ['hide from user', /\b(do not|don't|never) (tell|mention|reveal|show)\b[^.\n]{0,40}\b(user|human|anyone)\b/i],
];

export function scanText(text: string, briefTexts: string[] = []): Finding[] {
  const f: Finding[] = [];
  // A ZWJ between two emoji (👩🏽‍💻) is a normal emoji sequence, not hidden text.
  const hidden = [...text.replace(/(\p{Extended_Pictographic}[\u{1F3FB}-\u{1F3FF}\uFE0F]?)\u200D(?=\p{Extended_Pictographic})/gu, '$1').matchAll(new RegExp(HIDDEN.source, 'gu'))];
  if (hidden.length) f.push({ level: 'high', rule: 'hidden characters', detail: `${hidden.length} zero-width / bidi / tag character(s), e.g. U+${hidden[0][0].codePointAt(0)!.toString(16).toUpperCase()}` });
  for (const [rule, re] of INJECTION) {
    const m = re.exec(text);
    if (m) f.push({ level: 'high', rule, detail: JSON.stringify(m[0].slice(0, 100)) });
  }
  const blob = /[A-Za-z0-9+/]{300,}={0,2}/.exec(text);
  if (blob) f.push({ level: 'high', rule: 'encoded blob', detail: `${blob[0].length} chars of base64-like text` });

  const kb = Buffer.byteLength(text) / 1024;
  if (kb > 80) f.push({ level: 'medium', rule: 'size', detail: `${kb.toFixed(0)} KB of prompt text` });
  const docs = (text.match(/<!doctype html|<html[\s>]/gi) ?? []).length;
  const tags = (text.match(/<(section|div|header|footer|nav|main)[\s>]/gi) ?? []).length;
  if (docs > 0 || tags > 40) f.push({ level: 'medium', rule: 'page template', detail: `${docs} full HTML document(s), ${tags} layout tags: check it is not a page to copy` });
  // Distinctive lines of the briefs (≥ 6 words) appearing verbatim: the skill may target the benchmark.
  const lower = text.toLowerCase();
  for (const b of briefTexts) {
    const hit = b.split('\n').map((l) => l.replace(/^[#>*\-\s\d.]+/, '').trim()).find((l) => l.split(/\s+/).length >= 6 && lower.includes(l.toLowerCase()));
    if (hit) { f.push({ level: 'medium', rule: 'brief text', detail: JSON.stringify(hit.slice(0, 100)) }); break; }
  }
  if (/skillarena/i.test(text)) f.push({ level: 'medium', rule: 'mentions SkillArena', detail: 'the skill text names this benchmark' });
  const hosts = new Set([...text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()).filter((h) => !/(^|\.)(github\.com|githubusercontent\.com|w3\.org|mozilla\.org|web\.dev|developer\.apple\.com|material\.io|tailwindcss\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|jsdelivr\.net|cdnjs\.cloudflare\.com|schema\.org|example\.com)$/.test(h)));
  if (hosts.size > 5) f.push({ level: 'medium', rule: 'many outside links', detail: `${hosts.size} hosts, e.g. ${[...hosts].slice(0, 4).join(', ')}` });
  return f;
}

export const loadBriefTexts = () => fs.readdirSync(BRIEFS_DIR).filter((f) => f.endsWith('.md')).map((f) => fs.readFileSync(path.join(BRIEFS_DIR, f), 'utf8'));

/** Findings for a fetched skill, and whether a person has reviewed this commit (scanReviewed). */
export function scanSkill(s: SkillEntry & { scanReviewed?: string }, briefs = loadBriefTexts()) {
  const text = skillPromptText(s.id);
  if (text == null) return null;
  const findings = scanText(text, briefs);
  const commit = loadVendorInfo(s.id)?.commit ?? null;
  const reviewed = !!commit && s.scanReviewed === commit;
  return { findings, high: findings.some((x) => x.level === 'high'), reviewed, commit };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('scan-skill.ts')) {
  const i = process.argv.indexOf('--skill');
  const only = i > -1 ? process.argv[i + 1].split(',') : null;
  const briefs = loadBriefTexts();
  let high = 0, medium = 0, blockedCount = 0;
  for (const s of loadSkills()) {
    if (only && !only.includes(s.id)) continue;
    const r = scanSkill(s, briefs);
    if (!r) { console.log(`? ${s.id}: not fetched`); continue; }
    if (!r.findings.length) continue;
    const blocked = r.high && !r.reviewed;
    if (blocked) blockedCount++;
    if (r.high) high++; else medium++;
    console.log(`${blocked ? '✗' : r.high ? '✓ (reviewed)' : '!'} ${s.id} @ ${r.commit?.slice(0, 7)}`);
    for (const x of r.findings) console.log(`    ${x.level.padEnd(6)} ${x.rule}: ${x.detail}`);
  }
  console.log(`\n${high} skill(s) with high findings (generate refuses them unless scanReviewed = commit), ${medium} with medium only.`);
  if (blockedCount) {
    console.error(`${blockedCount} skill(s) blocked until reviewed (see above).`);
    process.exitCode = 1;
  }
}
