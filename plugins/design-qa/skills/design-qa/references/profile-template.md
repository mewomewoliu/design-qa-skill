# Repo profile template

Save as `qa-tests/qa-profile.md` at the repository root. The design-qa skill reads it first on
every run. Keep it short: pointers and rules, not copies of the sources. Delete rows that don't
apply; add rows for anything this repo has that others don't.

Discovery hints for a first run, if no profile exists: look for `plan/`, `intent/`, `docs/`,
`prd/`, `specs/`, `design/`, `research/`, `personas/`, `users/`, `adr/`, `decisions/`, ticket
links in READMEs, a design-system or `tokens.json`, a storybook, `demo`/`prototype` folders,
and `package.json` scripts that start a dev server.

```markdown
# Design QA profile — <repo name>

Last checked: <YYYY-MM-DD>

## Product in one paragraph
<What the product is, who uses it, and on which surfaces.>

## Where the evidence lives

| Source | Path or link | Notes / caveats |
|---|---|---|
| Feature intent | e.g. `plan/<slug>/intent.md` | What's authoritative when sources disagree |
| Refinements & decisions | | |
| Personas & roles | | |
| User research | | |
| Behavior analytics | e.g. PostHog project <id>, saved insights | Read-only |
| Product vision / strategy | | |
| Design constraints / checklist | | Whether every checklist line must be answered |
| Design specs | e.g. `design/<slug>/design-solution.md`, Figma file | |
| Design tokens & components | | |
| Demo / prototype | how to start it, port, how to pick an option | Fixtures, mocks, fixed clocks |
| Product code | | Read-only? |

## Users and roles
<Role names as the system uses them, and how personas map to them.>

## Repo rules that QA must follow
- <e.g. both themes always; tokens not raw values; never write to X; how hypotheses are phrased>

## Extra edge-case lenses for this product
- <e.g. offline-stale, multi-tenant scope, Spanish expansion, glove use>

## Known traps
- <stale indexes, missing folders, demo limitations that look like bugs>

## Output
- Location: <default `qa-tests/<feature-slug>/<YYYY-MM-DD>[-label]/`, one folder per run — or a
  latest-only location such as `design/<feature-slug>/qa/`, where each run replaces the last>
- Feature slug: <how features are named, e.g. the `plan/` folder name>
- Superseded copies to remove: <latest-only only: older run folders or report files>
- Rebuild after rendering: <e.g. a workspace page that lists reports, or none>
- Sharing: <publish as Artifact / attach to ticket / etc.>
```
