# Edge-case lenses

Use these to find the scenarios most likely to break *this* feature. Pick the lenses that apply
and record skipped ones with a one-line reason in `coverage.untested`. The repo profile can add
product-specific lenses; those take priority.

| Lens | Ask | Typical scenario |
|---|---|---|
| **Discovery** | Will the user find the feature at the moment they need it? | Trigger happens mid-task, on a different screen than the entry point |
| **Interpretation** | Do labels, defaults and choices mean what the user thinks? | A default silently applies to more than the user intended |
| **Completion & readback** | Can they confirm it worked and find the result again? | Saved, but no visible confirmation; result appears somewhere else |
| **Handoff** | What does the *next* person or surface see? | Another role or the desktop app receives incomplete or misleading data |
| **Interruption** | Phone call, app switch, timeout, battery death | Half-finished input is lost, or resumes in the wrong context |
| **Undo & mistakes** | Accidental tap, double submit, wrong item, change of mind | Duplicate record; no way back from a destructive action |
| **Data extremes** | Empty, one, many, very long, missing, malformed | Long names truncate the key information; empty state looks broken |
| **Time & boundaries** | Dates, time zones, expiry, weekends, limits, quotas | Deadline at midnight across zones; exactly-at-limit input |
| **Connectivity** | Offline, flaky, slow, reconnect, stale data, rejected sync | User acts on stale data; queued action fails silently later |
| **Concurrency** | Two people or two devices on the same item | Last write wins and wipes someone's work |
| **Permissions & context** | Role, scope/tenant, denied access, role change | Action visible but forbidden; data from the wrong account/scope |
| **Failure & recovery** | Server error, partial success, retry | Half the items saved; retry duplicates the other half |
| **Environment** | Gloves, glare, noise, one hand, small screen, older device | Targets too small or contrast too low for real field conditions |
| **Language** | Translation expansion, RTL, locale formats | German/Spanish strings overflow buttons; date format ambiguous |
| **Theme & display** | Light/dark, text scaling, reduced motion | Status colour only distinguishable in one theme |
| **Accessibility** | Screen reader, keyboard, focus order, colour-only meaning | Status conveyed only by colour; focus lost after a dialog |
| **Trust & value** | Works as specified, still fails the job (counterexample) | Users do it faster but the data is less reliable for the person who needs it |

Browser checks cannot prove native gestures, gloves, glare, screen-reader or one-handed
usability. Mark those **Unknown** with the device test that would settle them.
