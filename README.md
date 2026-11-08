# SkillArena

**See what a UI skill builds before you install it.** SkillArena gives every UI skill (a `SKILL.md` for AI coding agents such as Claude Code) the same product briefs and the same model, and shows the generated pages next to a **no-skill control group**. Live at **[skillarena.dev](https://skillarena.dev)**.

This repository holds everything behind the published results:

| Folder | What |
|---|---|
| `pipeline/` | Fetch skills at a pinned commit → generate pages → screenshot → scan → `manifest.json` |
| `config/` | The skill list (`skills.yaml`), the briefs, and the run settings (model, runs per pair, budget) |
| `output/` | One `meta.json` per run (status, model, tokens, cost, screenshot info). Screenshots and pages are on the asset domain |
| `web/` | The site: Next.js static export, no client-side framework runtime |
| `contract/` | zod schemas for the public API and the build data (manifest, display settings) |
| `functions/` | Reference implementation of the public API as Cloudflare Pages Functions |

It is not a ranking. Model output varies from run to run, so every pair is generated three times; judge a skill by its runs together.

## Quick start: build the site from the published results

Needs Node 22+ and Yarn 4 (`corepack enable`).

```bash
yarn install
cp .env.example .env      # ASSET_BASE points at the published screenshots; no keys needed
yarn build                # static site in web/out
yarn dev                  # or run it on http://localhost:4321
```

Nothing here calls a model: the site is built from `web/data/manifest.json`. Without `NEXT_PUBLIC_API_URL` the analytics beacon is off and the waitlist / try forms are hidden.

To also have the run files locally (for the scans, or to rebuild `manifest.json` without `ASSET_BASE`): `yarn fetch-assets`.

## Requirements for generating results

- Playwright Chromium (`npx playwright install chromium`). `playwright` is pinned to 1.61.1.
- Either an Anthropic API key in `.env` (`--backend api`, the default) or a logged-in Claude Code CLI (`--backend cli`).
- The `gh` CLI (logged in) for `yarn discover`, which ranks candidate skills by repo stars.

## Running the pipeline

```bash
yarn pipeline -- --dry-run                       # call count and cost estimate, then stop
yarn pipeline -- --skill anthropic-frontend-design --brief saas-landing --runs 1
yarn pipeline -- --mock                          # placeholder HTML, no model calls ($0)
```

| Flag | Meaning |
|---|---|
| `--skill a,b` | Only these skills. `baseline` is the control group. |
| `--brief x,y` | Only these briefs. |
| `--runs n` | Runs per pair (default 3, `config/run.config.ts`). |
| `--force` | Regenerate / re-screenshot even when a result exists. |
| `--yes` | Skip the cost confirmation. |
| `--dry-run` | Only print the plan and cost estimate. |
| `--backend api\|cli` | Anthropic API (needs `ANTHROPIC_API_KEY`) or the local `claude` CLI login. |

Steps on their own: `yarn fetch-skills`, `yarn generate`, `yarn screenshot`, `yarn manifest [-- --ready-only]`, `yarn og`.

- **Idempotent:** runs with status `ok` or `invalid_html` are skipped; `failed` runs (API errors) are retried.
- **Cost safety:** `generate` prints the call count and estimated cost, asks before more than one call, refuses estimates over `budgetUsd` ($30) and stops when spend reaches it.
- **`--ready-only`** leaves out skills that still have unfinished runs, so the site can be rebuilt while a batch is generating. A truncated run (`invalid_html`) counts as finished and is shown as “Generation failed”.

### Generation rules

- Model `claude-opus-5-5`, default sampling and effort. `max_tokens` 48000 (thinking counts toward it); output cut at the limit is `invalid_html`.
- System prompt: the shared generic instructions (`config/run.config.ts → SYSTEM_BASE`), then the skill's `SKILL.md`, then any `references/` files it points to, in order. The user message is the brief, word for word.
- The HTML from `<!DOCTYPE html>` to `</html>` is saved unchanged.
- `--backend cli` runs `claude -p` with `--tools ''`, `--strict-mcp-config`, `--setting-sources ''`, `--disable-slash-commands` and `--no-session-persistence` in an empty directory, so Claude Code's system prompt, tools, MCP servers, settings, memory and skills are all absent. The CLI still adds a short, identical environment block to every condition. `meta.json` records `"backend": "claude-cli"`; its `costUsd` is the CLI's list-price estimate.

### Output layout

```
output/<briefId>/<skillId>/run-<n>/
  meta.json                                    # committed
  index.html  desktop.webp  desktop-full.webp  mobile.webp
  thumb-desktop.webp  thumb-mobile.webp  og.jpg  # published to the asset domain, not committed
  *.png  raw.txt                                 # local only
```

`yarn manifest` writes `web/data/manifest.json`. With `ASSET_BASE` set, run URLs point there; without it, the files are copied into `web/public/runs/`. It never copies `SKILL.md` or anything from `vendor/`. Every asset URL carries a `?v=` version so regenerated runs are never served stale.

## Adding a skill

Pull requests that add skills are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the checklist (license, install methods, scans). In short:

1. `yarn discover -- --top 30` lists skills on ui-skills.com that SkillArena doesn't have, ranked by repo stars. Stars are per repo, so check that a skill is about building pages.
2. Add an entry to `config/skills.yaml` (`id`, `name`, `author`, `repo`, `path`, `license`, `homepage`, `installName`, `install`) with an empty `commit:`.
3. `yarn fetch-skills -- --skill <id>` pins the current commit, inlines referenced files and skips skills that need to run scripts (`skipped.md`). It also runs the skill scan below.
4. `yarn pipeline -- --skill <id> --dry-run`, then for real.

## Adding a brief

Add `config/briefs/<id>.md` (only the brief text; original, no real brands), give it a title and position in `config/run.config.ts → briefTitles` (and `mobileFirstBriefs` if it's a mobile page), then `yarn pipeline -- --brief <id>`.

## Security: skills are untrusted

A `SKILL.md` is third-party text that steers the model, so every stage treats it and the pages it produces as untrusted:

- **Generation** has no tools (`--tools ''` on the CLI backend, plain messages on the API backend). The worst a malicious skill can do is produce a bad page.
- **Fetching** only extracts files with `git archive` at a pinned commit; nothing is executed.
- **Skill scan** (`yarn scan`, also run by `fetch-skills`; `pipeline/scan-skill.ts`) checks the exact prompt text. High findings make `generate` refuse the skill until a person has read it and set `scanReviewed: <commit>` in `skills.yaml`, with a comment on why; a new commit needs a new review.
  - High: hidden zero-width, bidi or tag characters; "ignore previous instructions"; references to SSH keys or credentials; exfiltration wording; `curl … | sh` or base64 decoding; "don't tell the user"; long encoded blobs.
  - Medium (printed only): very large text, whole HTML pages to copy, brief text or "SkillArena" in the skill, many outside links.
- **Screenshots** (`pipeline/net-guard.ts`) block requests to localhost, private, link-local and CGNAT ranges, `*.local`, public names that resolve to those, `file://` outside the run folder, and WebSockets to them. Blocked URLs are saved in `meta.json`.
- **Output scan** (`yarn scan-output`) lists pages with outside links, external scripts, trackers, forms posting out, iframes, script requests, WebSockets and redirects, per skill. Hosts that recur in one skill's runs only (◆) most likely came from the skill.
- **Site**: generated pages are served from a separate asset domain with `Content-Security-Policy: sandbox allow-scripts`, and shown only in `sandbox="allow-scripts"` iframes, so they never run in the site's origin.
- **Installs**: each skill page leads with an install of the exact tested commit; the author's own methods are labelled "latest, untested". `yarn upstream` compares each skill folder upstream with the tested commit and writes `web/data/upstream.json`; a changed skill gets a warning with a compare link and any changed script files.
- **Text from third parties** printed by `discover`, `upstream` and the stats tools is cleaned of control, invisible and bidi characters and markup (`pipeline/untrusted.ts`), because AI assistants may read that output.

Found a problem? See [SECURITY.md](SECURITY.md).

## Site and public API

`web/` is a Next.js App Router project exported as static files (`output: 'export'`). Pages are rendered at build time from `web/data/manifest.json`, the optional display settings (`SITE_SETTINGS`, see `contract/` → `SiteSettings`) and `web/data/upstream.json`. All interaction is plain inline JavaScript, and `web/scripts/strip-runtime.mjs` removes the Next/React client runtime after the build, so pages ship no framework JS.

The site calls three public endpoints under `NEXT_PUBLIC_API_URL` (for example `/api`). The contract is in `contract/index.ts`; `functions/api/` implements it on Cloudflare Pages Functions with a KV namespace (`yarn functions:dev`, `wrangler.toml`):

| Endpoint | Body | Answer |
|---|---|---|
| `POST /hit` | `HitBody`: event, path, referrer host, campaign ref, viewport width | always 204. No cookies; no IP stored; visitors counted with a daily salted hash; skipped on Do Not Track / GPC |
| `POST /waitlist` | `WaitlistBody`: email, role, what to hear about | `{ ok, duplicate? }` or `{ ok: false, error }` |
| `POST /try` | `TryBody`: email, role, 1–4 skills, a brief, what they'd pay | `{ ok }` or `{ ok: false, error }` |

`yarn contract:check` validates the committed manifest and sample bodies against the schemas.

## Results data

- `web/data/manifest.json`: every skill, brief and run (status, model, tokens, list-price cost, screenshot URLs). Also served as `/results.json`, with `/llms.txt` and `/llms-full.txt` for LLMs.
- SkillArena never republishes skill contents: only the name, author, description, repository link, commit and license.

The published set: 67 skills plus the control group × 5 briefs × 3 runs = 1020 pages generated with Claude Opus 5.5 (1019 ok, 1 truncated). Generation went through the Claude Code CLI on a subscription; the list-price estimate for the set on display is $342.

## License

- Code: [MIT](LICENSE).
- Results data (`output/**/meta.json`, `web/data/*.json`, the screenshots and generated pages on the asset domain) and the briefs: [CC BY 4.0](LICENSE-data). Credit “SkillArena (skillarena.dev)”.
- Skills belong to their authors under their own licenses; this repository does not contain them.
