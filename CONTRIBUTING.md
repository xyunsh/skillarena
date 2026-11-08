# Contributing

Issues and pull requests are welcome: new skills, new briefs, fixes to the pipeline or the site.

Before a large change, open an issue so we can agree on the approach.

## Setup

```bash
corepack enable
yarn install
cp .env.example .env
yarn typecheck && yarn contract:check && yarn build
```

Style: Prettier settings in `.prettierrc` (4 spaces, single quotes, width 120). TypeScript is strict.

## Adding a skill: checklist for the pull request

A PR that adds a skill changes `config/skills.yaml` only. Generation costs money and is run by the maintainers, so don't add files under `output/`.

- [ ] **License** allows redistribution, or the skill is clearly open source. Put the SPDX id in `license`.
- [ ] **Page-related**: the skill changes how pages are designed or built (design, styling, layout, motion, copy). Testing, tooling and framework-setup skills don't fit the benchmark.
- [ ] **No scripts**: the skill works from its written rules. Skills whose `SKILL.md` tells the agent to run bundled scripts are skipped (`skipped.md`), since one model call can't reproduce them.
- [ ] `id` is lowercase with dashes, prefixed with the author when several skills share a repo (`emil-…`).
- [ ] `installName` is the `name:` in the skill's frontmatter.
- [ ] `install` lists only methods the author documents (README or skill page), copied as written. Don't invent commands.
- [ ] `commit:` is empty; `yarn fetch-skills -- --skill <id>` pins it. Include the pinned value in the PR.
- [ ] `yarn scan -- --skill <id>` output is pasted in the PR description. If it has a **high** finding, explain why it is safe; a maintainer reads the skill and adds `scanReviewed: <commit>` with a comment.

Not accepted: changes to a skill's text, briefs written to favour a skill, or tweaks to `SYSTEM_BASE` that only help some skills.

## Adding a brief

Briefs are the fixed inputs every skill is judged on, so new briefs are rare. Propose one in an issue first: it should be original, fictional (no real brands or people), and describe a page clearly enough that a person could build it.

## Pipeline and site changes

- Keep the pipeline idempotent and the cost checks in `generate` intact.
- The site must build without any API, keys or network (`yarn build` after a fresh clone).
- Site pages render at build time and use plain inline scripts. Don't add client components: `web/scripts/strip-runtime.mjs` removes the React runtime.
- Changes to the public API or build data go through `contract/` first; run `yarn contract:check`.
