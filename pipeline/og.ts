// Renders web/public/og/default.jpg (1200×630): logo, wordmark, tagline and 8 run-1 thumbnails
// (no skill on top, frontend-design below; briefs 1–4). Run after `npm run screenshot`: npm run og
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const mark = fs.readFileSync(path.join(root, 'web/public/favicon.svg'), 'utf8');
const briefs = ['saas-landing', 'dashboard', 'mobile-app', 'signup-form'];
const rows = ['baseline', 'anthropic-frontend-design'];
const img = (b: string, s: string) => {
  const f = path.join(root, 'output', b, s, 'run-1', b === 'mobile-app' ? 'thumb-mobile.webp' : 'thumb-desktop.webp');
  return fs.existsSync(f) ? `data:image/webp;base64,${fs.readFileSync(f).toString('base64')}` : '';
};
const cells = rows.flatMap((s) => briefs.map((b) => `<div class="cell${b === 'mobile-app' ? ' m' : ''}">${img(b, s) ? `<img src="${img(b, s)}">` : ''}</div>`)).join('');
const html = `<!doctype html><style>
body{margin:0;width:1200px;height:630px;overflow:hidden;background:#f6f6f4;color:#18181b;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.top{display:flex;align-items:center;gap:20px;padding:44px 40px 0}.top svg{width:64px;height:64px}
.w{font-size:60px;font-weight:800;letter-spacing:-.03em;line-height:1}.w span{color:#ff5a1f}
p{margin:16px 40px 30px;font-size:27px;color:#52525b}
.g{display:grid;grid-template-columns:repeat(4,280px);gap:16px;padding:0 40px}
.cell{height:176px;overflow:hidden;background:#e4e4e0}.cell img{width:100%;display:block}.cell.m{display:flex;justify-content:center;background:#dcdcd6}.cell.m img{width:150px}
</style><div class="top">${mark}<div class="w">Skill<span>A</span>rena</div></div>
<p>Same brief, different UI skills — compare before you install.</p><div class="g">${cells}</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: path.join(root, 'web/public/og/default.jpg'), type: 'jpeg', quality: 85 });
await browser.close();
console.log('✓ web/public/og/default.jpg');
