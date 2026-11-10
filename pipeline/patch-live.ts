/**
 * Post-generation patches for the live SkillArena pages (config/live-briefs/): fixes are applied to the
 * existing generated HTML instead of regenerating it, so each page keeps the layout its skill produced.
 *
 *   yarn patch-live [--skill a,b] [--dry-run]
 *   then: yarn upload-assets --brief skillarena-live
 *
 * Each patch is idempotent (a marked block, replaced when re-run) and recorded in meta.json → patches[].
 * Add new fixes here as new patches; never regenerate a live page to fix it. See HANDOFF.md.
 *
 * Patches (two kinds: a marked block added to every page, or an exact text fix for one page):
 * - fix-baseline-append-v1 (emil-mobile-native, mengto-progressive-blur): the generated code chained
 *   `th.append(div).append(badge)`; append() returns undefined, so rendering threw on the control-group row
 *   and the page showed "couldn't load the results". Split into two statements.
 * - thumb-live-v2 (replaces v1): matrix thumbnails (img from assets.skillarena.dev/runs/<brief>/<skill>/run-<n>/thumb-*.webp)
 *   get an "Open live page" link that appears on hover / keyboard focus (always on touch), opening that run's
 *   generated page in a new tab; thumbnails of the "SkillArena itself" brief (skillarena-home) open that skill's
 *   live page (skillarena-live/<skill>/run-1) instead. Same rule as the main site (SPEC 10.6). Works on any markup: the thumbnails
 *   are rendered at runtime, so a small script watches the DOM and adds the link next to each thumbnail.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { OUTPUT_DIR } from './lib.ts';

const LIVE_BRIEF = 'skillarena-live';

const THUMB_LIVE = {
  id: 'thumb-live-v2',
  block: `<style>
.sa-tl-host{position:relative}
.sa-tl{position:absolute;left:50%;bottom:10px;transform:translate(-50%,4px);opacity:0;pointer-events:none;z-index:5;display:inline-flex;align-items:center;padding:5px 10px;border-radius:999px;background:rgba(17,17,17,.86);color:#fff!important;font:600 12px/1.2 system-ui,-apple-system,sans-serif;white-space:nowrap;text-decoration:none!important;box-shadow:0 2px 8px rgba(0,0,0,.18);transition:opacity .15s,transform .15s}
.sa-tl-host:hover>.sa-tl,.sa-tl:focus-visible{opacity:1;transform:translate(-50%,0);pointer-events:auto}
.sa-tl:hover{background:#000}
@media (hover:none){.sa-tl{opacity:1;transform:translate(-50%,0);pointer-events:auto}}
</style>
<script>
(function () {
  var RE = /^https:\\/\\/assets\\.skillarena\\.dev\\/runs\\/([a-z0-9-]+)\\/([a-z0-9-]+)\\/run-(\\d+)\\/thumb-(?:desktop|mobile)\\.webp/;
  function add(img) {
    if (img.getAttribute('data-sa-tl')) return;
    var m = RE.exec(img.currentSrc || img.src || '');
    if (!m) return;
    img.setAttribute('data-sa-tl', '1');
    var wrap = img.closest('a') || img;
    var host = wrap.parentElement;
    if (!host) return;
    host.classList.add('sa-tl-host');
    var a = document.createElement('a');
    a.className = 'sa-tl';
    // "SkillArena itself" thumbnails open that skill's working live page; the others open the generated run.
    a.href = m[1] === 'skillarena-home'
      ? 'https://assets.skillarena.dev/runs/skillarena-live/' + m[2] + '/run-1/index.html?ref=live'
      : 'https://assets.skillarena.dev/runs/' + m[1] + '/' + m[2] + '/run-' + m[3] + '/index.html';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Open live page';
    host.appendChild(a);
  }
  function scan(root) {
    (root.querySelectorAll ? root : document).querySelectorAll('img').forEach(add);
  }
  scan(document);
  new MutationObserver(function (list) {
    list.forEach(function (r) {
      r.addedNodes.forEach(function (n) { if (n.nodeType === 1) { if (n.tagName === 'IMG') add(n); else scan(n); } });
      if (r.type === 'attributes' && r.target.tagName === 'IMG') add(r.target);
    });
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
})();
</script>`,
};

const PATCHES = [THUMB_LIVE];
/** Patch blocks that newer ones replace: removed from the pages and from meta.json. */
const OBSOLETE = ['thumb-live-v1'];

