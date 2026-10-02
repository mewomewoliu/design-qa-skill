# results.json

`results.json` is the source of truth for a run; `report.html` is generated from it by
`scripts/render-report.mjs`. Keeping the data structured makes reruns comparable (stable IDs)
and keeps every report the same shape for the whole team. A complete worked example is at
[../examples/sample/results.json](../examples/sample/results.json).

All text fields accept plain text. Inline `**bold**`, `` `code` `` and `[label](url)` are
rendered; nothing else is. Paths in `visuals[].src` are relative to `results.json`.

```jsonc
{
  "meta": {
    "feature": "Pause a work order",          // human name
    "slug": "01-pause-work-order",            // folder name under qa-tests/
    "option": "Option C — camera first",      // design option / revision under test
    "date": "2026-10-01",
    "run": "2026-10-01",                      // folder name of this run (date[-label])
    "surface": "mobile",                      // mobile | desktop | both | …
    "roles": ["Chief Engineer", "Engineer"],
    "author": "Design QA (Claude) for Mia Liu",
    "boundary": "What was in and out of scope.",
    "reviewed": [                             // exact sources and builds
      { "label": "design-solution.md §3–5", "ref": "design/01-…/design-solution.md", "note": "dirty tree" }
    ],
    "demo": { "url": "http://localhost:8084", "build": "…", "method": "executed in Chromium 390×844" },
    "previous_run": "2026-09-29"              // optional; enables the "change" column
  },

  "verdict": {
    "core_job": "partial",                    // supported | partial | not_supported | unknown
    "headline": "One sentence a developer can repeat (≤ 140 chars).",
    "key_points": [                           // 3–4 bullets, ≤ 110 chars; "(F01)" becomes a link
      "Six clicks for one association, framed as a contract term",
      "Nothing shows which associations still need recording (F01)"
    ],
    "summary": "2–4 sentences: what works, the biggest risks, what to do first.",
    "user_value": "plausible",                // supported | plausible | challenged
    "user_value_note": "Why, with evidence IDs, and the next validation step."
  },

  "intent": {
    "source": "plan/01-pause-work-order/intent.md",   // or "Provided by <name> in chat"
    "status": "captured",                     // captured | reconstructed | provided
    "problem": "…",
    "users": "…",
    "job": "…",
    "success": ["Observable success 1", "…"],
    "out_of_scope": ["…"],
    "outcome_chain": "situation → job → success → benefit"
  },

  "evidence": [
    { "id": "E01", "type": "persona", "claim": "…", "source": "path §section", "date": "2026-08-12", "limits": "…" }
    // type: research | persona | analytics | intent | decision | vision | design | demo | assumption
  ],

  "scenarios": [
    {
      "id": "S01",
      "title": "Short name of the situation",
      "kind": "core",                         // core | alternate | edge | counterexample
      "lens": "Interruption",                 // optional, from scenario-lenses.md
      "role": "Engineer",
      "persona": "Maintenance Technician",    // optional
      "surface": "mobile",
      "trigger": "Real-world moment that starts it",
      "goal": "What the user is trying to achieve",
      "importance": "critical",               // critical | major | minor
      "assumption": true,                     // true if the situation is inferred
      "evidence": ["E01", "E03"],
      "preconditions": ["…"],
      "steps": ["…", "…"],
      "success": ["Observable condition 1", "…"],
      "design": { "result": "pass", "note": "Why, cited", "ref": "design-solution.md §4.2" },
      "demo":   { "result": "fail", "method": "executed", "note": "What happened" },
      // result: pass | partial | fail | unknown | na ; method: executed | source-only | not-run
      "findings": ["F01"],
      "change": "regressed",                  // reruns only: new | fixed | regressed | unchanged | unverified
      "visuals": [
        {
          "src": "evidence/s01-detail.png",   // image (png/jpg/webp/gif/svg)
          "kind": "actual",                   // actual | expected | spec
          "caption": "Detail screen after saving",
          "annotations": [                    // optional callouts, % of image size
            { "x": 6, "y": 38, "w": 88, "h": 9, "label": "Shows George, not Marta" }
          ]
        },
        { "kind": "spec", "excerpt": "Quoted spec text", "ref": "design-solution.md §4.2" }
      ]
    }
  ],

  "findings": [
    {
      "id": "F01",
      "title": "Specific problem, phrased as the user experiences it",
      "priority": "P1",                       // P1 fix before build/handoff · P2 before release · P3 later
      "category": "design_gap",               // design_gap | mismatch | demo_limitation | evidence_gap | new_ask
      "scenarios": ["S01", "S02"],
      "expected": "…",
      "actual": "…",
      "why": "User consequence; frequency known/unknown",
      "confidence": "observed",               // observed | static | hypothesis
      "action": {
        "type": "fix",                        // fix | decision | research | dependency
        "recommendation": "Concrete change, using real component/token names",
        "options": [                          // only for genuinely open choices — give 3
          { "label": "A — …", "tradeoff": "…" }
        ]
      },
      "retest": "Exact steps and pass condition",
      "visuals": []                           // same shape as scenario visuals; optional
    }
  ],

  "coverage": {
    "requirements": [ { "item": "REQ-3 …", "scenarios": ["S01"], "status": "covered", "gap": "" } ],
    // status: covered | partial | gap | na
    "constraints":  [ { "item": "Checklist line", "scenarios": ["S04"], "status": "covered", "gap": "" } ],
    "untested": ["Lens or combination not tested — and why"]
  },

  "open_questions": [
    { "question": "**[open]** …", "scenarios": ["S05"], "resolves": "Who/what settles it", "next": "Suggested action" }
  ],

  "next_actions": [
    { "priority": "P1", "action": "…", "owner": "design", "finding": "F01" }
    // owner: design | engineering | product | research | client
  ]
}
```

## Validation the renderer enforces

Errors (report is still written, but fix them):

- Unknown enum values; duplicate IDs.
- A scenario or finding referencing an evidence, scenario or finding ID that doesn't exist.
- A visual file that can't be found.

Warnings:

- Copy over its length limit: headline 140, key point 110, scenario title 70, finding title 90,
  expected/actual 180, recommendation 220 characters. A missing `verdict.key_points` (the
  overview then shows the top three finding titles instead).

- A `fail`/`partial` scenario with no finding, or a finding with no scenario.
- A failed scenario without any visual.
- A demo `pass` whose method is not `executed`.
- Fewer than one `counterexample` scenario.
- A `decision` action with fewer than three options.
