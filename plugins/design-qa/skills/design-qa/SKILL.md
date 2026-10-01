---
name: design-qa
description: Scenario-based UI/UX design QA for one feature, in any repository. Derives user scenarios from the feature's intent, tests the design specs and any interactive demo against personas, user behavior and product vision, hunts edge cases, and publishes a visual HTML report of passed and failed scenarios, why they failed and what to do next, saved under qa-tests/. Use for design QA, scenario testing, UX review, edge-case review or "will this feature work for our users" questions, before or alongside implementation.
---

# Design QA

Judge whether a feature's design lets its intended users get their job done — correctly, with
outcomes they can trust and effort they will tolerate — across realistic situations and edge
cases. The result is a visual, shareable HTML report that designers and developers can read in
five minutes and act on.

This is a design evaluation. It does not prove production readiness, adoption or real-user
comprehension, and it never replaces testing with people.

Work in three phases: **1 Intent → scenarios**, **2 Test the design**, **3 Report**. Phase 1's
success criteria are fixed before Phase 2 looks at the solution, so the design under test never
writes its own passing grade.

## 0. Set up the run

1. **Find the repo profile.** Read `qa-tests/qa-profile.md` at the repository root. It tells you
   where this repo keeps intent, personas, research, analytics, product vision, constraints,
   tokens/components and demos, plus repo-specific rules and edge-case lenses. Also read the
   repo's `CLAUDE.md` / `AGENTS.md` and any README in folders you cite — repo rules win over
   this skill where they conflict.
   - **No profile?** Discover sources yourself (see
     [references/profile-template.md](references/profile-template.md) for what to look for),
     run the QA, then write `qa-tests/qa-profile.md` from the template with what you found, so
     the next run and your teammates start faster. Mark guesses **[assumption]**.
2. **Identify the target:** the feature/ticket, the design option or revision, roles, surface
   (mobile, desktop, both), specs, and demo (URL, build, route, fixtures). If several options are
   live and none is selected, test each separately against the same scenarios; never mix a
   retired option with the current one.
3. **Record the boundary:** today's date, file revisions or commit plus whether the working tree
   is dirty, demo URL/build/config, and what is deliberately out of scope.

Ask only what you cannot find. One focused question beats a questionnaire.

## 1. Intent → scenarios

### 1a. Establish the intent

Look for the feature's intent where the profile says (commonly `plan/<feature>/intent.md`,
refinement notes, a ticket, a PRD). Extract:

- **Problem** and who has it · **job to be done** · **observable success** · **scope / non-goals**
  · **decisions already made** · **open questions**.

If no intent exists, ask the user — briefly — for the problem, primary users, what success looks
like and what's out of scope. If they'd rather you proceed, reconstruct the intent from the
specs/ticket and label it **reconstructed — [assumption]** in the report. Never present a
reconstructed intent as agreed.

Write a one-line **outcome chain**: user situation → job → observable success → product benefit.
Check whether the feature solves the underlying problem or just implements the requested
mechanism.

### 1b. Build an evidence register

Read user research, personas, behavior analytics, product vision, constraints and decisions
**before** the design solution. Give each source an ID (`E01`…) with exact path/section, date,
type and limits. Keep the types distinct:

| Type | What it can support |
|---|---|
| research / persona | needs, work context, pain — keep their own caveats |
| analytics | measured behavior in a stated population, period and denominator |
| intent / requirement / decision | what is asked or agreed — not proof users need it |
| vision | strategic aims — not shipped capability or proven benefit |
| design / demo | intended or observed behavior of this design |
| assumption | inference — say what would validate it |

**Analytics are read-only.** Use saved insights first; query live only with read-only tools,
never create insights, events or dashboards. Record query/insight, window, filters, people vs
events. Don't infer success from clicks, absence of need from absent events, or causation from
correlation. Missing analytics become a hypothesis plus a validation plan — never invented rates.

### 1c. Write the scenarios

Give each a stable ID (`S01`…). Keep IDs and success criteria stable across reruns; if you must
change one, say why in the report rather than quietly rewriting a failing scenario.

Each scenario has: **kind** (core · alternate · edge · counterexample), **role/persona**,
**surface**, **trigger** (the real-world moment), **goal**, **preconditions**, **steps** from a
plausible entry point to the user's outcome (not merely "taps Save"), **success conditions**
(observable, each traced to intent, evidence or an explicitly *proposed* criterion), **importance**
and **evidence IDs**. Inferred situations are labelled **[assumption]**; scenarios are test
constructions, never simulated interviews.

Importance: **critical** (harm, lost or mis-scoped data, core job blocked) · **major**
(substantial friction, wrong decisions, lost value) · **minor** (limited, recoverable friction).
Severity is not frequency — say "frequency unknown" when it is unmeasured.

Aim for **6–12 scenarios** that cover meaningful variation, not a combinatorial checklist:

- The core success path for each in-scope role, and real alternate paths (people who do more
  than one role, different entry points).
- Edge cases chosen with the lenses in [references/scenario-lenses.md](references/scenario-lenses.md)
  plus any repo-specific lenses in the profile — pick those that could plausibly break *this*
  feature and say which lenses you skipped and why.
- **At least one counterexample** to the design's central value hypothesis: the feature works
  exactly as specified and still fails the user's job. Ground it in evidence; don't manufacture
  a defect to look rigorous.

