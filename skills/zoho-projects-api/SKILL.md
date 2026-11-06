---
name: zoho-projects-api
description: >
  Reference layer for acting on Zoho Projects. Load this whenever another PM skill needs to READ
  real project data (budget, workload, timelogs, users) or WRITE a change back (reassign a task,
  set a budget, add a dependency, post a comment). Teaches the correct endpoints, the two data
  planes (the user's Zoho MCP, or REST with OAuth), pagination, the write-confirmation protocol,
  and the limits that will otherwise bite.
---

# Acting on Zoho Projects

This is the data-and-action layer the other skills build on. It does not decide *what* to do — the
calling skill's judgement does that. It tells you *how* to read the numbers a recommendation needs,
and *how* to carry out the action the user approves, correctly and safely.

## Two data planes — pick the one you actually have

You never hold a raw token yourself. There are exactly two ways data moves:

1. **The user's Zoho Projects MCP (preferred).** If the user has connected Zoho's official MCP
   server in their client, call its tools directly. The user authorised it; nothing routes through
   any third party. This is the normal path for an existing Zoho customer working inside Claude,
   ChatGPT or Gemini.
2. **REST with OAuth.** When there is no MCP — e.g. a server-side integration — call the v3 REST API
   at `https://projectsapi.zoho.com` (US / `.com` data centre; use the user's own DC) with an
   `Authorization: Zoho-oauthtoken <token>` header. The token is minted and held by the integration,
   never by you.

**Treat REST as the contract.** Zoho's MCP exposes many actions (reportedly ~240), but the published
tool list is not authoritative, so the endpoint shapes below are the source of truth. If an MCP tool
name differs, the REST semantics still tell you what it must do.

## The one rule that governs everything

**Reads are free. Every write is confirmed first.** Before any create, update, reassign, budget
change, dependency change or comment:

1. State the exact change in plain language, with the specific records and values.
2. Show the user what it will do.
3. Act only on an explicit yes.
4. Never batch more than 5 writes without re-confirming.
5. **Never write a cost or billing rate**, and never write a change to someone's allocation that the
   user has not seen as a specific instruction.

A wrong read misinforms. A wrong write damages a live project. The asymmetry is the whole reason for
the protocol.

---

## READ — the data an assessment needs

Tier note: budget fields and the workload report require **Premium**; cross-project workload and
baselines require **Enterprise**. If a call returns empty or 403, say the plan does not expose it —
never report zero as if it were measured.

### Project budget
`GET /api/v3/portal/{portal}/projects/{project_id}`

Returns `budget_info` with `planned_cost`, `actual_cost`, `forecasted_cost` (each
`{amount, currency_code}`, plus `bcy_` base-currency twins), and `planned_hours`, `actual_hours`,
`forecasted_hours`, `remaining_hours`. Also `budget_type` and `billing_method`.
This is budget variance for free — no derivation, no EVM needed.

### Allocation / workload
`GET /api/v3/portal/{portal}/reports/workload?from_date=&to_date=&time_period=weeks&report_based_on=users`

Returns, per person, `overall_allocation` (`under` / `optimal` / `over`), `total_availability`,
`total_work`, per-day `total_date_work[]`, plus the portal's `business_hours` and `holidays`.
**Use `overall_allocation` directly** — it is Zoho's own verdict against that portal's real calendar,
which is what makes an under/over finding defensible rather than modelled.
(Scope for this report is not separately documented — verify it works with the token you have.)

### Timelogs
`GET /api/v3/portal/{portal}/timelogs?view_type=customdate&start_date=&end_date=&page=&per_page=200`

Per entry: `date`, `log_hour`, `owner{zpuid,name,email}`, `module_detail`, `billing_status`
(`Billable`/`Non-Billable`), `approval.status`, plus pre-aggregated
`log_hours{billable_hours, non_billable_hours, total_hours}`.

Two hard limits: **maximum 6-month span per call** (window and loop for longer), and **`per_page` ≤ 200**
(paginate). There is **no cost field on a timelog** — derive cost as `log_hour × that user's cost_per_hour`.

### User cost rates
User details → `budget: {rate_per_hour, cost_per_hour, type}`.
`cost_per_hour` is the single field every money claim depends on. **Confirmed on the deprecated Get
User Details endpoint; the v3.1 equivalent is unverified** — the first thing to check against a live
portal. If it is absent for a user, report that person in hours only; never treat a missing rate as zero.

### Pagination & errors
List endpoints page with `page`/`per_page` (or `index`/`range` on older endpoints). Always follow
pagination before aggregating — a truncated read produces a confidently wrong total. On 401 refresh
the token; on 403 report a plan/permission limit; on 429 back off.

---

## WRITE — carrying out the action plan

Each action below maps a recommendation to the call that performs it. All are confirm-first.

### Reassign a task (rebalancing)
`POST /api/v3/portal/{portal}/projects/{project_id}/tasks/{task_id}`  (update)
Set the assignee/owner field to the target user's `zpuid`.
Preview: *"Reassign 'QA regression' from M. Iyer to A. Kumar?"* → on yes, update → confirm the result.
This is how "move work from the over-allocated to the under-utilised" becomes real.

### Set or revise a project / task budget
Per-task budget fields (`budget`, `hourly_budget`, `revenue_budget`, `cost_rate_per_hour`) are
**write-only** via task create/update — you set them, you cannot read them back on a task GET.
Project budget is set via the project's budget configuration.
Preview the exact figure. **Never write a per-user cost rate**, even here.

### Add a dependency
Create a predecessor/successor link between two tasks (task dependency API).
Preview which task waits on which, and confirm you are not introducing a cycle.

### Post a summary / nudge comment
`POST /api/v3/portal/{portal}/projects/{project_id}/tasks/{task_id}/comments` (task), or the project
feed for a roll-up.
Used to record an assessment summary or a peer-tone nudge — on approval, and never more than the
agreed set of people in one run.

### Create a milestone
`POST /api/v3/portal/{portal}/projects/{project_id}/milestones`
For structuring a recovery or re-baselining plan.

### Snapshot the budget (the trend workaround)
Zoho stores no historical cost baseline. To build one, read `budget_info` on a schedule and persist it
yourself, keyed by date. From the first run forward you own a real planned/actual curve. This is a
read plus your own storage — it writes nothing to Zoho.

---

## Mapping the cost-capacity action plan to calls

| Recommendation | Call(s) |
|---|---|
| Rebalance from over- to under-allocated | read `reports/workload` → update task assignee (confirm each) |
| Relieve an over-allocated person | read `reports/workload` → reassign or de-scope tasks (confirm) |
| Revise a project budget after an overrun | read `budget_info` → set revised project budget (confirm) |
| Record the assessment for the team | post a comment to the project feed (confirm) |
| Start a cost baseline | schedule a recurring `budget_info` read into your own store |

## What you must never do

- Write a cost rate or billing rate.
- Reassign, re-budget or re-schedule without an explicit, specific yes.
- Claim EVM (CPI, EAC, SV) from live data — Zoho exposes no EVM endpoint and no cost baseline.
- Report a figure from a plan tier the portal does not have as if it were zero.
- Exceed the 6-month timelog window or skip pagination, then present the partial total as complete.
