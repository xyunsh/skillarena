// Plain, checkable facts computed from the manifest at build time, for the About page, skill pages and llms.txt.
// Output tokens measure how much the model wrote, not how good the page is; every sentence built here says so or links to it.
import fs from 'node:fs';
import path from 'node:path';
import { briefs, runsFor, skills, type Brief } from './data';

const BASE = 'baseline';
const real = skills.filter((s) => !s.isBaseline);

const okTokens = (briefId: string, skillId: string) => runsFor(briefId, skillId).filter((r) => r.status === 'ok').map((r) => r.outputTokens ?? 0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** "12.6k" */
export const kTok = (n: number) => `${(n / 1000).toFixed(1)}k`;
/** "1.4×" */
export const times = (r: number) => `${r.toFixed(r >= 10 ? 0 : r >= 2 ? 1 : 2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}×`;

const avgOn = (briefId: string, skillId: string) => mean(okTokens(briefId, skillId));
const avgAll = (skillId: string) => mean(briefs.flatMap((b) => okTokens(b.id, skillId)));

export interface BriefFinding {
    brief: Brief;
    control: number;
    median: number;
    more: number;
    less: number;
    total: number;
}

/** Per brief: the no-skill average, the median skill average, and how many skills wrote more / less than no skill. */
export const briefFindings: BriefFinding[] = briefs
    .map((brief) => {
        const control = avgOn(brief.id, BASE);
        const avgs = real.map((s) => avgOn(brief.id, s.id)).filter((x) => !Number.isNaN(x));
        return {
            brief,
            control,
            median: avgs.length ? median(avgs) : NaN,
            more: avgs.filter((x) => x > control).length,
            less: avgs.filter((x) => x < control).length,
            total: avgs.length,
        };
    })
    .filter((f) => !Number.isNaN(f.control) && f.total > 0);

const overallAvgs = real.map((s) => ({ s, avg: avgAll(s.id) })).filter((x) => !Number.isNaN(x.avg));
const controlAll = avgAll(BASE);
const byAvg = [...overallAvgs].sort((a, b) => a.avg - b.avg);

/** Across all briefs: how many skills averaged fewer output tokens than no skill, and the extremes. */
export const overall = {
    control: controlAll,
    total: overallAvgs.length,
    below: overallAvgs.filter((x) => x.avg < controlAll).length,
    smallest: byAvg[0] ? { name: byAvg[0].s.name, id: byAvg[0].s.id, avg: byAvg[0].avg } : null,
    largest: byAvg.at(-1) ? { name: byAvg.at(-1)!.s.name, id: byAvg.at(-1)!.s.id, avg: byAvg.at(-1)!.avg } : null,
};

// Page headlines (web/data/headlines.json, written by `yarn headlines` from the published runs). Untrusted text: render as text only.
type Headlines = { briefs: Record<string, Record<string, (string | null)[]>> };
const headlines: Headlines = (() => {
    const p = path.join(path.resolve(process.env.SKILLARENA_DATA ?? 'data'), 'headlines.json');
    try {
        return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as Headlines) : { briefs: {} };
    } catch {
        return { briefs: {} };
    }
})();
const opening = (t: string) =>
    t
        .toLowerCase()
        .replace(/[“”"‘’'.,!?:;()—–-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join(' ');

export interface HeadlineFinding {
    brief: Brief;
    /** Two-word opening as written on the first page that used it, e.g. "Stop asking". */
    phrase: string;
    pages: number;
    total: number;
    /** Shown skills that never opened with it in any run (the control group excluded). */
    never: { id: string; name: string }[];
    controlUsed: boolean;
}

/**
 * The most common two-word headline opening on any brief, when it covers at least half the pages and the brief text
 * itself doesn't contain those words (so it isn't just the model echoing the brief). Null otherwise.
 */
export const headlineFinding: HeadlineFinding | null = (() => {
    let best: HeadlineFinding | null = null;
    for (const brief of briefs) {
        const bySkill = headlines.briefs[brief.id];
        if (!bySkill) continue;
        const counts = new Map<string, { n: number; sample: string }>();
        let total = 0;
        for (const s of skills) {
            for (const t of bySkill[s.id] ?? []) {
                if (!t) continue;
                total++;
                const k = opening(t);
                if (!k.includes(' ')) continue;
                const c = counts.get(k) ?? { n: 0, sample: t.split(/\s+/).slice(0, 2).join(' ').replace(/[“”"‘’'.,!?:;]+$/, '') };
                c.n++;
                counts.set(k, c);
            }
        }
        const top = [...counts.entries()].sort((a, b) => b[1].n - a[1].n)[0];
        if (!top || total === 0 || top[1].n / total < 0.5) continue;
        if (brief.text.toLowerCase().includes(top[0])) continue;
        const uses = (id: string) => (bySkill[id] ?? []).some((t) => t && opening(t) === top[0]);
        const f: HeadlineFinding = {
            brief,
            phrase: top[1].sample,
            pages: top[1].n,
            total,
            never: real.filter((s) => (bySkill[s.id] ?? []).some(Boolean) && !uses(s.id)).map((s) => ({ id: s.id, name: `${s.name} by ${s.author}` })),
            controlUsed: uses(BASE),
        };
        if (!best || f.pages / f.total > best.pages / best.total) best = f;
    }
    return best;
})();

/** One-line findings for llms.txt and the About page. Empty when there is no control group to compare against. */
export function keyFindings(): string[] {
    if (Number.isNaN(controlAll) || !briefFindings.length) return [];
    const sorted = [...briefFindings].sort((a, b) => b.more / b.total - a.more / a.total);
    const most = sorted[0];
    const least = sorted.at(-1)!;
    const h = headlineFinding;
    const neverList = h && h.never.length > 0 && h.never.length <= 5 ? `: ${h.never.map((s) => s.name).join(', ')}` : '';
    const lines = [
        ...(h
            ? [
                  `Skills change the look of a page much more than its words. On "${h.brief.title}", ${h.pages} of ${h.total} pages open with the headline "${h.phrase}…", which the brief never uses${h.controlUsed ? ', and so does the no-skill control' : ''}. Only ${h.never.length} of ${overall.total} skills avoided it in every run${neverList}.`,
              ]
            : []),
        `Whether a skill makes the model write more depends on the brief. On "${most.brief.title}", ${most.more} of ${most.total} skills produced more output tokens than no skill (median ${times(most.median / most.control)} the no-skill average). On "${least.brief.title}", ${least.less} of ${least.total} produced fewer.`,
        `Across all ${briefs.length} briefs, ${overall.below} of ${overall.total} skills averaged fewer output tokens per page than no skill (${kTok(controlAll)}).${overall.smallest && overall.largest ? ` The lowest average was ${overall.smallest.name} (${kTok(overall.smallest.avg)}), the highest ${overall.largest.name} (${kTok(overall.largest.avg)}).` : ''}`,
        'Output tokens show how much a skill changes what the model writes (and what a generation costs), not whether the page is better. Compare the pages themselves to judge quality.',
    ];
    return lines;
}

/** A sentence comparing one skill with no skill, for its page. Null for the baseline or when data is missing. */
export function skillSummary(skillId: string): string | null {
    if (skillId === BASE || Number.isNaN(controlAll)) return null;
    const mine = avgAll(skillId);
    if (Number.isNaN(mine)) return null;
    const per = briefs
        .map((b) => ({ b, mine: avgOn(b.id, skillId), base: avgOn(b.id, BASE) }))
        .filter((x) => !Number.isNaN(x.mine) && !Number.isNaN(x.base) && x.base > 0)
        .map((x) => ({ ...x, ratio: x.mine / x.base }));
    if (!per.length) return null;
    const more = per.filter((x) => x.ratio > 1).length;
    const far = [...per].sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)))[0];
    const r = mine / controlAll;
    const below = r < 1 ? `, one of the ${overall.below} skills (of ${overall.total}) that wrote less than no skill overall` : '';
    return (
        `Across ${per.length} briefs, pages with this skill averaged ${kTok(mine)} output tokens, ${times(r)} the no-skill average of ${kTok(controlAll)}${below}. ` +
        `It wrote more than no skill on ${more} of ${per.length} briefs; the biggest difference was on ${far.b.title} (${times(far.ratio)} no skill).`
    );
}

/** How this skill's pages relate to the common headline opening, for its page. Null when there is nothing to say. */
export function skillHeadlineNote(skillId: string): string | null {
    const h = headlineFinding;
    if (!h || skillId === BASE) return null;
    const list = (headlines.briefs[h.brief.id]?.[skillId] ?? []).filter((t): t is string => !!t);
    if (!list.length) return null;
    const used = list.filter((t) => opening(t) === opening(h.phrase)).length;
    const base = `On the ${h.brief.title} brief, ${h.pages} of ${h.total} pages across all skills open with "${h.phrase}…".`;
    if (used === 0) return `${base} This skill avoided it in all ${list.length} runs, one of only ${h.never.length} skills that did.`;
    return `${base} ${used} of this skill’s ${list.length} runs did too.`;
}
