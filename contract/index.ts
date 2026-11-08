/**
 * The public contract between the open-source site / pipeline and any backend that serves them.
 *
 * - Public API (POST {API}/hit, /waitlist, /try): request bodies, the error codes the site understands, and
 *   the responses. The reference implementation is functions/api/* (Cloudflare Pages Functions); the hosted
 *   skillarena.dev backend implements the same contract.
 * - Build data: manifest.json (written by `npm run manifest`) and site-settings.json (display settings,
 *   read at build time from SITE_SETTINGS).
 *
 * Bodies are validated the way the reference handlers do it: fields arrive as strings (JSON or form posts),
 * unknown fields are ignored, and a filled `website` field is a honeypot (answer 200 and store nothing).
 */
import { z } from 'zod';

// ---- shared ----------------------------------------------------------------------------------------------

export const ROLES = ['author', 'developer', 'designer', 'lead', 'other'] as const;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const SKILL_ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
/** Campaign ref (?ref=…), lowercased; anything else is dropped. */
export const REF_RE = /^[a-z0-9._-]{1,40}$/i;
export const cleanRef = (v?: string) => (v && REF_RE.test(v) ? v.toLowerCase() : '');

const email = z.string().trim().toLowerCase().max(254).regex(EMAIL_RE);
const role = z.enum(ROLES);
const ref = z.string().optional().transform((v) => cleanRef(v));
const honeypot = z.string().optional();

/** Error codes returned as { ok: false, error } with status 400 (429 for rate limits, 403 bad_origin). */
export const API_ERRORS = [
    'invalid_email', 'invalid_role', 'invalid_want', 'invalid_skills', 'invalid_brief', 'invalid_pay',
    'rate_limited', 'bad_origin', 'method_not_allowed',
] as const;
export type ApiError = (typeof API_ERRORS)[number];
export const ApiErrorResponse = z.object({ ok: z.literal(false), error: z.enum(API_ERRORS) });

// ---- POST /hit -------------------------------------------------------------------------------------------

/** Events the beacon may send. Anything else is ignored (204). */
export const HIT_EVENTS = ['view', 'copy_install', 'outbound', 'waitlist_signup', 'try_request', 'compare', 'live_open'] as const;
/** Beacon body. Always answered with 204 (also when ignored: bots, bad JSON, rate limit, unknown event). */
export const HitBody = z.object({
    e: z.enum(HIT_EVENTS).default('view'),
    /** Page path, must start with "/". */
    p: z.string().max(200).startsWith('/'),
    /** Query string, kept for /compare only. */
    q: z.string().max(200).optional(),
    /** Referrer host. */
    r: z.string().max(100).optional(),
    ref: z.string().max(40).optional(),
    /** Viewport width; stored as device class mobile < 640 ≤ tablet < 1024 ≤ desktop. */
    w: z.number().optional(),
    /** Event detail (e.g. outbound host + path, skill ids). */
    d: z.string().max(120).optional(),
});
export type HitBody = z.infer<typeof HitBody>;

// ---- POST /waitlist --------------------------------------------------------------------------------------

export const WAITLIST_WANTS = ['updates', 'tune'] as const;
export const WaitlistBody = z.object({
    email,
    role,
    /** Comma-separated WAITLIST_WANTS. Missing = ["tune"] (older pages had only the tuning list). */
    want: z
        .string()
        .optional()
        .transform((v) => (v === undefined ? ['tune'] : [...new Set(v.split(','))].filter((w): w is (typeof WAITLIST_WANTS)[number] => (WAITLIST_WANTS as readonly string[]).includes(w))))
        .refine((v) => v.length > 0, { message: 'invalid_want' }),
    need: z.string().optional().transform((v) => (v ?? '').trim().slice(0, 280)),
    ref,
    website: honeypot,
});
export type WaitlistBody = z.infer<typeof WaitlistBody>;
/** 200 response; duplicate = this email was already on the list (the record is never overwritten). */
export const WaitlistResponse = z.object({ ok: z.literal(true), duplicate: z.boolean().optional() });

// ---- POST /try -------------------------------------------------------------------------------------------

