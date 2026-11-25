/**
 * Writes web/data/headlines.json: the visible <h1> text of every published main-model page, per brief, skill and run.
 * Only runs already in web/data/manifest.json are read, so unpublished batches never leak into the site.
 * The site uses it for counts such as "N of M landing pages open with …" (web/lib/findings.ts). Generated pages are
 * untrusted: only plain text is kept, cut to 200 characters, and the site renders it as text.
 *
 * Usage: yarn headlines   (run after yarn manifest)
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, runDir } from './lib.ts';

type Manifest = { runs: Record<string, Record<string, { run: number; status: string }[]>> };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', mdash: '—', ndash: '–', hellip: '…' };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** Text of the first <h1>, without tags, scripts or styles; null when the page has none. */
export function firstH1(html: string): string | null {
  const m = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return null;
  const text = decode(m[1].replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, 200) : null;
}

const manifest = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'manifest.json'), 'utf8')) as Manifest;
const out: Record<string, Record<string, (string | null)[]>> = {};
let pages = 0;
let missing = 0;
for (const [briefId, bySkill] of Object.entries(manifest.runs)) {
  for (const [skillId, runs] of Object.entries(bySkill)) {
    const list: (string | null)[] = [];
    for (const r of runs) {
      const f = path.join(runDir(briefId, skillId, r.run), 'index.html');
      if (r.status !== 'ok' || !fs.existsSync(f)) {
        if (r.status === 'ok') missing++;
        list[r.run - 1] = null;
        continue;
      }
      list[r.run - 1] = firstH1(fs.readFileSync(f, 'utf8'));
      pages++;
    }
    (out[briefId] ??= {})[skillId] = list;
  }
}
fs.writeFileSync(path.join(DATA_DIR, 'headlines.json'), JSON.stringify({ briefs: out }, null, 1) + '\n');
console.log(`headlines.json: ${pages} pages${missing ? `, ${missing} ok runs without a local index.html (left null)` : ''}`);
