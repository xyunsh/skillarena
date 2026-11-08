# Skipped skills

Skills that depend on executing scripts (not just written rules) are not generated, because a plain API call can't reproduce them.

| id | repo | commit | reason |
|---|---|---|---|
| ui-ux-pro-max | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | b7d5353 | SKILL.md instructs running bundled scripts (scripts/search.py); results would not be reproducible via a plain API call. |
| taste-skill | https://github.com/Leonxlnx/taste-skill | 9b4bf93 | SKILL.md instructs running bundled scripts (assets/backgrounds/check.mjs, assets/layout/check.mjs, assets/layout/deal.mjs, …); results would not be reproducible via a plain API call. |
| impeccable | https://github.com/pbakaus/impeccable | 687bc38 | SKILL.md instructs running bundled scripts (scripts/impeccable); results would not be reproducible via a plain API call. |
| hallmark | https://github.com/Nutlope/hallmark | 407fa68 | SKILL.md instructs running bundled scripts (scripts/capture.mjs, scripts/sloplint.mjs, scripts/theme.mjs); results would not be reproducible via a plain API call. |
| fluid-functionalism | https://github.com/mickadesign/fluid-functionalism | 7e6ae29 | SKILL.md instructs running bundled scripts (scripts/audit.mjs, scripts/stack.mjs, scripts/upgrade.mjs); results would not be reproducible via a plain API call. |
