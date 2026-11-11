# Live tests against the test portal

Run on 11 November 2026 through the Zoho Projects REST API (v3 and v3.1), using a Self Client under the
test account, on a test portal whose plan the API reports as "CRMPlus". Everything was created
inside two throwaway projects, which were moved to trash afterwards; the five existing projects were not
touched.

These results are for the **REST API**. What the Zoho connector exposes to an agent is still untested.

| # | Test | Result |
|---|---|---|
| 1 | Create a project with a name only | Works. Owner defaults to the caller |
| 2 | Create a phase with a name only (v3.1 and v3) | Works on both. **Zoho sets start and end date to the creation date** and the owner to "Unassigned User" |
| 3 | Create a task list with a name only; and linked to a phase | Both work. Link is `milestone.id` |
| 4 | Create a task with a name only | Works. Unassigned, no dates, no hours |
| 5 | Task with no task list | Works. Zoho creates and uses a "General" task list |
| 6 | Hours as `duration {value:"24", type:"hours"}` | Refused: "Enter a valid hour format." The value must be `"24:00"` |
| 7 | Hours as `duration {value:"24:00", type:"hours"}`, no owner | Works. Total work 24:00, no dates, no owner |
| 8 | Hours as `owners_and_work` with no owner entry | Refused: invalid `owners` |
| 9 | Hours as `owners_and_work` on the "Unassigned User" id, `copy_task_duration: false` | **Works.** Total work 24:00, duration stays 0. This stores an estimate without implying a duration |
| 10 | Hours with a named owner | Works with `copy_task_duration: false`. With the default (`true`) and no duration, total work stays 00:00 |
| 11 | Subtasks nested under a task | Levels 1 to 6 work. Level 7 is refused: "Tasks can contain a maximum of 6 levels of subtasks." |
| 12 | Parent's hours with roll-up off | Parent stays at 00:00; children's hours are not added up |
| 13 | Project created with `is_rollup_project: true` | Works. Parent shows the sum of its subtasks (4:00 + 6:30 = 10:30) |
| 14 | Set hours on a parent in a roll-up project | Refused: "This field is updated automatically based on the subtask(s)." |
| 15 | Tasks created one after another | Listed in creation order |
| 16 | Finish-to-start dependency between two undated tasks | Works |
| 17 | Dependency loop, direct and indirect | **Refused, but with HTTP 200.** The body carries `"ERROR": true` and "Oops! These Tasks are already connected." A caller that checks only the status code would read it as success |
| 18 | The same dependency twice | Accepted without error |
| 19 | Dependency from a task to its own subtask (roll-up off) | Accepted |
| 20 | Start-to-start, finish-to-finish, start-to-finish | All accepted on this plan |
| 21 | Bulk create of three tasks, one without a name | Whole call refused (HTTP 400). Nothing was created |
| 22 | Bulk create including a subtask | Works |
| 23 | Trash a project | Works (HTTP 204); the project leaves the active list |
| 24 | API address | Both `projects.zoho.com` and `projectsapi.zoho.com` serve v3 |
| 25 | Dependency calls with the `tasks.ALL` scope | Work |

The "Unassigned User" id is returned on any unassigned task, so a caller can read it from the first task
it creates.

Still untested: everything through the connector; a portal on the Free or Premium plan; whether the
parent-to-subtask dependency is refused when roll-up is on; rate-limit behaviour at volume.

## Second run: the engine's own plan, created end to end

The same day, the creation plan produced by `engine/wbs.js` was executed against the portal in the order
the skill prescribes (project, phases, task lists, tasks by level, dependencies, read back).

| Project left in the portal as test data | Mapping | Created | Read back |
|---|---|---|---|
| PM Skills test — Office building (WBS by phase) | Phases, task lists, tasks | 10 phases, 29 task lists, 57 tasks, 9 dependencies | Matches |
| PM Skills test — CRM rollout (WBS by task list) | Task lists and tasks, roll-up on | 10 task lists, 28 tasks, 40 subtasks, 7 dependencies | Matches; parents show the sum of their subtasks |
| PM Skills test — Client delivery (capacity) | For the cost and capacity skill | 5 task lists, 12 dated tasks with planned hours | Matches |

- Tasks were assigned only where the named person was a member of the new project. Only the portal
  owner was, so the rest were left unassigned with the intended owner in the description. Adding the
  portal's second user to a project needs a scope this test did not have.
- Bulk creation carried descriptions, planned hours and parent links in one call per level.
- The workload report accepts dates only as `yyyyMMdd` (for example `20261115`). It returns `owners[]`
  with `work.overall_allocation`, and a person with nothing assigned comes back as `free`.

Not created: time logs and cost rates, which the cost and capacity skill needs for measured findings.
The access used for these tests cannot write rates, and time logs were not attempted.
