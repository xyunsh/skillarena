/**
 * Network guard for rendering untrusted generated pages (pipeline/screenshot.ts).
 * A generated page is model output steered by a third-party SKILL.md, so it must not reach this
 * machine or its network: no localhost, private/link-local/CGNAT ranges, *.local, other local files.
 * Public hosts (fonts, CDNs, images) stay allowed so pages render as a visitor would see them.
 * Hostnames are resolved and every address checked, so a public name pointing at 127.0.0.1 is blocked too.
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext } from 'playwright';

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
  return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff');
}

const verdicts = new Map<string, Promise<boolean>>();
/** True when the host is public: not a private literal, not a local name, and every resolved address public. */
function hostAllowed(host: string): Promise<boolean> {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!verdicts.has(h)) {
    verdicts.set(h, (async () => {
      if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !net.isIP(h)) return false;
      if (net.isIP(h)) return !isPrivateAddress(h);
      try {
        const addrs = await dns.lookup(h, { all: true, verbatim: true });
        return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
      } catch {
        return false;
      }
    })());
  }
  return verdicts.get(h)!;
}

/**
 * Routes every request of the context through the guard. `pageDir` is the run folder: file:// URLs
 * inside it are allowed (the page itself), any other file:// URL is blocked.
 * Returns the list of blocked URLs (for logging).
 */
export async function guardContext(ctx: BrowserContext, pageDir: string): Promise<string[]> {
  const blocked: string[] = [];
  const root = path.resolve(pageDir) + path.sep;
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    let ok = false;
    try {
      const u = new URL(url);
      if (u.protocol === 'file:') ok = (path.resolve(fileURLToPath(u)) + (u.pathname.endsWith('/') ? path.sep : '')).startsWith(root);
      else if (u.protocol === 'http:' || u.protocol === 'https:') ok = await hostAllowed(u.hostname);
      else ok = u.protocol === 'data:' || u.protocol === 'blob:';
    } catch {
      ok = false;
    }
    if (ok) return route.continue();
    blocked.push(url.slice(0, 200));
    return route.abort('blockedbyclient');
  });
  // WebSockets are not covered by route(); block those to non-public hosts as well.
  await ctx.routeWebSocket(/.*/, async (ws) => {
    const u = new URL(ws.url());
    if (await hostAllowed(u.hostname)) ws.connectToServer();
    else { blocked.push(ws.url().slice(0, 200)); ws.close(); }
  });
  return blocked;
}
