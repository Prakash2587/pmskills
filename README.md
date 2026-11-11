# PM Skills for Zoho Projects

Project management skills for AI agents. Each skill teaches an LLM a specific PM discipline, has it
produce an **assessment** and an **action plan** from real numbers, and then helps **carry that plan
out inside Zoho Projects** through the Zoho MCP or REST API.

Neutral PM knowledge; Zoho Projects as the place you act on it.

**Status:** 2 skills live, 1 reference layer, more planned. A skill is listed live only once it is built
and tested.

| Skill | What it does | Status |
|---|---|---|
| **cost-capacity-optimization** | Who is over- and under-loaded, what sustained overtime costs, billable ratio, budget variance — graded, with an action plan. | ✅ Live |
| **wbs-builder** | Breaks a project into its work, checks the structure against sourced rules, and creates it in Zoho Projects as a new project. | ✅ Live |
| **zoho-projects-api** | The shared implementation layer: the real Zoho Projects endpoints for reading project data and writing changes back, confirm-first. Other skills load it. | ✅ Live |
| weekly-status-report · stale-task-chaser · scope-risk-digest · dependency/critical-path · estimate-accuracy · timesheet-gap · RAID log · sprint-health · Zoho setup | — | Planned |

## How it works

1. You ask your AI agent a PM question — "where is my project money going?", "who's overloaded?"
2. The skill runs **inside your own Claude / ChatGPT / Gemini**, so inference costs you nothing extra.
3. It produces an assessment (every finding graded *hard evidence / derived / inference*) and a
   prioritised action plan.
4. **Existing Zoho user:** with the Zoho Projects MCP connected, the skill carries the plan out —
   reassigns tasks, revises budgets, posts the summary — **confirming every write first**.
   **New user:** build a plan in the [web planner](site/tools/cost-capacity.html) with no account, export the
   report, or spin up Zoho Projects to act on it.

No model runs on our servers, no third party holds your token, and no write happens without an
explicit yes.

## What makes the advice trustworthy

Project management is full of numbers everyone repeats and nobody can source. These skills were built
against PMI, AACE International, APM, ISO 21502 and the published benchmark studies, and most of the
folklore did not survive:

- The **85% utilisation target** has no authoritative source and is refuted in the literature — not used.
- Agency / MSP utilisation bands trace only to vendor blogs — reported as *having no published
  benchmark*, never as a target you are failing.
- **No standards body prescribes a contingency percentage** — so none is suggested.
- Weekend-work findings cite published productivity research and fire only on a *sustained* pattern.
- **EVM is not claimed from live data** — Zoho exposes no EVM endpoint and no cost baseline, so the
  skill says so rather than inventing a curve.

See [`knowledge/`](knowledge/) — every benchmark carries its provenance (`sourced` / `directional` /
`folklore`), as plain data you can review without reading code.

## Install

### Claude Code

```bash
/plugin marketplace add Prakash2587/pmskills
/plugin install pmskills@pmskills
```

Installing the `pmskills` plugin brings both the `cost-capacity-optimization` skill and the
`zoho-projects-api` reference layer it acts through.

### Claude app · ChatGPT · Gemini · Cursor · Copilot

Upload or unzip the two skill packages in [`site/downloads/`](site/downloads/), then connect Zoho
Projects in your agent. See [docs/INSTALL.md](docs/INSTALL.md) for the steps.

## Repository layout

```
skills/
  cost-capacity-optimization/SKILL.md   the judgement: what to assess, what to change
  zoho-projects-api/SKILL.md            the implementation layer: how to read and write Zoho Projects
knowledge/                              sourced benchmarks, doctrine, practitioner patterns, catalogue (data only)
engine/                                 deterministic engine + tests (planner.js powers the web tool)
site/
  index.html                            skill gallery: one tile per skill, install, request a skill
  wizard/                               reusable six-step wizard shell — shared by every skill's tool
  tools/cost-capacity.*                 this skill's planner: problem -> context (asked one question at a
                                        time) -> team & work -> plan -> validate -> land
dist/capacity-cost-planner.html         the planner as ONE self-contained file — download and double-click
build/                                  bundle.js (engine -> browser), package.js (skills -> site copies and zips),
                                        stamp.js (cache-busting), standalone.js (-> dist/)
docs/                                   install and contribution guides
```

The skill is portable markdown and runs on any agent that reads `SKILL.md`. The `engine/` and `site/`
exist to serve the new-user, no-account path; the skill itself needs neither.

### Try the planner without installing anything

Open the [hosted planner](https://pmskills-920403142.development.catalystserverless.com/app/tools/cost-capacity.html),
or download [`dist/capacity-cost-planner.html`](dist/capacity-cost-planner.html) and open it — it works offline.
The offline file is regenerated only at design milestones, so it can be a round behind the hosted planner.

## License

MIT — see [LICENSE](LICENSE).
