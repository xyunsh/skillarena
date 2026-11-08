// Central parameters for the SkillArena pipeline.
export const runConfig = {
  model: 'claude-opus-5-5',
  /** 'api' (needs ANTHROPIC_API_KEY) or 'cli' (uses the local `claude` CLI login). Override with --backend. */
  backend: 'api' as 'api' | 'cli',
  /** USD per million tokens, used for cost tracking/estimates. Keep in sync with the model. */
  pricing: { inputPerMTok: 4.0, outputPerMTok: 20.0 },
  runsPerPair: 3,
  /** Includes adaptive-thinking tokens (on by default for this model), so leave headroom above the ~16k page size. */
  maxTokens: 48000,
  concurrency: 4,
  retries: 2,
  /** Hard stop for a single generate invocation (actual spend). */
  budgetUsd: 30,
  /** Rough output-token guess per page (thinking + HTML) for pre-run estimates. */
  estimatedOutputTokens: 20000,
  viewports: {
    desktop: { width: 1440, height: 900 },
    mobile: { width: 390, height: 844 },
  },
  deviceScaleFactor: 2,
  fullPageMaxHeight: 8000,
  thumbnailWidth: 600,
  networkIdleTimeoutMs: 15000,
  settleMs: 1000,
  /** Display titles for briefs (the brief files themselves are sent verbatim). */
  briefTitles: {
    'saas-landing': 'SaaS landing page',
    dashboard: 'Analytics dashboard',
    'mobile-app': 'Mobile app screen',
    'signup-form': 'Sign-up form',
    'skillarena-home': 'SkillArena itself',
  } as Record<string, string>,
  /** Briefs whose primary target is a phone; the matrix shows the mobile shot for these. */
  mobileFirstBriefs: ['mobile-app'],
};

export const SYSTEM_BASE = `You are building a single web page from a product brief.
Return ONE complete, self-contained HTML file (inline CSS and JS).
You may load web fonts or icons from public CDNs. Do not load any other external resources.
Use placeholder content that fits the brief. Do not use real company logos or real people's photos.
Output only the HTML, starting with <!DOCTYPE html>. No explanation.`;

export const BASELINE_ID = 'baseline';
