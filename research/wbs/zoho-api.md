# Zoho Projects: feasibility map for a WBS-creating skill (REST API v3 and official MCP)

Research date: 2026-11-11. Web research only; no Zoho API was called and no project file was changed.

## How to read the evidence labels

**Source labels**

- **READ**: I downloaded Zoho's own page and parsed its text directly (all `projects.zoho.com/api-docs/...` pages and `zoho.com/projects/pricing-comparison.html`). Quotes are exact.
- **READ-S**: Zoho's own page, but read through a summarising fetch tool (help.zoho.com is JavaScript-rendered and could not be parsed directly). Short quotes are exact; anything longer is paraphrase and should be re-checked before being quoted in the skill.
- **SEARCH**: seen only in a search-result snippet of a Zoho page; the page itself was not opened.
- **INFERRED**: my reasoning from the above, not a statement in the docs.

**Confidence labels**: confirmed in docs / partly documented / not documented / contradictory.

**Three caveats that apply throughout**

1. The v3 docs mark a field `required` only when it is. Absence of `required` means "documented as optional", which is weaker than "the server accepts a call without it". Layout rules, strict projects and portal settings can add server-side requirements the docs do not show.
2. The sample request bodies in the v3 docs are auto-generated and contain obvious errors (for example `"description": false`, `"start_after": {"unit": "hours_per_day"}`, `zpuid` shown as an array while the parameter table says String). Trust the parameter tables, not the samples.
3. The base host in the v3 docs is `https://projects.zoho.com` (plus one per data centre). `projectsapi.zoho.com` appears nowhere in the v3 docs; it is the host used by the old `/restapi/` docs. Whether it also serves `/api/v3/` is not documented.

---

## 1. Object hierarchy

| Fact | URL | Source | Confidence |
|---|---|---|---|
| "Milestones have been renamed to phases." | https://help.zoho.com/portal/en/kb/projects/phases/articles/phase-list-view | READ-S | confirmed in docs |
| Zoho's own WBS article describes the hierarchy as Phases > Task Lists > Tasks > Subtasks (inside a project). | https://help.zoho.com/portal/en/kb/projects/zoho-projects-overview/articles/work-breakdown-structure-in-zoho-projects | READ-S | confirmed in docs |
| The API uses both names. URL path is `/phases`; OAuth scope is `ZohoProjects.milestones.*`; path variable is `[MILESTONE_ID]` in v3 and `[PHASE_ID]` in v3.1; the task-list and task bodies use the key `milestone`; Move Task uses `target_milestone_id`. | https://projects.zoho.com/api-docs/phases , https://projects.zoho.com/api-docs/task_lists#task_lists-create_task_list , https://projects.zoho.com/api-docs/tasks#tasks-move_task | READ | confirmed in docs |
| The v3 phase endpoints are marked deprecated in favour of v3.1 ("This API is deprecated. Use Create a Phase instead."). | https://projects.zoho.com/api-docs/phases#phases-create_phase | READ | confirmed in docs |
| A task list can exist without a phase. `milestone` is optional in Create Task List; responses carry `"is_none_milestone_tasklist": true` and a milestone named `"None"`. The help article says "Set a Task List Flag if no phase is selected." | https://projects.zoho.com/api-docs/task_lists#task_lists-create_task_list , https://help.zoho.com/portal/en/kb/projects/tasks/task-list/task-lists-introduction/articles/create-task-lists | READ / READ-S | confirmed in docs |
| A task cannot exist without a task list, but you may omit it: "Uses the general task list when task list details are not provided; the project must have a general task list or an exception is thrown. To create one, use the Create Default Task List". | https://projects.zoho.com/api-docs/tasks#tasks-create_task | READ | confirmed in docs |
| Portal > project nesting: every path is `/api/v3/portal/[PORTAL_ID]/projects/[PROJECT_ID]/...`. | https://projects.zoho.com/api-docs/projects | READ | confirmed in docs |
| "No, you cannot set dependency between phases." and "You cannot reorder task lists within phases" (reordering is done in the Tasks module UI). | https://help.zoho.com/portal/en/kb/projects/faqs/milestones/articles/milestones-7-2-2024 | READ-S | confirmed in docs |

Confirmed hierarchy: **portal > project > phase (API: milestone/phase) > task list > task > subtask (up to 6 levels)**. The phase level is optional.

---

## 2. Create a project

**Endpoint**: `POST /api/v3/portal/[PORTAL_ID]/projects`, scope `ZohoProjects.projects.CREATE`. URL: https://projects.zoho.com/api-docs/projects#projects-create_project (READ, confirmed in docs).

| Field | Type | Required? | Notes (exact where quoted) |
|---|---|---|---|
| `name` | String | **required** | max length 200 |
| `description` | String | optional | max length 80000 |
| `project_type` | String | optional | "Accepted values : active,template" |
| `owner.zpuid` | String | `zpuid` required if `owner` is sent | "You can obtain it from the Get Portal Users API (the "id" field in the response)." |
| `is_public_project` | boolean | optional | true/false |
| `start_date`, `end_date` | String | optional | `YYYY-MM-DD` |
| `status.id` | String | optional | from Get Global Statuses |
| `layout.id` | String | optional | from Get Layouts |
| `project_group.id` | String | optional | from Get Project Groups |
| `is_rollup_project` | boolean | optional | turns on task roll-up for the project |
| `budget_info` | JSONObject | optional | `billing_method` (project_hours, staff_hours, fixed_cost, issue_hours, task_or_issue_hours), `budget_type` (none, based_on_project, based_on_milestone, based_on_task, based_on_user), `tracking_method`, `currency`, amounts |
| `copy_from` | int | optional | "Enter the template ID or existing project ID that this new project should be copied from." |
| `business_hours_id` | String | optional | |
| `tags`, `sub_module_settings`, `added_via` | | optional | |
| `<field_name>` | varies | optional | project custom field by API name |

Other facts:

| Fact | URL | Source | Confidence |
|---|---|---|---|
| Create from template exists as the `copy_from` body field (template ID or existing project ID). | same | READ | confirmed in docs |
| A template can be created through the API by sending `project_type: "template"`. | same | READ | confirmed in docs |
| No dedicated "list project templates" endpoint is published. The module blurb mentions "access favorite templates or gallery templates, add projects from templates" but no such endpoint is listed. Whether Get All Projects can be filtered to templates is not stated. | https://projects.zoho.com/api-docs/projects | READ | not documented |
| Strict project cannot be set by a documented request field. `is_strict_project` appears only in responses. | same | READ | not documented (as an input) |
| "Group" is `project_group.id`; groups have their own endpoints (create/get/update/delete project group). | https://projects.zoho.com/api-docs/projects/project_group | READ (nav only) | partly documented |
| Related: `POST /projects/[PROJECT_ID]/trash`, `/restore`, `DELETE /projects/[PROJECT_ID]` (permanent, from trash), `PATCH` to update. | same | READ | confirmed in docs |

