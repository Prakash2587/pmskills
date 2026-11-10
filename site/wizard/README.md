# Wizard shell

Every PM Skills tool is the same six-step shape, taken from the WBS Agent POC:

**problem → context → data → editable result → validate → land in Zoho Projects**

Three layers, and a new skill only writes the third:

| Layer | File | Changes per skill? |
|---|---|---|
| Engine | `../engine.bundle.js` (built from `engine/` + `knowledge/`, under test) | Add the skill's engine module |
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

The shell gives every tool for free: the stepper, back/next, a session saved to `localStorage`
and restored on return, the modal, toasts, CSV/file download, clipboard copy, and reorder.

## Conventions a tool should keep

- Label every figure `reported` or `derived`. Nothing typed into a form is "measured".
- The result step is editable: reorder, remove, edit, add. The engine recomputes; the page never does maths.
- Validation cards state their basis. A failure informs; it does not lock the user out.
- The last step lands in Zoho Projects three ways: a setup sequence, a hand-off prompt for the
  installed skill, and an export. The page itself never calls a portal.
