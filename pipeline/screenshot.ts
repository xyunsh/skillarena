/**
 * Screenshots every generated page (status ok) with Playwright/Chromium.
 * Outputs per run dir: desktop.png (1440×900), desktop-full.png (≤8000px tall), mobile.png (390×844), all @2x,
 * plus webp versions for the site: desktop.webp, desktop-full.webp, mobile.webp, thumb-desktop.webp, thumb-mobile.webp, og.jpg.
 *
 * Usage: npm run screenshot -- [--skill x] [--brief y] [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import sharp from 'sharp';
import { guardContext } from './net-guard.ts';
import { listRunDirs, parseCli, pool, readMeta, runConfig, writeMeta } from './lib.ts';

const { viewports, deviceScaleFactor: dsf, fullPageMaxHeight, thumbnailWidth } = runConfig;

async function load(page: Page, url: string) {
  let timedOut = false;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: runConfig.networkIdleTimeoutMs });
  } catch {
    timedOut = true; // keep going with whatever rendered
  }
  await page.waitForTimeout(runConfig.settleMs);
  return timedOut;
}

/**
 * Scroll down one screen at a time so scroll-triggered reveals (IntersectionObserver, lazy images) run,
 * then return to the top. A full-page screenshot alone never scrolls, so such sections stay hidden.
 * Returns how many large elements are still invisible afterwards (reveals that hide again on scroll-out).
 */
async function revealByScrolling(page: Page, maxHeight: number) {
  // In-page code is passed as strings: tsx/esbuild would wrap named functions with a __name helper
  // that does not exist in the browser.
  await page.evaluate(`(async () => {
    const max = ${maxHeight};
    const step = Math.round(innerHeight * 0.8);
    for (let y = 0; y < Math.min(document.documentElement.scrollHeight, max); y += step) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    scrollTo(0, Math.min(document.documentElement.scrollHeight, max));
    await new Promise((r) => setTimeout(r, 500));
    scrollTo(0, 0);
    // App-like pages scroll inside their own container (e.g. a phone frame): scroll those too.
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowY) || el.scrollHeight <= el.clientHeight + 40 || el.clientHeight < 200) continue;
      for (let y = 0; y < el.scrollHeight; y += Math.round(el.clientHeight * 0.8)) {
        el.scrollTop = y;
        await new Promise((r) => setTimeout(r, 120));
      }
      el.scrollTop = 0;
    }
  })()`);
  await page.waitForTimeout(runConfig.settleMs);
  return page.evaluate<number>(`(() => {
    let n = 0;
    for (const el of document.body.querySelectorAll('section, article, main > *, [class*="reveal"], [data-reveal], [data-animate]')) {
      const r = el.getBoundingClientRect();
      if (r.top + scrollY > ${maxHeight} || r.height < 40 || r.width < 40) continue;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.position === 'absolute') continue; // closed sheets, menus, toasts
      if (cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) < 0.05) n++;
    }
    return n;
  })()`);
}

async function shoot(browser: Browser, dir: string) {
  const url = pathToFileURL(path.join(dir, 'index.html')).href;
  const out = (f: string) => path.join(dir, f);

  // Desktop
  const dctx = await browser.newContext({ viewport: viewports.desktop, deviceScaleFactor: dsf });
  const blocked = await guardContext(dctx, dir);
  const dpage = await dctx.newPage();
  const timedOut1 = await load(dpage, url);
  await dpage.screenshot({ path: out('desktop.png') });
  const hiddenAfterScroll = await revealByScrolling(dpage, fullPageMaxHeight);
  const fullHeight = await dpage.evaluate(() =>
    Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
  );
  const truncated = fullHeight > fullPageMaxHeight;
  await dpage.screenshot({
    path: out('desktop-full.png'),
    fullPage: true,
    clip: { x: 0, y: 0, width: viewports.desktop.width, height: Math.min(fullHeight, fullPageMaxHeight) },
  });
  await dctx.close();

  // Mobile
  const mctx = await browser.newContext({ viewport: viewports.mobile, deviceScaleFactor: dsf, isMobile: true, hasTouch: true });
  blocked.push(...(await guardContext(mctx, dir)));
  const mpage = await mctx.newPage();
  const timedOut2 = await load(mpage, url);
  await mpage.screenshot({ path: out('mobile.png') });
  await mctx.close();

  // Derived images for the site
  await Promise.all([
    sharp(out('desktop.png')).webp({ quality: 82 }).toFile(out('desktop.webp')),
    sharp(out('desktop-full.png')).webp({ quality: 78 }).toFile(out('desktop-full.webp')),
    sharp(out('mobile.png')).webp({ quality: 82 }).toFile(out('mobile.webp')),
    sharp(out('desktop.png')).resize({ width: thumbnailWidth }).webp({ quality: 75 }).toFile(out('thumb-desktop.webp')),
    sharp(out('mobile.png')).resize({ width: Math.round(thumbnailWidth / 2) }).webp({ quality: 75 }).toFile(out('thumb-mobile.webp')),
    sharp(out('desktop.png')).resize({ width: 1200, height: 630, position: 'top' }).jpeg({ quality: 80 }).toFile(out('og.jpg')),
  ]);

  return { fullPageHeight: fullHeight, fullPageTruncated: truncated, networkIdleTimedOut: timedOut1 || timedOut2, scrolledForReveal: true, hiddenAfterScroll, blockedRequests: [...new Set(blocked)].slice(0, 20) };
}

export async function screenshot(cli: ReturnType<typeof parseCli>) {
  const runs = listRunDirs({ skills: cli.skills, briefs: cli.briefs })
    .map((r) => ({ ...r, meta: readMeta(r.dir) }))
    .filter((r) => r.meta?.status === 'ok' && fs.existsSync(path.join(r.dir, 'index.html')))
    .filter((r) => cli.force || !r.meta!.screenshots || !fs.existsSync(path.join(r.dir, 'thumb-desktop.webp')));
  console.log(`\nScreenshots: ${runs.length} page(s) to capture`);
  if (!runs.length) return;

  const browser = await chromium.launch();
  try {
    await pool(runs, 3, async (r) => {
      const tag = `${r.briefId}/${r.skillId}/run-${r.run}`;
      try {
        const info = await shoot(browser, r.dir);
        const meta = readMeta(r.dir)!;
        meta.screenshots = { takenAt: new Date().toISOString(), ...info };
        writeMeta(r.dir, meta);
        console.log(`✓ ${tag} (${info.fullPageHeight}px${info.fullPageTruncated ? ', truncated' : ''}${info.networkIdleTimedOut ? ', networkidle timeout' : ''}${info.hiddenAfterScroll ? `, ⚠ ${info.hiddenAfterScroll} still hidden` : ''}${info.blockedRequests.length ? `, ⛔ blocked ${info.blockedRequests.length} local request(s): ${info.blockedRequests[0]}` : ''})`);
      } catch (e) {
        console.error(`✗ ${tag}: ${(e as Error).message}`);
        process.exitCode = 1;
      }
    });
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await screenshot(parseCli());
}
