// Shared helpers for the Pages Functions. Folders starting with "_" are not routed by Cloudflare Pages.

// Minimal local types so the project doesn't need @cloudflare/workers-types.
export interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number; metadata?: unknown }): Promise<void>;
}
export interface Env {
  WAITLIST: KV;
  /** Secret salt for daily visitor hashes in /api/hit (set in the host's environment, never committed). */
  HIT_SALT?: string;
}
export interface Ctx {
  request: Request;
  env: Env;
}

export const ROLES = new Set(['author', 'developer', 'designer', 'lead', 'other']);
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_PER_MINUTE = 3;

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function readBody(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const data = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v : '']));
  }
  const fd = await request.formData().catch(() => null);
  return fd ? Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : ''])) : {};
}

export async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Campaign source from ?ref= / ?utm_source= (kept by the page script in sessionStorage). */
export const cleanRef = (v?: string) => (v && /^[a-z0-9._-]{1,40}$/i.test(v) ? v.toLowerCase() : '');

export const clientIp = (request: Request) =>
  request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

/**
 * Same-origin check + rate limit (3 attempts per IP per minute, shared by all form endpoints).
 * Returns an error Response, or null when the request may proceed.
 */
export async function guard({ request, env }: Ctx): Promise<Response | null> {
  if (!env.WAITLIST) return json(500, { ok: false, error: 'kv_not_bound' });
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json(403, { ok: false, error: 'bad_origin' });
  const minute = Math.floor(Date.now() / 60000);
  const rlKey = `rl:${await sha256(clientIp(request))}:${minute}`;
  const count = Number((await env.WAITLIST.get(rlKey)) ?? 0);
  if (count >= MAX_PER_MINUTE) return json(429, { ok: false, error: 'rate_limited' });
  await env.WAITLIST.put(rlKey, String(count + 1), { expirationTtl: 120 });
  return null;
}

/** Non-identifying request context stored with each record. */
export async function clientMeta(request: Request) {
  return {
    createdAt: new Date().toISOString(),
    country: (request as Request & { cf?: { country?: string } }).cf?.country ?? request.headers.get('cf-ipcountry') ?? null,
    lang: request.headers.get('accept-language')?.split(',')[0] ?? null,
    ipHash: (await sha256(clientIp(request))).slice(0, 16),
  };
}
