---
name: zoho-projects-api
description: >
  Reference layer for acting on Zoho Projects. Load this whenever another PM skill needs to READ
  real project data (budget, workload, timelogs, users) or WRITE a change back (reassign a task,
  set a budget, add a dependency, post a comment, set up a plan as projects and tasks, or create a
  whole work breakdown structure as a new project). Also
  covers what to do when the portal is not connected yet. Teaches the correct endpoints, the two data
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

## If you cannot reach the portal

Try one harmless read first (list the portals or projects). If no Zoho Projects tool is available,
or the read is refused, **stop and help the user connect** — do not continue from assumptions.

Tell them, in this order:

1. **Sign in to Zoho Projects** as someone who can change portal settings. If they have no portal
   yet, they need to create one first.
2. **Turn MCP access on:** Portal Configuration → AI Hub → MCP Access.
3. **Turn API access on:** Developer Space → API Access & Mobile Access → enable → Update.
4. **Add the Zoho Projects connector in this AI client** (it is listed among the client's connectors
   in Claude and Gemini; ChatGPT, Cursor and VS Code take the MCP server URL for the portal's data
   centre) and approve the sign-in when prompted.
5. **Start a new chat with the connector switched on**, then ask again.

Menu names move. If a step does not match what they see, point them to Zoho's own guide, "Zoho
Projects MCP Server", in the Zoho Projects help centre rather than improvising a path.

## The one rule that governs everything

**Reads are free. Every write is confirmed first.** Before any create, update, reassign, budget
change, dependency change or comment:

1. State the exact change in plain language, with the specific records and values.
2. Show the user what it will do.
3. Act only on an explicit yes.
4. Never batch more than 5 writes without re-confirming. The one exception is creating a brand-new
   project's structure, where a single approval of the previewed whole is enough (see "Creating a
   work breakdown structure").
5. **Never write a cost or billing rate**, and never write a change to someone's allocation that the
   user has not seen as a specific instruction.

A wrong read misinforms. A wrong write damages a live project. The asymmetry is the whole reason for
the protocol.

## How to work — the style every call follows

- **Read before you ask.** If the portal can answer a question, do not put it to the user.
- **Ask one thing at a time**, and only what the data cannot tell you: which person a name refers
  to, which project, whether a change should go ahead.
- **Show a change as before and after**, with the record's real name, so a yes means one specific
  thing.
- **Report what happened, not what you intended.** After a write, read the record back and state the
  result. If it failed, give the error as returned and stop.
- **Never fill a gap with a plausible value.** A missing rate, owner or date is reported as missing.
- **Keep the user's own names.** Refer to projects, tasks and people exactly as the portal spells them.

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

Dates are `yyyyMMdd` with no separators (for example `20261115`); other formats are refused.
Returns `owners[]`, each with `work.overall_allocation`, `work.total_availability`, `work.total_work`
and per-day `total_date_work[]`, plus the portal's `business_hours` and holidays. Besides `under`,
`optimal` and `over`, a person with nothing assigned comes back as `free`.
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
Preview: *"Reassign '`<task title>`' from `<current owner>` to `<new owner>`?"* → on yes, update → confirm the result.
(Placeholders — always use the real task title and people from the portal.)
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

### Setting up a plan from the planner

For a plan handed over from the PM Skills planner (see the calling skill for when this applies). The
setup data lists the working week, people, projects and tasks. Work through it in this order, and
keep the user in the loop at every step — a new portal is where a wrong write is cheapest to make and
most confusing to find later.

1. **People.** Read the portal's users and match each planner person to a real one, asking the user
   wherever the match is not exact or the planner used a generic reference. **Do not add or invite
   people yourself**: adding a user sends an invitation and can use a licence. Tell the user who is
   missing and let them add those people, then read the users again.
2. **Working week.** Compare the plan's business days and hours with the portal's. If they differ,
   tell the user what to change under the portal's business-hours settings. Do not proceed on a
   mismatched calendar — every capacity figure is measured against it.
3. **Projects.** Create each project that does not already exist:
   `POST /api/v3/portal/{portal}/projects` (the name is the only required field). Confirm first.
