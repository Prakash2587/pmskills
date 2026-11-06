# Contributing

## Principles these skills hold to

1. **Judgement in prose, calls in the reference layer.** A skill's `SKILL.md` decides *what* to assess
   and *what* to change. It defers every actual Zoho Projects read/write to `zoho-projects-api`. Keep
   that separation — it is what makes the judgement portable across agents.

2. **Every number is sourced or labelled.** No benchmark ships without provenance. If a figure only
   circulates on vendor blogs, it is marked `folklore` and never presented as a target the user is
   failing. See [`knowledge/`](knowledge/). When in doubt, compare the user to their own history.

3. **Grade every finding** — `hard evidence` (a field the API returned), `derived` (arithmetic over
   returned fields), or `inference` (a judgement about cause). An inference never inherits the
   authority of a returned field.

4. **Reads are free; writes are confirmed.** Never write without a specific, explicit yes. Never write
   a cost or billing rate. Never bulk-change more than five items without re-confirming.

5. **Say what you cannot see.** If the plan tier, data window or data quality limits a finding, state
   it. "Your data is too thin to support a recommendation" is a valid, honest answer.

## The deterministic engine

`engine/` powers the no-account web assessment. It is covered by smoke tests:

```bash
node engine/digest.smoke.js
node engine/recommend.smoke.js
```

Most tests assert what the engine must **not** say (no "increase utilisation", no unsourced
benchmark, no advice practitioners mock). A deterministic engine repeats its mistakes identically
forever, so the negative cases matter most. After any change to `engine/` or `knowledge/`, re-run both
suites and rebuild the browser bundle:

```bash
node build/bundle.js
```

The bundle ships the tested modules to the browser byte-for-byte — never hand-maintain a second copy
of the logic.

## Adding a skill

1. Write the judgement first, as plain rules, before any API call.
2. Reuse `zoho-projects-api` for data access; do not restate endpoints in the new skill.
3. Add the skill to `marketplace.json` and a card to `site/index.html` (with its demand evidence and
   an honest status).
4. If it makes financial or staffing recommendations, add negative tests for the advice it must never
   give.