/** Exact text fixes for single pages: applied when `find` is present (so re-runs are no-ops). */
const FIXES: { id: string; skill: string; find: string; replace: string }[] = [
  {
    id: 'fix-baseline-append-v1',
    skill: 'emil-mobile-native',
    find: 'if (s.isBaseline) th.append(el("div", null)).append(el("span", "badge", "Control"));',
    replace: 'if (s.isBaseline) { var badgeRow = el("div", null); badgeRow.append(el("span", "badge", "Control")); th.append(badgeRow); }',
  },
  {
    id: 'fix-baseline-append-v1',
    skill: 'mengto-progressive-blur',
    find: 'if (s.isBaseline) th.append(el("div",null)).append(el("span","badge","control group"));',
    replace: 'if (s.isBaseline) { var badgeRow = el("div",null); badgeRow.append(el("span","badge","control group")); th.append(badgeRow); }',
  },
];

const { values } = parseArgs({ options: { skill: { type: 'string' }, 'dry-run': { type: 'boolean' } } });
const only = values.skill ? values.skill.split(',') : [];
const dir = path.join(OUTPUT_DIR, LIVE_BRIEF);
let changed = 0, same = 0, skipped = 0;
for (const skill of fs.readdirSync(dir).sort()) {
  if (only.length && !only.includes(skill)) continue;
  const skillDir = path.join(dir, skill);
  for (const run of fs.readdirSync(skillDir).filter((r) => /^run-\d+$/.test(r))) {
    const runDir = path.join(skillDir, run);
    const htmlFile = path.join(runDir, 'index.html');
    const metaFile = path.join(runDir, 'meta.json');
    if (!fs.existsSync(htmlFile)) {
      skipped++;
      continue;
    }
    let html = fs.readFileSync(htmlFile, 'utf8');
    const before = html;
    const applied: string[] = [];
    for (const f of FIXES.filter((x) => x.skill === skill)) {
      if (html.includes(f.find)) {
        html = html.split(f.find).join(f.replace);
        applied.push(f.id);
      }
    }
    for (const id of OBSOLETE) {
      html = html.replace(new RegExp(`<!-- sa-patch:${id} -->[\\s\\S]*?<!-- /sa-patch:${id} -->\\n?`), '');
    }
    for (const p of PATCHES) {
      const start = `<!-- sa-patch:${p.id} -->`;
      const end = `<!-- /sa-patch:${p.id} -->`;
      const block = `${start}\n${p.block}\n${end}`;
      const re = new RegExp(`${start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
      if (re.test(html)) html = html.replace(re, () => block);
      else {
        const i = html.toLowerCase().lastIndexOf('</body>');
        html = i >= 0 ? html.slice(0, i) + block + '\n' + html.slice(i) : html.replace(/<\/html>\s*$/i, `${block}\n</html>`);
      }
    }
    if (html === before) {
      same++;
      continue;
    }
    changed++;
    if (values['dry-run']) continue;
    fs.writeFileSync(htmlFile, html);
    if (fs.existsSync(metaFile)) {
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      meta.patches = [...new Set([...(meta.patches ?? []).filter((x: string) => !OBSOLETE.includes(x)), ...applied, ...PATCHES.map((p) => p.id)])];
      fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + '\n');
    }
  }
}
console.log(`${values['dry-run'] ? '[dry run] ' : ''}${changed} page(s) patched, ${same} already up to date, ${skipped} without index.html (patches: ${[...PATCHES.map((p) => p.id), ...new Set(FIXES.map((f) => f.id))].join(', ')})`);