4. **Tasks.** Create each task under its project with its owner and planned work hours:
   `POST /api/v3/portal/{portal}/projects/{project_id}/tasks`. Owners are identified by the id
   returned when you read that project's users. Preview the whole list for a project, then create
   **at most 5 at a time**, re-confirming between batches.
5. **Rates and budget.** List each person's cost and billing rate from the plan and tell the user
   where to enter them — **you never write a rate**. A project budget may be set on request, with the
   exact figure confirmed.
6. **Read it back.** List what was created and anything skipped, with the reason. Then say plainly
   what happens next: the workload report only becomes meaningful once the team logs time against
   these tasks, and utilisation findings need about four weeks of it.

If a create call is refused, report the refusal and stop that step. Never retry with different
values to make it go through.

### Creating a work breakdown structure

For a structure handed over by the wbs-builder skill or the PM Skills WBS builder. The data lists a
project, phases (if any), task lists, tasks with their parents, and dependencies, already in the order
to create them. Everything here was observed on a live portal.

**One approval covers the whole structure.** The target is always a new project, so nothing existing
can be harmed. Show the counts, wait for a yes, then create in this order and **stop at the first
failure**:

1. **Project** — `POST /api/v3/portal/{portal}/projects` with `name`. Add `is_rollup_project: true`
   only if the user asked for roll-up; it cannot be turned off later.
2. **Phases** — `POST /api/v3.1/portal/{portal}/projects/{project_id}/phases` with `name`. A phase
   sent without dates is given the creation date as both its start and its end. Tell the user.
3. **Task lists** — `POST /api/v3/portal/{portal}/projects/{project_id}/tasklists` with `name`, and
   `milestone: {id}` to place it under a phase.
4. **Tasks, then subtasks, one level at a time** — `POST .../projects/{project_id}/tasks` with `name`
   and `tasklist: {id}`. A subtask is the same call with `parental_info: {parent_task_id}`; its
   parent must already exist. At most **six levels of subtask**; a seventh is refused. Tasks keep
   the order they are created in. Where the route offers it, `POST .../bulk-tasks` takes up to 100
   tasks per call; if any item is invalid the whole call is refused and nothing is created.
5. **Dependencies** — `POST .../projects/{project_id}/tasks/dependency` with `predecessor_task: {id}`,
   `successor_task: {id}` and `dependency_type: "FS"`. One call per link. If your connection has no
   dependency action, do not improvise: list the links for the user to add by hand.

**Estimates.** Store the planned effort on the task:
`owners_and_work: {work_type: "standard", unit: "hours", copy_task_duration: false, owners: [{zpuid, work_values: "HH:MM"}]}`.
For a task with no owner, use the id of "Unassigned User", which is returned in the owners of any
unassigned task you create. Hours must be `"24:00"`, not `"24"`. In a roll-up project, set hours on
the lowest-level tasks only; hours on a parent are refused.

**Owners.** Assign a task only to a confirmed user who is a member of the project. Read the project's
users first. Anyone else stays in the task's description as the intended owner. Never add or invite a
user.

**Read every reply, not just its status.** A dependency that would close a loop comes back with a
success status and `"ERROR": true` in the body. Treat that as a failure.

**Pace yourself.** An endpoint accepts 200 calls in two minutes, then blocks for ten. Creating tasks
one at a time, leave a short gap between calls once you pass a hundred.

**When something fails,** stop, read the project back, and tell the user exactly what exists. Do not
retry with altered values. There is no undo; the clean-up is `POST .../projects/{project_id}/trash`,
on the user's say-so.

**When it succeeds,** read the project back and report the counts against what was asked for, plus
every task left unassigned and why.

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
| Set up a plan from the planner | match people → check the calendar → create projects → create tasks (≤5 per batch, confirm each) |
| Create a work breakdown structure | one approval → project → phases → task lists → tasks by level → dependencies → read back |

## What you must never do

- Write a cost rate or billing rate.
- Add or invite a person to the portal.
- Use a name, project or figure from an example in a skill file as if it were the user's data.
- Reassign, re-budget or re-schedule without an explicit, specific yes.
- Claim EVM (CPI, EAC, SV) from live data — Zoho exposes no EVM endpoint and no cost baseline.
- Report a figure from a plan tier the portal does not have as if it were zero.
- Exceed the 6-month timelog window or skip pagination, then present the partial total as complete.