---

## 3. Create a phase (milestone)

**Current endpoint**: `POST /api/v3.1/portal/[PORTAL_ID]/projects/[PROJECT_ID]/phases`, scope `ZohoProjects.milestones.CREATE`. URL: https://projects.zoho.com/api-docs/phases#phases-create_a_phase (READ, confirmed in docs).

| Field | Required? | Notes |
|---|---|---|
| `name` | **required** | max length 65000 |
| `flag` | optional | "Accepted values: Internal or External." (sample uses lowercase `internal`) |
| `owner.zpuid` | `zpuid` required if `owner` is sent | |
| `status.id` | `id` required if `status` is sent | |
| `start_date`, `end_date` | optional | `YYYY-MM-DD` |
| `position` | optional | `before_id`, `after_id`, `exact_position` (int), `known_position` ("first, last") |
| `tags[].id`, `color`, `budget_info`, `template_settings` | optional | `template_settings` only for template projects |

| Fact | URL | Source | Confidence |
|---|---|---|---|
| In v3.1 only `name` is marked required; dates, owner and flag are documented as optional. | above | READ | confirmed in docs (as documented; server behaviour untested) |
| The deprecated v3 endpoint `POST /api/v3/portal/[PORTAL_ID]/projects/[PROJECT_ID]/phases` also marks only `name` required (max length 100) and uses flat fields `owner_zpuid`, `status_id`, `next`, `previous`. | https://projects.zoho.com/api-docs/phases#phases-create_phase | READ | confirmed in docs |
| The old v2 REST API marked `name`, `start_date`, `end_date`, `owner`, `flag` all Mandatory (`POST /restapi/portal/[PORTALID]/projects/[PROJECTID]/milestones/`, dates `MM-DD-YYYY`). | https://www.zoho.com/projects/help/rest-api/milestones-api.html | READ-S | contradictory with v3.1 (different API generation) |
| The UI help says "Give a name for your phase and set its Start and End Dates." and to select an Owner and flag, without saying which are mandatory. | https://help.zoho.com/portal/en/kb/projects/phases/articles/phase-list-view | READ-S | partly documented |
| Flag meaning: "Internal: Only portal users can access the milestone and its associated entities." "External: Portal and Client users can access the milestone and its associated entities." | https://help.zoho.com/portal/en/kb/projects/phases/articles/project-phases | READ-S | confirmed in docs |
| No error examples are published for the phase endpoints, so what the server returns for a phase with no dates or no owner is unknown. | https://projects.zoho.com/api-docs/phases | READ | not documented |

Verdict: whether a phase can really be created with name only is **the most important open item**; v2 required five fields and v3.1 documents one.

---

## 4. Create a task list

**Endpoint**: `POST /api/v3/portal/[PORTAL_ID]/projects/[PROJECT_ID]/tasklists`, scope `ZohoProjects.tasklists.CREATE`. URL: https://projects.zoho.com/api-docs/task_lists#task_lists-create_task_list (READ, confirmed in docs).

| Field | Required? | Notes |
|---|---|---|
| `name` | **required** | max length 10000 |
| `milestone.id` | optional | this is the link to the phase |
| `flag` | optional | "Accepted values: internal,external ." |
| `status` | optional | "active or completed" |
| `tags` | optional | |

