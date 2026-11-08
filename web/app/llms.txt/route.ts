import { briefs, manifest } from '~/lib/data';
import { abs, models, real, stats, text } from '~/lib/seo';

// https://llmstxt.org — a short, link-rich summary for LLMs and AI search. Full detail: /llms-full.txt.
export const dynamic = 'force-static';

export function GET() {
  const u = (p: string) => abs(p);
  const lines = [
    '# SkillArena',
    '',
    `> SkillArena compares UI skills (SKILL.md files) for AI coding agents such as Claude Code. Each skill gets the same ${briefs.length} fixed product briefs and the same model (${models}); the only difference is the skill in the system prompt. A no-skill control group is run the same way, ${manifest.runsPerPair} runs per pair, and every generated page is screenshotted at desktop and mobile size. It shows what each skill produces; it is not a ranking.`,
    '',
    `Totals: ${manifest.totals.calls} generated pages, ${real.length} skills plus the control group. Last generated ${String(manifest.lastGeneratedAt ?? '').slice(0, 10)}.`,
    '',
    '## Pages',
    `- [Matrix](${u('/')}): every skill × brief, first run of each`,
    `- [Compare](${u('/compare/')}): two skills side by side on one brief (query: ?a=<skill>&b=<skill>&brief=<brief>&run=<n>)`,
    `- [About and methodology](${u('/about/')}): how pages are generated and screenshotted, FAQ, disclaimer`,
    `- [Try your own brief](${u('/try/')}): early-access request form (not live yet)`,
    '',
    '## Skills',
    ...real.map((s) => {
      const st = stats(s.id);
      return `- [${s.name}](${u(`/skill/${s.id}/`)}) by ${s.author} (${s.license ?? 'license unknown'}): ${s.description ? s.description.split(/(?<=\.)\s/)[0] : ''} ${st.ok}/${st.runs} runs ok, avg ${(st.avgOutputTokens / 1000).toFixed(1)}k output tokens.`;
    }),
    `- [No skill (control group)](${u('/skill/baseline/')})`,
    '',
    '## Briefs',
    ...briefs.map((b, i) => `- ${i + 1}. ${b.title} (id: ${b.id})`),
    '',
    '## Data',
    `- [results.json](${u('/results.json')}): all skills, briefs and runs with status, token counts and screenshot URLs`,
    `- [llms-full.txt](${u('/llms-full.txt')}): this file plus the full brief texts, methodology and install commands`,
    '',
    '## Optional',
    '- Source code and pipeline: https://github.com/xyunsh/skillarena',
    '',
  ];
  return text(lines.join('\n'));
}
