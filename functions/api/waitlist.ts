/**
 * Cloudflare Pages Function: POST /api/waitlist
 * Body (JSON or form): { email, role, want? ("updates,tune"), need?, website? (honeypot) }
 * KV binding: WAITLIST
 *   email:<lowercased email>  → JSON record (dedup key; never overwritten)
 *   rl:<ip>:<minute>          → attempt counter (TTL 120s), max 3 per IP per minute
 */
import { guard, json, readBody, clientMeta, cleanRef, EMAIL_RE, ROLES, type Ctx } from '../_lib/common';

const WANTS = new Set(['updates', 'tune']);

export const onRequestPost = async (ctx: Ctx) => {
  const blocked = await guard(ctx);
  if (blocked) return blocked;
  const { request, env } = ctx;

  const body = await readBody(request);
  // Honeypot: bots fill hidden fields. Pretend success.
  if (body.website) return json(200, { ok: true });

  const email = (body.email ?? '').trim().toLowerCase();
  const role = (body.role ?? '').trim();
  const need = (body.need ?? '').trim().slice(0, 280);
  // What to email about: new results (updates) and/or the online tuning tool (tune). Older pages sent no `want`; their form was only about tuning.
  const want = body.want === undefined ? ['tune'] : [...new Set(body.want.split(','))].filter((w) => WANTS.has(w));
  if (!want.length) return json(400, { ok: false, error: 'invalid_want' });
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return json(400, { ok: false, error: 'invalid_email' });
  if (!ROLES.has(role)) return json(400, { ok: false, error: 'invalid_role' });

  const key = `email:${email}`;
  if (await env.WAITLIST.get(key)) return json(200, { ok: true, duplicate: true });

  const record = { email, role, want, need, source: 'waitlist', ref: cleanRef(body.ref), ...(await clientMeta(request)) };
  await env.WAITLIST.put(key, JSON.stringify(record), { metadata: { role, want, createdAt: record.createdAt } });
  return json(200, { ok: true });
};

// Any other method (POST is handled above).
export const onRequest = async () => json(405, { ok: false, error: 'method_not_allowed' });