| Fact | URL | Source | Confidence |
|---|---|---|---|
| Sample body: `{"name":"Tasklist","milestone":{"id":"4000000062001"},"flag":"internal","status":"active"}` | above | READ | confirmed in docs |
| Default ("General") task list: `POST /api/v3/portal/[PORTAL_ID]/projects/[PROJECT_ID]/default-tasklists`, scope `ZohoProjects.tasklists.CREATE`, body `flag` **required**. | https://projects.zoho.com/api-docs/task_lists#task_lists-create_default_tasklist | READ | confirmed in docs |
| Update: `PATCH .../tasklists/[TASKLIST_ID]` (fields: name, milestone, flag, status, tags, color). The page lists its scope as `ZohoProjects.tasklists.CREATE`. | https://projects.zoho.com/api-docs/task_lists#task_lists-update_task_list | READ | confirmed in docs (scope looks like a doc quirk) |
| No position or sequence input on create or update, and no reorder endpoint for task lists. Responses expose `sequence.project_sequence` and `sequence.milestone_sequence` read-only. The module blurb says "reorder" but lists no such endpoint. | https://projects.zoho.com/api-docs/task_lists | READ | not documented (as a write) |
| Clone and template endpoints exist: `POST .../tasklists/clone`; `GET /api/v3/portal/[PORTAL_ID]/templates/tasklists`; `POST .../tasklists/[TASKLIST_ID]/make-as-template`. | https://projects.zoho.com/api-docs/task_lists/task_list_templates | READ | confirmed in docs |
| "A maximum of 5000 tasks can be added under a task list." The API has a matching error `MAXTASKSPERTASKLIST_REACHED` HTTP 403 "Maximum task limit per tasklist has been reached." | https://help.zoho.com/portal/en/kb/projects/tasks/task-list/task-lists-introduction/articles/create-task-lists , https://projects.zoho.com/api-docs/tasks#tasks-create_task | READ-S / READ | confirmed in docs |
| A community post says the internal/external option is removed once a task list is tied to a phase (the phase's flag governs). | search snippet of help.zoho.com community | SEARCH | partly documented |

---

## 5. Create a task

**Endpoint**: `POST /api/v3/portal/[PORTAL_ID]/projects/[PROJECT_ID]/tasks`, scope `ZohoProjects.tasks.CREATE`. URL: https://projects.zoho.com/api-docs/tasks#tasks-create_task (READ, confirmed in docs).

| Field | Required? | Format / notes (exact where quoted) |
|---|---|---|
| `name` | **required** (the only one) | max length 10000. Error if missing: `MANDATORY_PARAMETER_MISSING` 400, `field_name: name` |
| `tasklist.id` | optional | falls back to the General task list (see section 1) |
| `milestone.id` | optional | |
| `parental_info.parent_task_id` | optional | makes the task a subtask |
| `description` | optional | max length 80000 |
| `status.id` | optional | "if not provided default open will be taken" |
| `priority` | optional | "none,low,medium,high" |
| `start_date`, `end_date` | optional | ISO 8601 date-time: "Use yyyy-MM-dd'T'HH:mm:ss'Z' for UTC or yyyy-MM-dd'T'HH:mm:ss[+|-]HH:mm". Note: projects and phases use plain `YYYY-MM-DD`; tasks use date-time |
| `duration` | optional | `{value, type}`, both required if sent; type "days,hours" |
| `owners_and_work.owners[]` | optional | each owner identified by `zpuid` ("Get Project Users API (the "id" field in the response)"), or `zuid`, or `email`; optional `work_values` |
| `owners_and_work.work_type` | optional | "flexible,standard" |
| `owners_and_work.unit` | optional | "For standard: hours, hours_per_day, %_per_day. For flexible: hours, %." |
| `owners_and_work.owners[].work_values` | optional | "Standard: a string, HH:MM for hours or hours_per_day, or 0 to 100 for %_per_day or %. Flexible: a JSON array of objects, each with day ... or date (YYYY-MM-DD), and value" |
| `owners_and_work.copy_task_duration` | optional | "true,false" |
| `completion_percentage` | optional | int |
| `billing_type` | optional | "none,billable,non_billable" |
| `teams` | optional | add/remove team IDs ("Add or remove teams associated with the task") |
| `tags`, `attachments`, `recurrence`, `reminder`, `budget_info`, `start_after` | optional | |
| `<field_name>` | optional | task custom field by API name |

| Fact | URL | Source | Confidence |
|---|---|---|---|
| A task with no dates and no owner is consistent with the docs. Only `name` is required, and the published sample response shows exactly such a task: owner `"name": "Unassigned User"`, `"total_work": "00:00"`, `"duration": {"value": "0"}`, no start/end date, task list `"General"`, milestone `"None"`. | above | READ | confirmed in docs (sample), server behaviour untested |
| Planned effort is `owners_and_work` (per-owner `work_values`, e.g. `"08:00"`); the response returns `total_work`. Work is attached to an owner entry; how to store planned hours on a task with no owner is not explained. | above | READ | partly documented |
| The exact JSON shape of `owners` on create is unclear: the table nests `add`/`remove` arrays and also direct `zpuid`/`zuid`/`email`; the sample shows `zpuid` as an array while the table says String. | above | READ | contradictory |
| Help: "If work hours are not set then the task duration is taken as the total work." | search snippet of a Zoho community article | SEARCH | partly documented |
| An unconfirmed (invited, not yet accepted) user cannot be an owner: `INVALID_OWNER` 400 "The mentioned user is not a confirmed user of the portal." (shown on Update Task). | https://projects.zoho.com/api-docs/tasks#tasks-update_task | READ | confirmed in docs for update; INFERRED for create |
| Other documented create errors: `INVALID_DATE_RANGE` "End date cannot be earlier than the start date."; `INVALID_DURATION` "Please enter a valid duration."; `INVALID_TASKLIST` "Mentioned tasklist is not in the project"; `INVALID_CUSTOM_FIELD` "The mentioned parameter is not available in the picklist." | https://projects.zoho.com/api-docs/tasks#tasks-create_task | READ | confirmed in docs |
| Custom fields: "Custom field API names are currently supported only in the Tasks and Projects APIs." Field metadata: `GET /api/v3/portal/[PORTAL_ID]/settings/fields`, scope `ZohoProjects.custom_fields.READ`. Fields can be created with `PUT /api/v3/portal/[PORTAL_ID]/settings/fields`, scope `ZohoProjects.custom_fields.CREATE`. | https://projects.zoho.com/api-docs (Custom Fields guide), https://projects.zoho.com/api-docs/module_meta/module_fields | READ | confirmed in docs |
| **Bulk create**: `POST /api/v3/portal/[PORTAL_ID]/projects/[PROJECT_ID]/bulk-tasks`, scope `ZohoProjects.tasks.CREATE`, body `tasks` JSONArray "array size : 0-100". Each item takes `name` (required), `tasklist`, `parental_info`, dates, duration, `owners_and_work`, etc. No `milestone` key is listed for bulk items. Success sample is `201 {"tasks":[...]}`. | https://projects.zoho.com/api-docs/tasks#tasks-create_multiple_tasks | READ | confirmed in docs |
| Bulk create publishes no error examples; partial-failure behaviour (all-or-nothing vs per-item) is not described. | same | READ | not documented |
| Bulk update: `PATCH /api/v3/portal/[PORTAL_ID]/bulk-tasks`: "A maximum of 100 tasks across 5 unique projects can be updated per request." | https://projects.zoho.com/api-docs/tasks#tasks-bulk_update_tasks | READ | confirmed in docs |

---

## 6. Subtasks

| Fact | URL | Source | Confidence |
|---|---|---|---|
| There is no separate subtask endpoint. A subtask is created with Create Task (or bulk-tasks) plus `parental_info.parent_task_id` ("Enter parent task details if sub task is need to be created"). | https://projects.zoho.com/api-docs/tasks#tasks-create_task | READ | confirmed in docs |
| Convert an existing task: `POST .../tasks/[TASK_ID]/make-as-subtask` (body `parent_id` **required**, optional `positional_info.previous_task_id` / `next_task_id`), scope `ZohoProjects.tasks.UPDATE`. Reverse: `POST .../tasks/[TASK_ID]/make-as-task`. | https://projects.zoho.com/api-docs/tasks#tasks-convert_to_subtask | READ | confirmed in docs |
| Depth limit: "A parent task can have up to 6 levels of subtasks"; "each subtask can have a subtask of its own and so on up to a limit of 6". The API response exposes `depth` (0 for a root task). | https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/subtasks | READ-S | confirmed in docs (help); the API docs state no limit and no error for exceeding it |
| "Subtasks are available in all our plans." Pricing table: Subtasks Yes on Free, Premium, Enterprise, Ultimate. | same; https://www.zoho.com/projects/pricing-comparison.html | READ-S / READ | confirmed in docs |
| Roll-up is not automatic. It is a per-project switch: "Work hours and log hours will roll up from Subtasks > Tasks"; "Start date, end date, % completion, and budget (if enabled) will roll up from Subtasks > Tasks > Milestone > Projects." It "cannot be disabled after enabling". Pricing table: Task Rollup is "-" on Free, Yes on Premium/Enterprise/Ultimate. | https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/task-roll-up , pricing-comparison | READ-S / READ | confirmed in docs |
| Roll-up can be set through the API at project creation with `is_rollup_project`. | https://projects.zoho.com/api-docs/projects#projects-create_project | READ | confirmed in docs |
| Roll-up restrictions (help): a dependent task cannot become a subtask; no dependency between a subtask and its parent; roll-up cannot be enabled if a parent task already has work or log hours, or if tasks were imported in bulk. | task-roll-up article above | READ-S (paraphrase) | confirmed in docs |
| Other rules: "Closing a parent task will close all its subtasks." "Subtasks cannot be created for closed tasks." | subtasks article above | READ-S | confirmed in docs |
| No documented cap on the number of subtasks per task (only the 5000 tasks per task list cap; whether subtasks count toward it is not stated). | | | not documented |

---

## 7. Dependencies

**Endpoint**: `POST /api/v3/portal/[PORTAL_ID]/projects/[PROJECT_ID]/tasks/dependency`. URL: https://projects.zoho.com/api-docs/tasks/task_dependency (READ, confirmed in docs).

| Field | Required? | Notes |
|---|---|---|
| `predecessor_task.id` | **required** | |
| `successor_task.id` | **required** | |
| `dependency_type` | optional | "Accepted values: FS, FF, SF, SS, AutoSet" |
| `link_type` | optional | "0 for Hard Link, 1 for Soft Link" |
| `lag` | optional | `{value, type}`; type "days, hrs". Sample response shows `"value": "1.5", "type": "hrs"` |

Sample body: `{"predecessor_task":{"id":"..."},"successor_task":{"id":"..."},"dependency_type":"FS","link_type":"0","lag":{"value":"2","type":"days"}}`. Update is `PATCH` and delete is `DELETE` on the same path with the same body.

| Fact | URL | Source | Confidence |
|---|---|---|---|
| The page lists the scope for add, update and delete dependency as `ZohoProjects.tasks.READ`. That is almost certainly a documentation error for a write call. | above | READ | contradictory (request `ZohoProjects.tasks.ALL` to be safe) |
| One link per call; no bulk dependency endpoint is published. | above | READ | confirmed in docs |
| Negative lag is lead: "If the lag value is negative, it is known as lead time." Lag in the UI can be days, hours, calendar days or clock hours; the API lists only `days, hrs`. | https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-dependencies/articles/manage-task-dependency | READ-S | partly documented (negative values via API untested) |
| Plan gating: Free "Within project (Finish-to-Start)"; Premium "Within project (All four types)"; Enterprise and Ultimate "Across projects (All four types)". | https://www.zoho.com/projects/pricing-comparison.html | READ | confirmed in docs |
| An older help article says same-project dependencies are Premium and Enterprise and cross-project is Enterprise only. | search snippet of https://help.zoho.com/portal/kb/articles/task-dependency | SEARCH | contradictory with the pricing table (which shows FS on Free) |
| Cross-project dependencies exist as a product feature (Enterprise/Ultimate), but the API path contains a single `[PROJECT_ID]` and the body has no project field, so creating one through the API is not described. | task_dependency page | READ + INFERRED | not documented |
| Whether both tasks need dates before a dependency is added. | | | not documented |
| Whether the API rejects a circular dependency, and with what error. The dependency page publishes no error examples at all. The old help page with a "#validations" section (zoho.com/projects/help/task-dependency.html) now returns 404. | | | not documented |
| With roll-up on, a dependency between a subtask and its parent is not allowed (help). | task-roll-up article | READ-S | confirmed in docs |
| Related read: `GET .../tasks/[TASK_ID]/blocking-waiting-tasks`, scope `ZohoProjects.tasks.READ`. | https://projects.zoho.com/api-docs/tasks/meta | READ | confirmed in docs |
| Closing is guarded: `CANNOT_CLOSE_TASK` 409 "Cannot close the task as there are dependent tasks that are not yet completed." | https://projects.zoho.com/api-docs/tasks#tasks-update_task | READ | confirmed in docs |

---

## 8. WBS-specific support

| Fact | URL | Source | Confidence |
|---|---|---|---|
| Zoho has a help article "Work Breakdown Structure in Zoho Projects" that maps WBS onto Phases > Task Lists > Tasks > Subtasks. It describes no dedicated WBS view and no WBS code or outline numbering. | https://help.zoho.com/portal/en/kb/projects/zoho-projects-overview/articles/work-breakdown-structure-in-zoho-projects | READ-S | confirmed in docs (that the article says nothing about codes); a native WBS code feature is not documented anywhere I found |
| Each task gets an auto-generated ID returned as `prefix`, e.g. `"prefix": "PC-T30"`. It is in responses only; there is no request field to set it. It is a flat running number per project, not a hierarchical code such as 1.2.3. | https://projects.zoho.com/api-docs/tasks#tasks-create_task | READ | confirmed in docs |
| The project prefix is editable in the UI and only the prefix (not the number) can change. | search snippet of Zoho community "Task and Project numbering" | SEARCH | partly documented |
| A WBS code can be stored in a task custom field (send `<field_name>` by API name), or as a prefix in the task name. Task custom fields are Enterprise and Ultimate only (265 fields). | Custom Fields guide in https://projects.zoho.com/api-docs ; pricing-comparison | READ | confirmed in docs |
| Task order can be set: `POST .../tasks/[TASK_ID]/reorder`, scope `ZohoProjects.tasks.UPDATE`, body one of `before`, `after`, or `position` ("first or last ... Applies only to top-level tasks; has no effect on subtasks"). One call per task. | https://projects.zoho.com/api-docs/tasks#tasks-reorder_tasks | READ | confirmed in docs |
| Subtask order can be set at conversion time with `positional_info` on make-as-subtask; no documented way to position a subtask created directly with `parental_info`. | https://projects.zoho.com/api-docs/tasks#tasks-convert_to_subtask | READ | partly documented |
| Phase order can be set on create/update with `position` (v3.1). | https://projects.zoho.com/api-docs/phases#phases-create_a_phase | READ | confirmed in docs |
| Task list order cannot be set through a documented call. | https://projects.zoho.com/api-docs/task_lists | READ | not documented |
| Whether tasks created in sequence keep creation order (response shows `"sequence": {"sequence": 30}`). | same | INFERRED | not documented |
| Move a task between task lists or phases: `POST .../tasks/[TASK_ID]/move` with `target_tasklist_id`, `target_milestone_id`. | https://projects.zoho.com/api-docs/tasks#tasks-move_task | READ | confirmed in docs |

---

## 9. Users and roles

| Fact | URL | Source | Confidence |
|---|---|---|---|
| Add an existing portal user to a project: `POST /api/v3/portal/[PORTAL_ID]/projects/[PROJECT_ID]/projectusers`, scope `ZohoProjects.users.CREATE`. `userdetails` (JSONArray, listed under Query Parameters) with `email_id`, `profile_id`, `role_id`, rates, and `notify` (boolean, "Specify Whether to notify users"). Described as "grant a portal user access to a project". | https://projects.zoho.com/api-docs/users/project_users#users-project_users-add_project_user | READ | confirmed in docs |
| Add a new user to the portal: `POST /api/v3/portal/[PORTAL_ID]/users`, scope `ZohoProjects.users.CREATE`: "Use this API to invite and grant access to a user within a portal." `userdetails` required; includes `email_template` ("based on this invitation mail will be sent"), `role_id`, `profile_id`, project assignment. So yes, this path sends an invitation, and it consumes a user licence. | https://projects.zoho.com/api-docs/users#users-add_user | READ | confirmed in docs |
| Whether `projectusers` with an email that is not yet a portal user sends an invitation, and whether `notify: false` fully suppresses mail. | | | not documented |
| List users for ID lookup: `GET /api/v3.1/portal/[PORTAL_ID]/projects/[PROJECT_ID]/users` and `GET /api/v3.1/portal/[PORTAL_ID]/users`, scope `ZohoProjects.users.READ`. Portal users accept `type`: "1 (Users), 2 (Client Users), 3 (Client Contacts), 6 (Resources)". | https://projects.zoho.com/api-docs/users | READ | confirmed in docs |
| Roles exist as an API module (create/get/update/delete role) but a task cannot be assigned to a role. Task owners are only `zpuid`/`zuid`/`email`. | https://projects.zoho.com/api-docs/roles , tasks page | READ | confirmed in docs (no role assignment field exists) |
| A task can be associated with a Team via `teams` on create/update (teams must first be associated to the project: `POST .../projects/[PROJECT_ID]/associate-teams`, scope `ZohoProjects.teams.CREATE`). Whether this counts as "assignment" for workload is not stated. Teams: Free "-", Premium 2, Enterprise/Ultimate Yes. | https://projects.zoho.com/api-docs/teams/project_teams , pricing-comparison | READ | partly documented |
| "Resources" are a non-user owner type: "Resources are equipment that are used in performing project activities." "Resources can be assigned to tasks along with users or instead of a user." "Timesheet cannot be logged for resources." Enterprise add-on; Ultimate includes 100. The docs present them as equipment/software, not as placeholder people. | https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/resources , pricing-comparison | READ-S / READ | confirmed in docs (existence); use as generic human placeholder is not documented |
| No endpoint to create a Resource is published, and the owner field for a resource in the task API is not described. | https://projects.zoho.com/api-docs/users | READ | not documented |
| An unowned task is shown as "Unassigned User" (zpuid present, zuid 0). That is the only documented "placeholder". | https://projects.zoho.com/api-docs/tasks#tasks-create_task | READ | confirmed in docs |

---

## 10. Plan gating

Source for every row unless noted: https://www.zoho.com/projects/pricing-comparison.html (READ, confirmed in docs). Plans today are Free, Premium, Enterprise and **Ultimate**.

| Capability | Free | Premium | Enterprise | Ultimate |
|---|---|---|---|---|
| Projects | 3 | Unlimited | Unlimited | Unlimited |
| Users | "Up to 5 users" (pricing page, READ-S) | per user | per user | per user |
| Subtasks | Yes | Yes | Yes | Yes |
| Task Dependency | Within project (Finish-to-Start) | Within project (All four types) | Across projects (All four types) | Across projects (All four types) |
| Task Duration (Hours/Days) | - | Yes | Yes | Yes |
| Task Rollup | - | Yes | Yes | Yes |
| Flexible work hours | - | - | Yes | Yes |
| Strict Project | - | Yes | Yes | Yes |
| Project Templates | - | 20 | 30 | 50 |
| Project Templates Gallery | Yes | Yes | Yes | Yes |
| Task Custom Fields | - | - | 265 | 265 |
| Project Custom Fields | - | - | 155 | 155 |
| Milestone Custom Fields | - | - | 215 | 215 |
| Custom Status (Project, Milestone, & Task) | Yes | Yes | Yes | Yes |
| Layouts (Project, Milestone, Task, ...) | View | Yes | Yes | Yes |
| Recurring Tasks | - | Yes | Yes | Yes |
| Critical Path | - | - | Yes | Yes |
| Baseline | - | - | 15 per project | 15 per project |
| Teams | - | 2 | Yes | Yes |
| Resources | - | - | add-on | 100 |
| Planned vs Actual Report | - | Project-specific | Across projects | Across projects |
| Workload Report | - | Project-specific | Across Projects | Across Projects |
| Business Hours & Weekends | - | 1 calendar | 3 | 20 |
| Timelogs and Timesheets | - | Yes | Yes | Yes |
| MCP Server (using Zoho MCP) | Yes | Yes | Yes | Yes |
| Sandbox | - | - | 1 | 10 |

Gaps and notes:

- **Phases/milestones and task lists** have no row of their own. They appear only inside other rows (Custom Status "Project, Milestone, & Task" is Yes on Free). INFERRED: available on all plans. Confidence: partly documented.
- **Planned work hours on a task** (standard `owners_and_work`) has no row. Only "Task Duration (Hours/Days)" (Premium and up) and "Flexible work hours" (Enterprise and up) are listed. What a Free portal does when the API sends `duration.type: "hours"` or `work_values` is not documented.
- **API access** has no row in the table, and no per-plan API allowance is published. The licence endpoint's sample response does show an "API Credits" counter (see section 11).
- Enabling API access is a Portal Owner permission per a help permissions table (SEARCH, https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/portal-owner-and-admin-permissions-22-1-2024).
- The plan of a portal can be read with `GET /api/v3/portal/[PORTAL_ID]/license`, scope `ZohoProjects.portals.READ`: "Only the portal owner can access this API." Not applicable to Sandbox portals. Response includes `plan.project_plan` (sample "Ultimate"). URL: https://projects.zoho.com/api-docs/payments (READ, confirmed in docs).

---

## 11. API limits

| Fact | URL | Source | Confidence |
|---|---|---|---|
| "Each API can be invoked up to 200 times within a 2-minute window." "The limit is applied per API endpoint." | https://projects.zoho.com/api-docs#api-limits | READ | confirmed in docs |
| On breach: "The specific API will be temporarily blocked for 10 minutes." "The restriction applies only to the API that exceeds the limit, not all APIs." | same | READ | confirmed in docs |
| Response headers: `RateLimit`, `RateLimit-Remaining`, `RateLimit-Window` (120), `RateLimit-Window-Unit` (seconds); `Retry-After` only after the limit is exceeded. | same | READ | confirmed in docs |
| Pagination: `page` and `per_page`; "Defaults to 100 if omitted. Supported values: 1-200." Responses carry `page_info.has_next_page`. | https://projects.zoho.com/api-docs#pagination | READ | confirmed in docs |
| Bulk create is capped at 100 tasks per call; bulk update at 100 tasks across 5 projects. | tasks page | READ | confirmed in docs |
| Concurrency limit. | | | not documented |
| Daily cap. None is stated for v3. The licence sample response shows `"credits": [{"name": "API Credits", "total": 111000, "used": 2546, "purchased": 1000}, ...]`, which implies a credit meter exists, but no page explains how credits are consumed or allotted per plan. | https://projects.zoho.com/api-docs/payments | READ | partly documented |
| Whether "per API endpoint" is counted per portal, per user or per OAuth client, and whether different project IDs on the same route share one counter. | | | not documented |
| Old v2 REST: "You can invoke or call an API for 100 times in a span of two minutes"; lock for 30 minutes. Notice: "This REST API will be deprecated soon." A Zoho community post extended v2 end of life to 30 June 2026 (already past). | https://www.zoho.com/projects/help/rest-api/zohoprojectsapi.html ; community post "Update on V2 API End-of-Life Timeline" | READ-S / SEARCH | confirmed in docs (v2 is not a safe target) |
| Scopes: the OAuth guide lists only `ZohoProjects.projects.READ`, `ZohoProjects.projects.ALL`, `ZohoProjects.tasks.ALL`, `ZohoProjects.timesheets.ALL`, while each endpoint page names granular scopes (`ZohoProjects.projects.CREATE`, `.milestones.CREATE`, `.tasklists.CREATE`, `.tasks.CREATE`, `.tasks.UPDATE`, `.users.READ`, `.users.CREATE`, `.custom_fields.READ`, `.portals.READ`, `.teams.CREATE`). | https://projects.zoho.com/api-docs#scopes and module pages | READ | partly documented (the scope guide is incomplete) |
| Data centres: US `https://projects.zoho.com`, EU `.zoho.eu`, IN `.zoho.in`, AU `.zoho.com.au`, JP `.zoho.jp`, CA `projects.zohocloud.ca`, CN `.zoho.com.cn`, SA `.zoho.sa`, UK `.zoho.uk`, UAE `.zoho.ae`, SG `.zoho.sg`. "Never hardcode a single region's URL." | https://projects.zoho.com/api-docs | READ | confirmed in docs |
| The doc pages offer "Copy OpenAPI Spec" / "Download YAML", so a machine-readable spec exists per page. | any api-docs page | READ | confirmed in docs |

**What this means for 100 to 300 tasks in one run** (INFERRED from the limits above):

- With `bulk-tasks`: 300 tasks is 3 calls per hierarchy level. Because a subtask needs its parent's ID, create level by level (roots, then level 1, and so on), so about 3 to 12 calls in total. Well inside the limit.
- Without bulk (one `POST /tasks` each, which is what the MCP exposes): 300 calls to one endpoint exceeds 200 per 2 minutes. Pace at no more than about 1.5 calls per second and watch `RateLimit-Remaining`, or expect a 10-minute block.
- Dependencies are one call per link with no bulk form; more than 200 links must be paced the same way.
- Reorder is one call per task.
- Keep each task list at or under 5000 tasks.

---

## 12. The official Zoho Projects MCP server

| Fact | URL | Source | Confidence |
|---|---|---|---|
| Zoho publishes a help article "Zoho Projects MCP Server". It exists at two URLs with the same content. | https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/developer-space/developer-space-folder/articles/zoho-projects-mcp ; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/zoho-projects-mcp | READ-S | confirmed in docs |
| Prerequisites: "An AI client that supports MCP server connections."; "An active portal in Zoho Projects."; MCP Access enabled; API Access enabled. | same | READ-S | confirmed in docs |
| Enable MCP Access: gear icon, "Navigate to Portal Configuration > AI Hub.", MCP Access tab, turn on. Enable API Access: Developer Space > API Access & Mobile Access, "Select the check box to enable access and click Update." | same | READ-S | confirmed in docs |
| Two modes. Direct Tools: "Loads all available Zoho Projects tools upfront." Progressive Tool Discovery: "Discovers and loads relevant tools based on the user's prompts dynamically." and it is "the recommended option for reducing context consumption". | same | READ-S | confirmed in docs |
| URLs (US): Direct `https://projects.zohomcp.com/mcp/message`; Progressive `https://zprojects.zohomcp.com/mcp/message`. Same pattern for EU, IN, AU, CA, SA, JP, AE, UK. | same | READ-S | confirmed in docs |
| No separate server needs to be built: the URL can be configured "without creating a separate MCP server through the Zoho MCP console." | same | READ-S | confirmed in docs |
| The marketing page still says "Create an MCP server at Zoho.com/mcp in a few clicks". | https://www.zoho.com/projects/mcp.html | READ-S | contradictory with the help article (older flow) |
| Stated capability: "create and update records, and manage project activities."; sample prompt "Create a task in Project "Zylker Constructions" with a due date of Friday."; and the article says it can "generate the full project structure using a project plan, from phases down to subtasks." | help article | READ-S (re-verify the last quote in a browser) | partly documented |
| **Zoho's help article publishes no tool list**, no tool count, no rate limit, no plan restriction, and does not say who may enable MCP Access. | help article | READ-S | not documented |
| Pricing table: "MCP Server (using Zoho MCP)" is Yes on Free, Premium, Enterprise, Ultimate. | https://www.zoho.com/projects/pricing-comparison.html | READ | confirmed in docs |
| Zoho MCP FAQ: "APIs accessed through MCP are subject to the default API limits of the service being used."; "As of now, Zoho MCP is free to use"; recommended ceiling "300 tools per MCP server", about 100 for best performance; Cursor allows no more than 40 tools. | https://help.zoho.com/portal/en/kb/mcp/help-support/articles/zoho-mcp-faq | READ-S | confirmed in docs (general Zoho MCP, not Projects-specific) |
| Claude setup: use the Zoho Projects connector from the directory; "Only a Claude organization admin can complete these steps." | help article | READ-S | confirmed in docs |
| The only published tool list I found is on Anthropic's connector directory (not a Zoho page): made by Zoho, "Anthropic verified", added March 2026, endpoint `https://claude-zohoprojects.zohomcp.com/mcp/message` (a third host, distinct from the two in Zoho's article), **30 tools**. | https://claude.com/marketplace/connectors/zoho-projects | READ (page HTML parsed) | partly documented (third-party listing of Zoho's connector) |

