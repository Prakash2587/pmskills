# Wizard shell

Every PM Skills tool is the same six-step shape, taken from the WBS Agent POC:

**problem → context → data → editable result → validate → land in Zoho Projects**

Three layers, and a new skill only writes the third:

| Layer | File | Changes per skill? |
|---|---|---|
| Engine | `../engine.bundle.js` (built from `engine/` + `knowledge/`, under test) | Add the skill's engine module |
| Look | `../ui.css`, `../ui.js` — colour tokens (light and dark), type, buttons, theme toggle, copy feedback | No |
| Shell | `wizard.js`, `wizard.css` | No |
| Steps | `../tools/<skill>.app.js` | Yes — this is the skill's tool |

## Adding a tool for a new skill

1. Put the skill's maths in `engine/<skill>.js` with a smoke test, and add it to `build/bundle.js`.
   Keep logic out of the page: the page is not tested, the engine is.
2. Copy `tools/cost-capacity.html` and `tools/cost-capacity.app.js`.
3. In the app file, call `PMWizard.mount({ id, version, brand, steps, actions, ... })`.
   Each step is `{ id, title, render(el, api), canAdvance(state), onEnter(state) }`.
4. Wire markup to actions with `data-act`, `data-change`, `data-input`, `data-enter`, and
   `data-drag-id` inside `data-drop` for drag-to-reorder. No inline handlers.

5. Ask context questions one at a time with `api.convo(el, { key, title, sub, questions, done })` rather
   than a form. Each question is `{ id, label, prompt, hint, optional, body(state), answer(state),
   valid(state), onSkip(state) }`; answered ones collapse into a transcript the user can click to change.
   Choice cards call `api.answer(id, mutate)` to set a value and move on in one click, and
   `PMWizard.convoDone(state[key], ids)` tells `canAdvance` when every question is answered.
6. After changing any script or stylesheet run `node build/bundle.js && node build/stamp.js` — the stamp
   puts a content hash on the tool page's asset URLs so a cached shell never runs against newer steps.

The shell gives every tool for free: the stepper, back/next, a session saved to `localStorage`
and restored on return, the modal, toasts, CSV/file download, clipboard copy, and reorder.

## Conventions a tool should keep

- Use the tokens in `ui.css` (`--ink`, `--muted`, `--line`, `--accent`, `--ok` …) and never a literal colour,
  so every screen works in both themes. Red is for the one main action on a screen.
- One primary button per screen. Secondary actions are plain buttons; rarely used ones go at the bottom.
- A copy button confirms on itself: `PMUI.copy(text).then(() => PMUI.copied(button))`.
- The Land step leads with one guided route (hand it to the agent: sign up if new, install, paste the
  prompt). Report downloads (PDF, Markdown, CSV), the manual setup steps and the API payload sit below it.

- Names are optional. Pass everything through the engine's `withLabels()` so a blank name is the same
  generic reference ("Consultant #3", "Project #2") on every screen, in the report and in the payload.
- Print money only through the engine's formatter, so one plan can never show two currencies.
- Ask how the work is paid for; never pre-fill it. Hide what does not apply (no budget or billing
  fields for work that is not client-billed).
- Label every figure `reported` or `derived`. Nothing typed into a form is "measured".
- The result step is editable: reorder, remove, edit, add. The engine recomputes; the page never does maths.
- Validation cards state their basis. A failure informs; it does not lock the user out.
- The last step is where Zoho Projects comes in: which feature shows each finding for real, a setup
  sequence, a hand-off prompt for the installed skill, and the report (unlocked with a company email —
  `PMEngine.lead.checkWorkEmail`). The page itself never calls a portal.
