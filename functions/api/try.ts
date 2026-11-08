/**
 * Cloudflare Pages Function: POST /api/try — "compare skills on your own brief" requests (fake door).
 * Custom comparisons are not built yet; this records demand so we can decide whether to build them.
 * Body (JSON or form): { email, role, skills: "id,id,…", brief, pay?, website? (honeypot) }
 * KV binding: WAITLIST
 *   try:<ISO time>:<random>   → one record per request (a person may send several briefs)
 *   email:<lowercased email>  → also added to the waitlist if not already there (never overwritten)
 */
import { guard, json, readBody, clientMeta, EMAIL_RE, ROLES, type Ctx, cleanRef } from '../_lib/common';

const SKILL_ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const PAY = new Set(['', 'free', '1-5', '5-20', '20+']);
const MAX_SKILLS = 4;

export const onRequestPost = async (ctx: Ctx) => {
  const blocked = await guard(ctx);
  if (blocked) return blocked;
  const { request, env } = ctx;

  const body = await readBody(request);
  if (body.website) return json(200, { ok: true });

  const email = (body.email ?? '').trim().toLowerCase();
  const role = (body.role ?? '').trim();
  const brief = (body.brief ?? '').trim();
  const pay = (body.pay ?? '').trim();
  const skills = [...new Set((body.skills ?? '').split(',').map((s) => s.trim()).filter(Boolean))];

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return json(400, { ok: false, error: 'invalid_email' });
  if (!ROLES.has(role)) return json(400, { ok: false, error: 'invalid_role' });
  if (skills.length < 1 || skills.length > MAX_SKILLS || !skills.every((s) => SKILL_ID_RE.test(s)))
    return json(400, { ok: false, error: 'invalid_skills' });
  if (brief.length < 20 || brief.length > 2000) return json(400, { ok: false, error: 'invalid_brief' });
  if (!PAY.has(pay)) return json(400, { ok: false, error: 'invalid_pay' });

  const meta = await clientMeta(request);
  const ref = cleanRef(body.ref);
  const record = { email, role, skills, brief, pay: pay || null, ref, ...meta };
  const id = `try:${meta.createdAt}:${crypto.randomUUID().slice(0, 8)}`;
  await env.WAITLIST.put(id, JSON.stringify(record), { metadata: { skills, pay: record.pay, createdAt: meta.createdAt } });

  const wlKey = `email:${email}`;
  if (!(await env.WAITLIST.get(wlKey))) {
    const wl = { email, role, need: brief.slice(0, 280), source: 'try', ref, ...meta };
    await env.WAITLIST.put(wlKey, JSON.stringify(wl), { metadata: { role, createdAt: meta.createdAt } });
  }
  return json(200, { ok: true });
};

export const onRequest = async () => json(405, { ok: false, error: 'method_not_allowed' });