The 30 tools listed there:

- Portals: `getAllPortals`, `getPortalDetails`
- Projects: `getAllProjects`, `getProjectDetails`, `createProject`, `updateProject`, `trashProject`, `restoreProject`
- Task lists: `getTaskListsByPortal`, `getAllProjectTaskLists`, `getTaskListDetails`, `createTaskList`, `createDefaultTasklist`, `updateTaskList`
- Tasks: `getTasksByPortal`, `getTasksByProject`, `getTaskDetails`, `createTask`, `updateTask`
- Phases: `getPhases`, `getProjectPhases`, `getPhaseDetail`, `createPhase`, `updatePhase`
- Issues: `getAllPortalIssues`, `getProjectIssues`, `getMyIssues`, `getIssueDetails`, `createProjectIssue`, `updateIssue`

What that list does **not** contain: any dependency tool, any bulk-task tool, any dedicated subtask tool, any user or project-user tool (so no way to look up a `zpuid`), any reorder or move tool, any delete tool for tasks, task lists or phases, any custom-field metadata tool, any team tool.

Open points on the MCP (all not documented):

- Whether the Direct Tools and Progressive endpoints expose the same 30 tools or a larger set.
- The input schema of `createTask` (in particular whether it accepts `parental_info`, `owners_and_work`, custom fields) and of `createPhase` (v3 or v3.1 shape).
- Whether the tool names match the REST operation names one-to-one (they do look like the docs' operation names in camelCase: INFERRED).
- Tool descriptions and schemas can only be obtained by calling `tools/list` on the live server.

---

## (a) WBS element to Zoho object

| WBS element | Zoho object | Create call | Required fields (documented) | Confirmed? |
|---|---|---|---|---|
| Project (WBS level 0) | Project | `POST /api/v3/portal/{portal}/projects` (scope `ZohoProjects.projects.CREATE`); MCP `createProject` | `name` | Yes (docs). Free plan capped at 3 projects |
| Project from a template | Project | same call with `copy_from` = template or project ID | `name`, `copy_from` | Yes (docs); listing templates is not documented |
| Level 1: phase / stage / major deliverable | Phase (API: milestone) | `POST /api/v3.1/portal/{portal}/projects/{project}/phases` (scope `ZohoProjects.milestones.CREATE`); MCP `createPhase` | `name` only; dates, `owner.zpuid`, `flag` documented as optional | Partly. v2 required name, start, end, owner, flag. Needs a live test |
| Level 2: deliverable / work area | Task list | `POST /api/v3/portal/{portal}/projects/{project}/tasklists` (scope `ZohoProjects.tasklists.CREATE`); MCP `createTaskList` | `name`; link with `milestone.id` (optional) | Yes (docs) |
| Catch-all bucket | General task list | `POST .../default-tasklists`; MCP `createDefaultTasklist` | `flag` | Yes (docs) |
| Level 3: work package | Task | `POST /api/v3/portal/{portal}/projects/{project}/tasks` (scope `ZohoProjects.tasks.CREATE`); MCP `createTask` | `name`; `tasklist.id` optional (falls back to General, which must exist) | Yes (docs) |
| Many work packages at once | Tasks | `POST .../projects/{project}/bulk-tasks`, up to 100 per call | `tasks[].name` | Yes (docs); partial-failure behaviour undocumented; not in the MCP list |
| Levels 4 to 9: activities | Subtask (max 6 levels under a task) | same Create Task call with `parental_info.parent_task_id`; or `POST .../tasks/{id}/make-as-subtask` with `parent_id` | `name`, `parental_info.parent_task_id` | Yes (docs + help). Via MCP: unknown |
| Effort estimate | `owners_and_work` (`work_values`, `unit`, `work_type`) and/or `duration {value,type}` | fields on Create Task | none | Partly. Owner-less work hours and exact JSON shape need a test; hours duration is Premium and up |
| Dates | `start_date`, `end_date` | fields on Create Task (ISO date-time) / Phase (`YYYY-MM-DD`) | none | Yes (docs) |
| Responsible person | owner `zpuid` | `owners_and_work.owners[]` on task; `owner.zpuid` on phase/project | none | Yes for named, confirmed portal users. Role or placeholder: no |
| Predecessor / successor link | Task dependency | `POST /api/v3/portal/{portal}/projects/{project}/tasks/dependency` | `predecessor_task.id`, `successor_task.id` | Yes (docs) for same project. Plan-gated (Free = FS only). Scope listed oddly as tasks.READ. Not in the MCP list |
| WBS code (1.2.3) | none native | task custom field `<api_name>` (Enterprise and up) or a prefix in `name` | field must already exist in the layout | Workaround only |
| Sibling order | task sequence | `POST .../tasks/{id}/reorder` (`before` / `after` / `position`); phase `position` on create | one of the three | Yes for root tasks and phases; no for task lists; subtasks only via make-as-subtask |
| WBS dictionary text | `description` | field on task / project | none | Yes (docs) |

---

## (b) What a WBS-creating skill must NOT promise

1. **Native WBS codes or outline numbers.** Zoho only issues a flat auto ID (`PC-T30`), read-only. A code can live in the task name or in a custom field, and the custom field route needs Enterprise or Ultimate.
2. **More than 6 levels of subtasks under a task.** With phase and task list on top, the deepest representable WBS is project + 2 container levels + task + 6 subtask levels.
3. **Assigning work to a role, skill or generic placeholder person.** Owners are named portal users (or equipment-type Resources on Enterprise/Ultimate, whose API use is undocumented). The honest default for an unstaffed work package is an unassigned task.
4. **Assigning to people who are not yet confirmed portal users.** The API has an explicit error for that. Adding users invites them and uses licences; never do it silently.
5. **Dependencies through the MCP.** No dependency tool is listed for the official connector. Through REST they are one call per link.
6. **SS, FF, SF dependencies on a Free portal, or cross-project dependencies below Enterprise.** Also do not promise cross-project links via the API at all; the endpoint is scoped to one project and nothing documents it.
7. **That a cyclic dependency will be caught by Zoho.** Undocumented. The skill must validate the graph itself before sending.
8. **Automatic roll-up of hours and dates to parents.** It is a per-project switch, Premium and up, irreversible once on, and it restricts parent/subtask dependencies.
9. **Ordering of task lists.** No documented write. Task and phase order can be set; subtask order only partly.
10. **Setting "strict project" through the API.** It is response-only in the docs (and Premium and up).
11. **Phases without dates and owner**, until the live test passes. The v3.1 docs say only `name` is required, but v2 required five fields and the UI help tells users to set dates.
12. **Planned hours on tasks with no owner, hour-based durations on Free, flexible work hours below Enterprise.** Undocumented or plan-gated.
13. **Atomic creation or rollback.** There is no transaction. A run that fails midway leaves a partial structure; the docs describe no all-or-nothing mode for `bulk-tasks`. Cleanup of tasks, task lists and phases is not possible through the listed MCP tools (only `trashProject`).
14. **Creating 200+ tasks or links instantly without bulk.** One endpoint allows 200 calls per 2 minutes, then blocks for 10 minutes.
15. **More than 3 projects on Free, or more than 5000 tasks in one task list.**
16. **A specific MCP tool surface beyond the 30 names on the Claude directory page**, or any particular input schema for those tools. Zoho's own article publishes none.
17. **User lookup through the MCP.** No user tool is listed, so resolving a person's name to a `zpuid` through the MCP alone is not shown to be possible.
18. **Custom fields on phases or task lists via the API.** The docs say custom field API names work only in the Tasks and Projects APIs.
19. **The v2 `/restapi/` API or the `projectsapi.zoho.com` host for v3.** v2 is past its announced end of life, and that host is not in the v3 docs.

---

## (c) Live tests to run against a test portal

Run these on a throwaway project; record the plan of the portal for each result.

**Basics**

1. Host: does `https://projectsapi.zoho.com/api/v3/portal/{id}/projects` answer the same as `https://projects.zoho.com/api/v3/...`?
2. Scopes: does a token with only `ZohoProjects.tasks.READ` succeed on `POST .../tasks/dependency`? Which granular scopes are really needed for each create call?
3. `GET /license`: read the plan and the "API Credits" counter before and after a batch of calls, to learn whether calls consume credits.

**Phase**

4. Create a phase with `name` only on v3.1. Then name + dates without owner; name + owner without dates. Record defaults (owner, flag, dates).
5. Is `flag` case-sensitive (`internal` vs `Internal`)?
6. Does `position.known_position: "last"` and `after_id` order phases as expected?

**Task list**

7. Create a task list without `milestone`, then with it. Confirm the internal/external flag behaviour when linked to a phase.
8. Create several task lists and read back `sequence` to see whether creation order is preserved.

**Task**

9. Create a task with `name` only in a brand-new project. Does a General task list already exist, or is `default-tasklists` needed first?
10. Create a task with `tasklist.id` only (no dates, no owner). Confirm the "Unassigned User" result.
11. Find the working `owners_and_work` shape: try `{"owners":[{"zpuid":"..","work_values":"16:00"}],"work_type":"standard","unit":"hours"}` and the `add` form. Try `email` as the identifier.
12. Planned hours with no owner: send `owners_and_work` with `work_values` but no owner; send only `duration {value:"16", type:"hours"}`. Read back `total_work`.
13. `duration.type: "hours"` on a Free portal: accepted, ignored or rejected?
14. Dates as plain `YYYY-MM-DD` versus full ISO date-time on tasks. Dates outside the phase or project range, and on a strict project.
15. Assign a user who is in the portal but not in the project; assign an invited but unconfirmed user. Record the errors.
16. Set a task custom field (WBS code) by API name on Enterprise; observe the error on Free/Premium.

**Subtasks**

17. Create a chain of subtasks with `parental_info` until it fails; confirm the limit (6) and capture the error.
18. Subtask with a different `tasklist.id` from its parent: accepted or forced to the parent's list?
19. Order of subtasks created in sequence; does `reorder` with `before`/`after` work on subtasks?
20. With `is_rollup_project: true`, check that parent work hours and dates equal the sum/span of subtasks, and whether the API rejects work hours on a parent.

**Bulk**

21. `bulk-tasks` with 100 items, then 101. Then one invalid item among valid ones: all rejected or partial success, and what does the response look like?
22. Can a parent and its child be sent in the same bulk call (no), and does bulk accept `parental_info` for existing parents?
23. Is the response order the same as the request order (needed to map WBS nodes to returned IDs)?

**Dependencies**

24. Create FS, SS, FF, SF with lag in days and hrs, and a negative lag, on Premium and on Free.
25. Dependency between two tasks with no dates: accepted? What dates does Zoho assign (hard link)?
26. Circular: A to B then B to A; and A to B to C to A. Capture status code and message.
27. Parent to its own subtask, with roll-up on and off.
28. Tasks in two different projects on Enterprise.
29. Duplicate link (same pair twice).

**Order and limits**

30. `reorder` with `position: "first"`, `before`, `after` across 20 tasks; confirm the final order through `GET .../tasks`.
31. Fire 210 `POST /tasks` calls in under 2 minutes on a scratch project: confirm the block, the `Retry-After` value, and whether the counter is per portal, per user or per OAuth client, and whether different project IDs share it.
32. Concurrency: 5 parallel creates into one task list; check for errors and sequence collisions.

**Users**

33. `POST .../projectusers` with `notify: false` for an existing portal user: is any mail sent? With an email not in the portal: error or invitation?

**MCP**

34. Call `tools/list` on `https://projects.zohomcp.com/mcp/message`, `https://zprojects.zohomcp.com/mcp/message` and the Claude connector endpoint. Save names and input schemas; compare with the 30 on the directory page.
35. Through `createTask`: pass `parental_info`, `owners_and_work`, dates and a custom field; see which are accepted.
36. Through `createPhase`: name only.
37. Confirm that with MCP Access off (AI Hub) or API Access off, calls fail, and with which message.
38. Check whether MCP calls count against the same 200 per 2 minutes per-endpoint limit.

---

## Source list

- V3 API docs (parsed directly): https://projects.zoho.com/api-docs , /api-docs/projects , /api-docs/phases , /api-docs/task_lists , /api-docs/task_lists/task_list_templates , /api-docs/tasks , /api-docs/tasks/task_dependency , /api-docs/tasks/meta , /api-docs/tasks/baseline , /api-docs/users , /api-docs/users/project_users , /api-docs/teams/project_teams , /api-docs/module_meta/module_fields , /api-docs/payments , /api-docs/roles
- Plan comparison (parsed directly): https://www.zoho.com/projects/pricing-comparison.html ; pricing page https://www.zoho.com/projects/zohoprojects-pricing.html
- Help centre (via summarising fetch): work-breakdown-structure-in-zoho-projects, phase-list-view, project-phases, phases FAQ (milestones-7-2-2024), create-task-lists, subtasks, task-roll-up, manage-task-dependency, resources, zoho-projects-mcp (two URLs), Zoho MCP FAQ
- Old REST docs (via summarising fetch): https://www.zoho.com/projects/help/rest-api/zohoprojectsapi.html , https://www.zoho.com/projects/help/rest-api/milestones-api.html
- MCP: https://www.zoho.com/mcp/ , https://www.zoho.com/projects/mcp.html , https://claude.com/marketplace/connectors/zoho-projects (Anthropic's directory, not a Zoho page)
- Pages that would not load: https://www.zoho.com/projects/help/task-dependency.html (404), https://help.zoho.com/portal/en/kb/mcp/mcp-tool-manual and its "zoho-mcp-tool-guide" article (404)
