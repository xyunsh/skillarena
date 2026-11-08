import { briefs, manifest, skills } from '~/lib/data';
import { abs, models, stats, text } from '~/lib/seo';
import { manualInstall } from '~/lib/data';

// Long-form companion to /llms.txt. Never includes SKILL.md contents (only name, author, description, links).
export const dynamic = 'force-static';

export function GET() {
  const u = (p: string) => abs(p);
  const out: string[] = [
    '# SkillArena — full reference',
    '',
    `SkillArena compares UI skills for AI coding agents. Site: ${u('/')}`,
    '',
    '## Method',
    `- Model: ${models}, default sampling. Generated ${manifest.runsPerPair} times per skill × brief pair.`,
    '- Control group: the system prompt holds only the shared generic instructions. With a skill: the generic instructions followed by the skill\'s SKILL.md (and any references/ files it points to).',
    '- The user message is the brief text, word for word. Output is one self-contained HTML file.',
    '- Screenshots: Chromium via Playwright, desktop 1440×900 (plus full page up to 8000 px) and mobile 390×844, 2× pixel density.',
    '- Skills are pinned to a git commit. Skills that need to run bundled scripts are skipped.',
    '- Results vary between runs; compare a skill\'s runs together. SkillArena is not a ranking.',
    '',
    '## Briefs (sent to the model word for word)',
    ...briefs.flatMap((b, i) => ['', `### ${i + 1}. ${b.title} (id: ${b.id})`, '', b.text]),
    '',
    '## Skills',
  ];
  for (const s of skills) {
    const st = stats(s.id);
    out.push('', `### ${s.isBaseline ? 'No skill (control group)' : s.name}`, '');
    out.push(`- Page: ${u(`/skill/${s.id}/`)}`);
    if (!s.isBaseline) {
      out.push(`- Author: ${s.author}`, `- License: ${s.license ?? 'unknown'}`, `- Repository: ${s.repo}`, `- Tested commit: ${s.commit}`);
      if (s.description) out.push(`- Description: ${s.description}`);
    }
    out.push(`- Runs: ${st.ok}/${st.runs} ok, average ${st.avgOutputTokens} output tokens`);
    if (!s.isBaseline) {
      for (const m of s.install ?? []) out.push(`- Install (${m.label}, latest version): ${m.commands.replace(/\n/g, ' && ')}`);
      const man = manualInstall(s);
      if (man) out.push('- Install the exact tested commit:', '```bash', man, '```');
    }
  }
  out.push('');
  return text(out.join('\n'));
}
