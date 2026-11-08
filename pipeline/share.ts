/**
 * Share images for promotion (1600×900, X / LinkedIn friendly), from run-1 screenshots.
 *   npm run share                                   → every brief: 4-up grid (no skill + 3 skills), and
 *                                                     every skill: "no skill vs this skill" on each brief
 *   npm run share -- --brief saas-landing --skills taste-soft,better-ui,anthropic-frontend-design
 * Output: share/ (gitignored). Mobile-first briefs use the mobile screenshots.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import manifest from '../web/data/manifest.json' with { type: 'json' };

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'share');
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : ''; };
const mark = fs.readFileSync(path.join(ROOT, 'web/public/favicon.svg'), 'utf8');
type Skill = (typeof manifest.skills)[number];
const skills = manifest.skills as Skill[];
const briefs = manifest.briefs;
const model = manifest.models.join(', ').replace('claude-opus-5-5', 'Claude Opus 5.5');
const mobileFirst = (b: string) => manifest.mobileFirstBriefs.includes(b);
const shot = (b: string, s: string) => {
  const f = path.join(ROOT, 'output', b, s, 'run-1', mobileFirst(b) ? 'mobile.webp' : 'desktop.webp');
  return fs.existsSync(f) ? `data:image/webp;base64,${fs.readFileSync(f).toString('base64')}` : null;
};
const label = (s: Skill) => (s.isBaseline ? 'No skill' : s.name);
const by = (s: Skill) => (s.isBaseline ? 'control group' : `by ${s.author}`);
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const page = (title: string, sub: string, cells: { s: Skill; img: string }[], mobile: boolean) => `<!doctype html><style>
*{box-sizing:border-box}body{margin:0;width:1600px;height:900px;overflow:hidden;background:#f6f6f4;color:#18181b;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;padding:34px 44px 26px}
header{display:flex;align-items:center;gap:14px}header svg{width:40px;height:40px;flex:none}.w{font-size:30px;font-weight:800;letter-spacing:-.03em}.w span{color:#ff5a1f}
h1{font-size:30px;margin:0 0 0 22px;font-weight:700;letter-spacing:-.01em}.sub{margin-left:auto;font-size:18px;color:#52525b;text-align:right}
.g{flex:1;display:grid;grid-template-columns:repeat(${cells.length === 2 ? 2 : mobile ? 4 : 2},1fr);gap:20px;margin:24px 0 16px;min-height:0}
.c{display:flex;flex-direction:column;min-height:0;min-width:0}.f{flex:1;min-height:0;border-radius:12px;overflow:hidden;background:#fff;border:1px solid #e4e4e0;${mobile ? 'display:flex;justify-content:center;background:#e9e9e5' : ''}}
.f img{display:block;${mobile ? 'height:100%;width:auto;max-width:100%;object-fit:cover;object-position:top' : 'width:100%;height:100%;object-fit:cover;object-position:top'}}
.l{display:flex;align-items:baseline;gap:10px;margin-top:10px;font-size:21px;white-space:nowrap;min-width:0}.l b{font-weight:700;overflow:hidden;text-overflow:ellipsis}.l span{color:#52525b;font-size:17px;flex:none}.c.base .l b{color:#52525b}
footer{font-size:16px;color:#5f5f68}footer b{color:#18181b}
</style><header>${mark}<div class="w">Skill<span>A</span>rena</div><h1>${esc(title)}</h1><div class="sub">${esc(sub)}</div></header>
<div class="g">${cells.map(({ s, img }) => `<div class="c${s.isBaseline ? ' base' : ''}"><div class="f"><img src="${img}"></div><div class="l"><b>${esc(label(s))}</b><span>${esc(by(s))}</span></div></div>`).join('')}</div>
<footer>Same brief, same model (${esc(model)}), only the skill changes · run 1 of ${manifest.runsPerPair} · <b>skillarena.dev</b></footer>`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const tab = await ctx.newPage();
const render = async (file: string, html: string) => {
  await tab.setContent(html, { waitUntil: 'load' });
  await tab.screenshot({ path: path.join(OUT, file), type: 'png' });
  console.log(`✓ share/${file}`);
};
fs.mkdirSync(OUT, { recursive: true });
const pick = arg('skills') ? arg('skills').split(',') : [];
const onlyBrief = arg('brief');
const baseline = skills.find((s) => s.isBaseline)!;
const real = skills.filter((s) => !s.isBaseline);

for (const b of briefs.filter((x) => !onlyBrief || x.id === onlyBrief)) {
  // 4-up: baseline + 3 skills (the --skills list in that order, or the first three in skills.yaml).
  const chosen = pick.length ? pick.map((id) => real.find((s) => s.id === id)).filter((s): s is Skill => !!s) : real.filter((s) => shot(b.id, s.id)).slice(0, 3);
  const cells = [baseline, ...chosen].map((s) => ({ s, img: shot(b.id, s.id) })).filter((c): c is { s: Skill; img: string } => !!c.img);
  if (cells.length >= 2) await render(`brief-${b.id}.png`, page(b.title, 'One brief, different UI skills', cells, mobileFirst(b.id)));
  if (pick.length) continue;
  // Per skill: no skill vs this skill (for author outreach).
  for (const s of real) {
    const a = shot(b.id, baseline.id), c = shot(b.id, s.id);
    if (a && c) await render(`skill-${s.id}-${b.id}.png`, page(b.title, `${s.name} vs no skill`, [{ s: baseline, img: a }, { s, img: c }], mobileFirst(b.id)));
  }
}
await browser.close();
