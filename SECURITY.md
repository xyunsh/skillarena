# Security

## Reporting

Please report security problems privately through GitHub: **Security → Report a vulnerability** on this repository. Don't open a public issue for them.

Especially welcome:

- a skill that is listed on skillarena.dev and contains instructions aimed at the reader's agent (prompt injection, credential access, running downloaded code), or whose upstream version now does;
- a generated page that escapes its sandbox, reaches the site's origin, or tracks visitors;
- a way around the skill scan, the screenshot network guard, or the text cleaning described in the README.

## Threat model in short

Skills and the pages they produce are untrusted. The pipeline gives the model no tools, never executes skill files, blocks local and private network access while taking screenshots, and serves generated pages only from a separate, sandboxed asset domain. The README section "Security: skills are untrusted" lists each measure and where it lives in the code.

Installing a skill gives it your coding agent's permissions. SkillArena pins every result to a tested commit and warns when the skill changed upstream, but it does not audit skills for you: read a skill before installing it.
