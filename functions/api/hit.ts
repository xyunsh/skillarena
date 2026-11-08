/**
 * Cloudflare Pages Function: POST /api/hit — cookie-free, first-party page views and events.
 * Sent by the inline script in web/components/scripts.ts (navigator.sendBeacon). Skipped when the browser sends
 * Do Not Track or Global Privacy Control. No cookies, no IP stored: visitors are counted with a hash of
 * (secret salt, day, IP, user agent) that changes every day and can't be linked across days.
 * Body: { e: event name ('view' | 'copy_install' | 'outbound' | 'waitlist_signup' | 'try_request' | 'compare' | 'live_open'),
 *         p: path, q?: query (compare page only), r?: referrer host, ref?: campaign, w?: viewport width, d?: detail }
 * KV binding: WAITLIST
 *   hit:<ISO time>:<random> → one event (TTL 400 days). A self-hosted backend may store them elsewhere.
 *   rlh:<ip hash>:<minute>  → per-IP counter, max 60 events per minute
 */
import { clientIp, cleanRef, json, sha256, type Ctx } from '../_lib/common';

const EVENTS = new Set(['view', 'copy_install', 'outbound', 'waitlist_signup', 'try_request', 'compare', 'live_open']);
const BOT_RE = /bot|crawl|spider|slurp|preview|fetch|headless|lighthouse|monitor|curl|wget|python|axios|node-fetch|go-http/i;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const noContent = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

export const onRequestPost = async ({ request, env }: Ctx) => {
  if (!env.WAITLIST) return json(500, { ok: false, error: 'kv_not_bound' });
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json(403, { ok: false, error: 'bad_origin' });
  const ua = request.headers.get('user-agent') ?? '';
  if (!ua || BOT_RE.test(ua)) return noContent();

  const raw = await request.text();
  if (raw.length > 2000) return noContent();
  let b: Record<string, unknown> = {};
  try { b = JSON.parse(raw); } catch { return noContent(); }
  const e = str(b.e, 20) || 'view';
  const p = str(b.p, 200);
  if (!EVENTS.has(e) || !p.startsWith('/')) return noContent();

  const ip = clientIp(request);
  const ipHash = (await sha256(ip)).slice(0, 16);
  const minute = Math.floor(Date.now() / 60000);
  const rl = `rlh:${ipHash}:${minute}`;
  const n = Number((await env.WAITLIST.get(rl)) ?? 0);
  if (n >= 60) return noContent();
  await env.WAITLIST.put(rl, String(n + 1), { expirationTtl: 120 });

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const w = Number(b.w);
  const record = {
    t: now.toISOString(),
    e,
    p,
    q: p.startsWith('/compare') ? str(b.q, 200) : '',
    r: str(b.r, 100).toLowerCase(),
    ref: cleanRef(str(b.ref, 40)),
    d: str(b.d, 120),
    dev: !Number.isFinite(w) ? '' : w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop',
    country: (request as Request & { cf?: { country?: string } }).cf?.country ?? request.headers.get('cf-ipcountry') ?? '',
    v: (await sha256(`${env.HIT_SALT ?? ''}|${day}|${ip}|${ua}`)).slice(0, 16),
  };
  await env.WAITLIST.put(`hit:${record.t}:${crypto.randomUUID().slice(0, 8)}`, JSON.stringify(record), { expirationTtl: 400 * 86400 });
  return noContent();
};

export const onRequest = async () => json(405, { ok: false, error: 'method_not_allowed' });