export const TRY_PAY = ['', 'free', '1-5', '5-20', '20+'] as const;
export const TRY_MAX_SKILLS = 4;
export const TryBody = z.object({
    email,
    role,
    /** Comma-separated skill ids (or "own"), 1–4. */
    skills: z
        .string()
        .transform((v) => [...new Set(v.split(',').map((s) => s.trim()).filter(Boolean))])
        .refine((v) => v.length >= 1 && v.length <= TRY_MAX_SKILLS && v.every((s) => SKILL_ID_RE.test(s)), { message: 'invalid_skills' }),
    brief: z.string().trim().min(20).max(2000),
    pay: z.enum(TRY_PAY).optional().default(''),
    ref,
    website: honeypot,
});
export type TryBody = z.infer<typeof TryBody>;
export const TryResponse = z.object({ ok: z.literal(true) });

// ---- build data: manifest.json ---------------------------------------------------------------------------

export const Run = z.object({
    run: z.number().int().positive(),
    status: z.enum(['ok', 'failed', 'invalid_html']),
    error: z.string().nullable(),
    model: z.string(),
    generatedAt: z.string(),
    costUsd: z.number(),
    outputTokens: z.number(),
    fullPageTruncated: z.boolean(),
    /** Base URL of the run's files (…/run-N/), relative (/runs/…) or on the asset domain; null when not published. */
    base: z.string().nullable(),
    /** Cache-busting version for the run's file URLs. */
    v: z.string(),
    hasShots: z.boolean(),
});
export type Run = z.infer<typeof Run>;
export const InstallMethod = z.object({ label: z.string(), commands: z.string(), note: z.string().nullable() });
export const SkillRow = z.object({
    id: z.string().regex(SKILL_ID_RE),
    name: z.string(),
    author: z.string(),
    isBaseline: z.boolean(),
    description: z.string(),
    repo: z.string().nullable(),
    path: z.string().nullable(),
    commit: z.string().nullable(),
    license: z.string().nullable(),
    homepage: z.string().nullable(),
    installName: z.string().nullable(),
    usage: z.string().nullable(),
    install: z.array(InstallMethod),
    referencesInlined: z.boolean(),
    /** The repo on GitHub (yarn github-meta): owner login and name, avatar served by the site, stars when fetched. */
    github: z
        .object({ owner: z.string(), ownerName: z.string().nullable(), ownerUrl: z.string(), avatar: z.string().nullable(), stars: z.number().int(), starsAt: z.string() })
        .nullable()
        .optional(),
});
export type SkillRow = z.infer<typeof SkillRow>;
export const Brief = z.object({ id: z.string(), title: z.string(), text: z.string() });
export type Brief = z.infer<typeof Brief>;
export const Manifest = z.object({
    builtAt: z.string().nullable(),
    lastGeneratedAt: z.string().nullable(),
    models: z.array(z.string()),
    runsPerPair: z.number().int().positive(),
    mobileFirstBriefs: z.array(z.string()),
    totals: z.object({ calls: z.number(), costUsd: z.number() }),
    briefs: z.array(Brief),
    skills: z.array(SkillRow),
    /** runs[briefId][skillId] = runs in order. */
    runs: z.record(z.string(), z.record(z.string(), z.array(Run))),
});
export type Manifest = z.infer<typeof Manifest>;

// ---- build data: site-settings.json ----------------------------------------------------------------------

/** Display settings edited in an admin and applied at build time (see web/lib/settings.ts normalizeSettings). */
export const SkillSettings = z.object({
    hidden: z.boolean().optional(),
    featured: z.boolean().optional(),
    /** Replaces the manifest description on the site when not empty. */
    description: z.string().max(400).optional(),
    /** Private admin note; never shown on the site. */
    note: z.string().max(1000).optional(),
});
export const SiteSettings = z.object({
    version: z.literal(1),
    updatedAt: z.string().nullable(),
    /** Skill ids in display order; skills not listed follow in manifest order. The baseline is always first. */
    order: z.array(z.string().regex(SKILL_ID_RE)).max(500),
    skills: z.record(z.string().regex(SKILL_ID_RE), SkillSettings),
    banner: z.object({ enabled: z.boolean(), text: z.string().max(200), href: z.string().max(300) }),
    compare: z.object({ a: z.string(), b: z.string() }),
});
export type SiteSettings = z.infer<typeof SiteSettings>;
