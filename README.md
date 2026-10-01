# design-qa

A Claude Code skill for scenario-based UI/UX design QA of a single feature, in any repository.
It:

1. **Derives user scenarios from the feature's intent.** It reads the intent from the repo, or
   asks you for it.
2. **Tests the design and any runnable demo** against personas, user behavior and product
   vision, and hunts for edge cases.
3. **Writes a visual HTML report.** The report covers the verdict, a results matrix, failed
   scenarios with annotated screenshots, why they fail, recommended actions and retests. It's
   saved under `qa-tests/` in the repo.

Open [the sample report](plugins/design-qa/skills/design-qa/examples/sample/report.html) to see
the output.

## Install

**As a plugin (recommended for teams).** Push this folder to a git repo your team can read,
then in Claude Code:

```
/plugin marketplace add <git-url-or-local-path>
/plugin install design-qa@design-qa-tools
```

Update later with `/plugin marketplace update design-qa-tools`.

**As a personal skill.** Copy or symlink `plugins/design-qa/skills/design-qa` into
`~/.claude/skills/design-qa`. Don't install it both ways, or the skill will appear twice.

## Use

```
/design-qa  QA the pause-work-order feature, option C, demo at localhost:8084
```

Or just ask: "run design QA on the warranty feature". Include the feature, which option to test
(if there are several), and where the demo runs, if you know. On its first run in a repo the
skill writes `qa-tests/qa-profile.md`, which records where that repo keeps intent, personas,
research, analytics, constraints and demos. Commit that file, so your teammates' runs start
from the same sources.

## Output

```
qa-tests/
  qa-profile.md          where this repo's evidence lives + repo rules
  index.html             every run, with verdict and results
  <feature>/<YYYY-MM-DD>/
    results.json         structured results (stable scenario IDs for reruns)
    report.html          self-contained report — open, attach or publish
    evidence/            screenshots
```

Re-render a report after editing `results.json` by hand:

```
node <skill>/scripts/render-report.mjs qa-tests/<feature>/<run>/results.json
```

It needs only Node 18+. Screenshot capture uses Puppeteer or Playwright if the project already
has one installed. Otherwise Claude uses whatever browser tool is available.

## Files

| Path | What |
|---|---|
| `skills/design-qa/SKILL.md` | The method: intent → scenarios → test → report |
| `references/scenario-lenses.md` | Edge-case lenses (offline, interruption, permissions, language, …) |
| `references/results-schema.md` | The `results.json` format and what the renderer validates |
| `references/profile-template.md` | Template for a repo's `qa-tests/qa-profile.md` |
| `scripts/render-report.mjs` | results.json → report.html + qa-tests/index.html |
| `scripts/capture.mjs` | Simple screenshot helper |
| `assets/` | Report CSS/JS (light + dark, phone-friendly) |
| `examples/sample/` | A fictional worked example |