## 2. Test the design

Each scenario gets **two independent results**:

- **Design** — do the specs/Figma/solution support every success condition? Cite the section.
- **Demo** — does the runnable prototype actually behave that way? Cite the observation.

| Result | Meaning |
|---|---|
| Pass | Every success condition is supported in this layer. |
| Partial | Some are; name the ones that aren't. |
| Fail | Specified or observed behavior contradicts a success condition. |
| Unknown | Silence, an open decision, or no runnable path blocks a conclusion. |
| N/A | Outside the agreed boundary, with the reason. |

Rules that keep results honest:

- A silent spec is **Unknown** (or Partial), not Fail. A direct contradiction is **Fail** even if
  other conditions are unknown.
- If the expected behavior is itself undecided, give a conditional result and an **[open]**
  question. Don't pick a business rule to get a pass.
- A demo that isn't supplied or won't run is **Unknown**, never Pass or N/A. Demo **Pass** needs
  executed evidence for every condition. Reading demo source is labelled `source-only` and
  leaves demo behavior Unknown.
- A mock passing proves nothing about persistence, permissions, sync, backend rules or whether
  users understand it.

### Running the demo

1. Read the demo's README/scripts. Confirm the build you're testing *is* the target option.
2. Start it with its documented command if not already running. Check that mutations stay in
   local fixtures before exercising them. Never write to product repos the profile marks
   read-only, and never test destructive actions against a live service.
3. Walk each feasible scenario with the browser/device tools available (Playwright or
   Puppeteer, a browser MCP, Claude in Chrome, a simulator). **Capture a screenshot at each
   scenario's decisive moment** — the pass state, or the exact screen where it breaks — into the
   run's `evidence/` folder. [scripts/capture.mjs](scripts/capture.mjs) is a small helper if
   Puppeteer or Playwright is installed in the project.
4. When a screen is wrong, also note the region that is wrong (x/y/width/height as % of the
   image) so the report can draw a callout on it.
5. If nothing can run the demo, finish the design review, mark demo results Unknown, and list
   exact pending steps.

If there is no demo but there is a Figma file and a Figma tool is available, screenshot the
relevant frames as **spec** visuals. Otherwise quote the spec excerpt — every failed scenario
should still show *something* concrete.

Classify each discrepancy: **design gap** · **demo/spec mismatch** · **demo limitation** ·
**evidence gap** · **new implementation ask**. Name existing components, tokens and data fields
from the repo's references; mark anything new as a new ask.

## 3. Report

### Findings and actions

Group failed/partial scenarios into findings (`F01`…). Each finding states: affected scenarios,
**expected vs actual** (cited), **why it matters** to the user, **confidence** (observed /
static evidence / hypothesis), the **recommended action** and its type — **fix** · **decision**
· **research** · **dependency** — and an exact **retest**. Prioritize **P1** (fix before build
or handoff), **P2** (fix before release), **P3** (polish / later).

For a genuinely open design choice, give **three distinct options with honest trade-offs**, then
a conditional recommendation. Settled requirements need a direct fix, not artificial options.

Judge **user value** separately from design adequacy: *supported by evidence*, *plausible but
unvalidated*, or *challenged by evidence* — with the citation and the next validation step.

### Write the output

Save each run to its own folder:

```
qa-tests/
  qa-profile.md                     repo profile (create if missing)
  README.md                         folder conventions (create if missing)
  index.html                        all runs, rebuilt by the renderer
  <feature-slug>/<YYYY-MM-DD>[-label]/
    results.json                    the structured result — source of truth for the report
    report.html                     generated, self-contained, shareable
    evidence/                       screenshots and capture notes
```

Use the feature slug the repo already uses (e.g. the `plan/` folder name). Add a `-label` for a
second run or option on the same day; never overwrite an earlier run.

1. Write `results.json` following [references/results-schema.md](references/results-schema.md).
2. Render it:
   `node <this skill>/scripts/render-report.mjs qa-tests/<feature>/<run>/results.json`
   This validates the data (unknown IDs, bad enums, missing visuals on failures), embeds the
   screenshots, writes `report.html` beside it and rebuilds `qa-tests/index.html`. Fix every
   validation error it prints; warnings are worth a look.
3. Open the report and check it visually — both light and dark mode, and at phone width.
4. **Share:** if an Artifact/publishing tool is available, offer to publish `report.html` so the
   team gets a link (it's self-contained, so it publishes as one file). Otherwise give the path.

If `qa-tests/README.md` doesn't exist, create it from the folder layout above.

### Reply in chat

Lead with the verdict on the core job, the counts (design and demo separately, Unknown and N/A
visible), the top 3 findings with their actions, and the link or path to the report. Never let
a high pass count hide a critical failure. On a rerun, set `meta.previous_run` and say what is
fixed, regressed, unchanged and still unverified.

## Boundaries

- Don't edit research, specs, demos, design-system files or product code as a side effect of
  QA. Findings are recommendations, not approved changes.
- No aggregate quality score. Unknowns are actionable, not footnotes.
- Keep **[assumption]** and **[open]** markers from upstream sources; never resolve an open
  question to tidy the report.
- If the repo requires another review (a cross-check, an accessibility audit), this skill
  complements it; it doesn't replace it.
