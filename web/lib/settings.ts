/**
 * Site display settings, edited in an admin and applied at build time by web/lib/data.ts (SITE_SETTINGS).
 * The schema is also in contract/ (SiteSettings) for backends that edit them.
 */
export interface SkillSettings {
  hidden?: boolean;
  featured?: boolean;
  /** Replaces the manifest description on the site when not empty. */
  description?: string;
  /** Private admin note; never shown on the site. */
  note?: string;
}
export interface SiteSettings {
  version: 1;
  updatedAt: string | null;
  /** Skill ids in display order; skills not listed follow in manifest order. The baseline is always first. */
  order: string[];
  skills: Record<string, SkillSettings>;
  banner: { enabled: boolean; text: string; href: string };
  compare: { a: string; b: string };
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
/** Relative paths ("/about/") or https URLs only. */
export const safeHref = (v: unknown) => {
  const s = str(v, 300);
  if (/^\/(?!\/)/.test(s)) return s;
  try { return new URL(s).protocol === 'https:' ? s : ''; } catch { return ''; }
};

/** Coerces any JSON value into valid settings (unknown keys dropped, strings capped). */
export function normalizeSettings(input: unknown): SiteSettings {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const skills: Record<string, SkillSettings> = {};
  for (const [id, v] of Object.entries((o.skills && typeof o.skills === 'object' ? o.skills : {}) as Record<string, any>)) {
    if (!ID_RE.test(id) || !v || typeof v !== 'object') continue;
    const e: SkillSettings = {};
    if (v.hidden === true) e.hidden = true;
    if (v.featured === true) e.featured = true;
    if (str(v.description, 400)) e.description = str(v.description, 400);
    if (str(v.note, 1000)) e.note = str(v.note, 1000);
    if (Object.keys(e).length) skills[id] = e;
  }
  const b = (o.banner ?? {}) as Record<string, unknown>;
  const c = (o.compare ?? {}) as Record<string, unknown>;
  return {
    version: 1,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : null,
    order: [...new Set((Array.isArray(o.order) ? o.order : []).filter((x: unknown): x is string => typeof x === 'string' && ID_RE.test(x)))].slice(0, 500),
    skills,
    banner: { enabled: b.enabled === true && !!str(b.text, 200), text: str(b.text, 200), href: safeHref(b.href) },
    compare: { a: ID_RE.test(String(c.a ?? '')) ? String(c.a) : '', b: ID_RE.test(String(c.b ?? '')) ? String(c.b) : '' },
  };
}
