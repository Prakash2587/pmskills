# WBS in practice: what goes wrong and what practitioners want

Web research, 11 Nov 2026. No project files were modified.

## Read this first: limits of the evidence

- **Reddit could not be read.** reddit.com and old.reddit.com are blocked for both search and fetch. I saw exactly one r/projectmanagement thread, through a third-party snapshot site. It is marked secondhand.
- **Project Management Stack Exchange, projectmanagement.com and pmi.org could not be fetched** (blocked or HTTP 403). Anything from them is search-snippet only.
- **Smartsheet and Atlassian community threads returned only the page title** (content is loaded by script). Their content is search-snippet only.
- **Zoho community threads returned only the original post**, with no dates, replies or staff answers. Some are old, so current product behaviour may differ.
- **Almost no verbatim quotes.** My operating rules limit me to one short verbatim quote per response, so the brief's "1-2 quotes per finding" is not met. Every finding is a close paraphrase with a URL and a tag, so exact wording can be pulled from the page.
- **Tags:** [FH] = I fetched the page and read it (through a fetch tool that summarises pages, so spot-check wording before reuse). [SH] = seen only in a search snippet or aggregator.
- **Source counts are "independent sources I saw"**, not prevalence in the field. Many are vendor or consultant blogs, not forum discussion.

---

## 1. Common real-world WBS mistakes, ranked by recurrence

### 1.1 Wrong level of detail (too deep or too shallow): 8 sources
- Ten Six (scheduling consultancy) says too many levels leaves you with a work package for every review meeting, and too few makes the work impossible to estimate. [FH] https://tensix.com/5-wbs-problems-and-how-to-fix-them/
- Rock.so says most teams over-decompose; it puts the sweet spot at three levels and 30-60 work packages, with four as the ceiling. [FH] https://www.rock.so/blog/work-breakdown-structure
- Zalando's head of program management suggests three to five levels at most. [FH] https://pmo.zalando.com/posts/2024/11/wbs-in-the-age-of-agile.html
- Planning Planet posters call level 10 excessive. Dennis Hanks says to go only as deep as you need to collect cost data. [FH] https://projectcontrols.com/comment/22429 and https://projectcontrols.com/comment/80315
- An Asana consultant complains that clients create endless subtasks on simple projects; he rarely needs more than three levels. [FH] https://forum.asana.com/t/limit-sub-task-depth/8510
- SmartPM says it is easy to go overboard with detail. [FH] https://smartpm.com/blog/construction-work-breakdown-structure
- A Japanese PMO consultant says AI drafts are either too detailed to maintain or too coarse to catch reviews and approvals. [FH] https://note.com/yuro1969/n/n72dbc2681df6?hl=en

### 1.2 Activity or to-do list passed off as a WBS: 7 sources for, 3 dissenting
- For: SmartPM calls treating the WBS like a to-do list a common trap [FH]. Bright Hub (Ann Gordon) lists it as a pitfall [FH] https://www.brighthubpm.com/project-planning/2979-work-breakdown-structure-pitfalls-to-avoid/. Rock.so ranks tasks-instead-of-deliverables first [FH]. Riz Tabley says each element should be a deliverable [FH] https://rtabley.substack.com/p/an-under-utilised-but-effective-tool. PMI's blog calls it the most common mistake [SH] https://www.pmi.org/blog/work-breakdown-structure.
- **Dissent, and it matters:**
  - Ten Six lists the opposite as a problem: elements named as deliverables rather than tasks are harder to schedule. [FH]
  - On Planning Planet, Rafael Davila says the WBS should be activity-oriented and that PMI's deliverable-oriented guidance is wrong. [FH] https://projectcontrols.com/comment/55482
  - Wikipedia's talk page shows the same split between deliverable-first and verb-first editors. [FH] https://en.wikipedia.org/wiki/Talk:Work_breakdown_structure
- Reading: "nouns, not verbs" is contested dogma among schedulers, not settled practice.

### 1.3 Scope that is missing and surfaces later: 7 sources
- Rand Group (ERP implementer) lists what gets underestimated: business users' time, data preparation started too late, testing treated as a final check, training treated as a one-off, and post-go-live stabilisation. [FH] https://www.randgroup.com/insights/services/solution-implementation/erp-implementation-methodology-phases-deliverables-roles-and-governance/
- The Japanese PMO consultant says approval points and completion criteria are routinely missing. [FH]
- A Hacker News developer says he plans three or four tasks and always ends with twelve because of missed details. [FH] https://news.ycombinator.com/item?id=39439193
- Zalando: an activity that appears during execution and is not in the WBS is probably scope creep. [FH]
- Ten Six lists closure, handover, steering meetings and compliance work as commonly missed [SH] https://tensix.com/6-extras-to-include-in-your-project-schedule/. Two further guides say training, documentation and deployment support are undercounted [SH].
- **Forgotten project-management or integration work specifically: weak evidence.** I found advice to add a PM branch [SH], but no practitioner account of it being forgotten.

### 1.4 WBS confused with the schedule; phases versus deliverables at level 1: 6 sources
- The r/projectmanagement thread "Phase-based or Delivery-based WBS?" has seven commenters and no consensus. [SH, via aggregator] https://reddit.sentinel-team.org/posts/1swz5zy/snapshots/2026-04-28T19%3A38%3A40.8294Z
  - Phases only work where governance forces them to be distinct and sequential.
  - IT leans to deliverables at level 1 because work runs in parallel, with phase kept as a tag or column.
  - One commenter asks for both: tag each task with phase, deliverable and cost centre.
- Ten Six: do not let the team discuss sequencing during the WBS session. [FH]
- Tabley: a phase-only WBS is simplistic and of limited value. [FH]

### 1.5 Built by the PM alone, or by people who do not understand the work: 6 sources
- Bright Hub (two authors) says the WBS should be drafted with the whole team. [FH] https://www.brighthubpm.com/project-planning/74986-ten-wbs-tips-for-a-smoother-planning-process/
- Ten Six warns that a couple of strong voices can dominate the session. [FH]
- Hacker News: a manager cannot build a WBS for work they do not understand. [FH] https://news.ycombinator.com/item?id=37775461

### 1.6 Never updated, or maintained twice in different tools: 3 sources
- Rock.so lists both re-creating the WBS in several tools and treating it as a kickoff artefact. [FH]
- SmartPM says a WBS not updated after design changes goes stale. [FH]
- An Atlassian thread title asks for WBS and Gantt in Jira and Confluence without maintaining them twice. [title only] https://community.atlassian.com/forums/discussion/3315308/wbs-and-gantt-chart-with-jira-and-confluence-without-maintaining-them-twice

### 1.7 No dictionary or no definition of done: 3-4 sources
- Bright Hub lists the missing dictionary as a pitfall. [FH]
- The Japanese consultant argues WBS quality comes from the definition of completion, not the item count. [FH]
- Rand Group wants an owner, reviewer, acceptance criteria and approver per deliverable. [FH]
- I found no forum evidence either way on whether practitioners actually keep a dictionary.

### 1.8 Mirrors the org chart: 3 sources, 1 dissent
- Bright Hub (Nayab) says many managers organise by inputs, resources or org structure [FH]. PMI's blog says the same [SH].
- SmartPM presents team-based as a legitimate WBS type [FH].

### 1.9 WBS as billing-code bureaucracy: 2 sources
- Hacker News commenters describe the WBS as a long charge number that changes per project, and as the billing code at a large consultancy. [FH] https://news.ycombinator.com/item?id=32751115 and https://news.ycombinator.com/item?id=50110202

---

## 2. What people want from a WBS tool or template

- **Outline numbering (1, 1.1, 1.1.1) that renumbers on move:** the most repeated ask, 5 sources.
  - ClickUp request from Dec 2020, 26 votes, still receiving comments in 2026; users also want to sort by it and reference dependencies by number. [FH] https://feedback.clickup.com/feature-requests/p/wbs-numbering-column
  - Asana request from 2020. [FH] https://forum.asana.com/t/display-work-breakdown-structure-wbs-in-asana/102252
  - Smartsheet has no built-in WBS code; users build formula workarounds, and one wants codes that stay fixed after a deletion. [SH] https://community.smartsheet.com/discussion/77827/work-breakdown-structure-wbs-column-formula-configuration/p3 and [FH] https://cloudsmart.jp/en/smartsheet/templates/ms-project-like-wbs-template/
- **Roll-up of hours from children to parents.** ClickUp's request drew 481 votes before it shipped [FH] https://feedback.clickup.com/feature-requests/p/cumulative-rollup-time-estimates. Zoho users ask for the same (section 3).
- **A ready template, and a tree view.** An Asana user asks whether a WBS template exists; the answer points to Timeline, Gantt or Miro [FH]. Another reply advises sketching the structure visually before building it [FH] https://forum.asana.com/t/work-breakdown-structures/52117.
- **Getting an Excel or MS Project plan in without losing hierarchy, milestones and dependencies.** Four Zoho threads (section 3).
- **Who asks.** In what I could read: construction and engineering schedulers, IT and software teams, ERP and CRM implementers, plus a marketing manager and a mobile-app builder confused by Zoho's hierarchy. I could not rank industries by volume.
- **Frustrations with AI-generated WBSs:** 4 sources, thin on first-person accounts.
  - Output looks organised but is generic: design, develop, test. Items have no completion criteria and no approval points. The model silently invents owners, dates and effort. [FH] https://note.com/yuro1969/n/n72dbc2681df6?hl=en
  - Invented durations slip into the baseline unchecked. [FH] https://coursiv.io/blog/chatgpt-for-project-management
  - Microsoft says its Copilot WBS creates no assignees, dependencies or checklists and is a head start, like a template. [FH] https://learn.microsoft.com/en-us/dynamics365/project-operations/responsible-ai/copilot-for-project-faq
  - A pro-AI practitioner still budgets 30 minutes to verify the output and has the model flag gaps. [FH] https://theaipoweredprojectmanager.substack.com/p/i-built-a-wbs-in-30-minutes-and-my
  - I found no documented case of hallucinated tasks.

---

## 3. Friction moving a WBS into a PM tool

### General
- A Hacker News commenter puts the core mismatch in one line: "Issues are flat. Work breaks down into a tree." He adds that epic, ticket and checklist are not enough depth. [FH] https://news.ycombinator.com/item?id=28259667
- **Jira:** community answers map level 1 to epic, level 2 to story or task, level 3 to sub-task. Only one sub-task level exists natively; more levels need Premium or a marketplace app. [SH] https://community.atlassian.com/t5/Jira-questions/Create-multiple-level-subtasks-for-Work-Breakdown-Structure-WBS/qaq-p/1807460
- **Asana:** sections for top branches, custom fields for stage, subtasks for the rest, and an add-on to total effort. [FH]
- **Subtask depth:** vendor documentation and users disagree on Asana (5 or 6) and ClickUp (3 by default, 7 if enabled). [SH]

### Zoho Projects
- **Hierarchy:** phase (formerly milestone), then task list, then task, then subtask. Zoho's own WBS example is construction, with Pre-Construction, Design and Procurement as phases. [FH] https://help.zoho.com/portal/en/kb/projects/zoho-projects-overview/articles/work-breakdown-structure-in-zoho-projects
- **Subtasks:** up to 6 levels under a parent task. [FH] https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/subtasks
- **Import:** MPP, MPX, XLS, CSV and JSON; 5,000 tasks per import; administrator only. [FH] https://help.zoho.com/portal/kb/articles/import-tasks
  - Subtasks are linked through PARENT TASK ID and PARENT TASK NAME columns. [FH] https://help.zoho.com/portal/en/community/topic/tip-48-importing-subtasks-and-setting-dependencies-in-xls-csv-and-json-files
  - Dependencies use a Predecessor column: task ID, then type (FS, SS, SF, FF), then optional lag or lead. The default is FS.
  - To add to an existing task list you must give the task list ID, not its name.
  - Text fields are truncated at 255 characters.
  - The import page does not mention phases or a WBS-code column.
- **Roll-up restrictions.** [FH] https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/task-roll-up
  - Premium and Enterprise plans only.
  - Cannot be switched off once enabled, and can only be enabled on new projects.
  - Cannot be enabled if tasks were imported in bulk, if a parent already carries work hours, or if a subtask has a dependency on its parent.
  - A task that has a dependency cannot be made a subtask.
- **User complaints** (original posts only, undated):
  - An MS Project import lost dependencies, milestones and the WBS. [FH] https://help.zoho.com/portal/en/community/topic/ms-project-import-task-dependencies-milestones-and-wbs-not-imported
  - Imported tasks cannot be associated with milestones. [FH] https://help.zoho.com/portal/en/community/topic/milestones-from-imported-ms-project
  - Imported milestones are not recognised. [FH] https://help.zoho.com/portal/en-gb/community/topic/importing-from-msproject-milestones-are-not-recognised
  - A spreadsheet import cannot link a milestone to a task list, which the poster calls tedious. [FH] https://help.zoho.com/portal/en/community/topic/importing-tasks-9-2-2016
  - Subtask durations are not totalled into the parent, which makes bottom-up planning hard. [FH] https://help.zoho.com/portal/en/community/topic/subtask-durations-should-be-totaled-in-parent-task
  - One request asks for task lists inside task lists. [FH] https://help.zoho.com/portal/en/community/topic/task-list-within-a-task-list-for-task-hierarchy
  - Three posters cannot tell milestones from task lists. One has two apps sharing about 40% of their tasks and cannot decide the split. [FH] https://help.zoho.com/portal/en/community/topic/how-to-use-milestones-and-task-lists-effectively and https://help.zoho.com/portal/en/community/topic/milestones-and-task-lists
- I found no Zoho outline-numbering feature or request; task IDs are flat sequence numbers. [SH]

---

## 4. Construction practice

- **Area first, then CSI division, is the most-described hybrid.** On Planning Planet, Rafael Davila's most-used structure is project, then area, then CSI division. He says the two can be swapped and that he still needs both. [FH] https://projectcontrols.com/comment/55482
- **The main argument is WBS versus cost breakdown.** In the same thread:
  - Se de Leon says not to force the WBS into CSI format and to put CSI on cost accounts and resources instead.
  - Davila replies that cost accounts are assigned to activities, not structurally related to them.
  - Vladimir Liberzon recommends several parallel breakdowns (by process, responsibility, cost account) instead of one hierarchy.
  - Posters also disagree on whether to build the WBS or the activity list first.
- **Location over deliverable.** Jason Schroeder, a former field operations director, argues construction needs a location breakdown (phase, zone, micro-zone) to support takt and pull planning. He exempts design, procurement and permitting. [FH] https://theleanbuilder.com/construction-scheduling-how-we-build-how-we-schedule/
- **Schedule levels.** Planners describe the contractor's level-3 programme as detailed to floor, area, zone, trade or system. [FH] https://projectcontrols.com/comment/22429
- **Small and medium contractors.** This is vendor advice, not forum evidence.
  - Projul says most are better off with their own code list than MasterFormat, starting at 15-25 codes; 75 codes produces bad data. [FH] https://projul.com/blog/construction-cost-codes-guide/
  - A typical small trade layout is General Conditions, Rough-In, Trim, Closeout, with labour, material, subcontract and equipment under each. [SH] https://www.fieldpromax.com/blog/job-costing-for-small-commercial-contractors-phases-and-margin
  - A general contractor who subcontracts a whole trade needs one code for it. [SH]

---

## 5. Software and IT rollout practice

- **Implementation consultants structure by phase, with parallel workstreams.**
  - Rand Group uses Envision and Design, Build, Test, Deploy, User Adoption, with functional, technical, data and change/training teams. [FH]
  - Other consultant blogs show a seven-phase variant: discovery, fit-gap, configuration, data migration, integrations and testing, training and cutover, hypercare. They stress that data migration and training run alongside the build. [SH]
- **Typical top-level branches seen:** project management and governance; discovery and requirements; configuration; data migration; integrations; reports; security and roles; testing and UAT; training and change; cutover; hypercare.
- **Where agile teams reject WBS.** All [FH] via the Hacker News API.
  - It suits building structures and fails when the goal is an outcome. https://news.ycombinator.com/item?id=39439193
  - Development is too chaotic for a checkbox tree; that commenter uses mind maps. Same thread.
  - It is just finer-grained guesses that make busywork for managers. https://news.ycombinator.com/item?id=5663246
  - Trouble starts when personal kanban is forced into a WBS to promise predictability upward. https://news.ycombinator.com/item?id=25595235
  - Government vendors swap the term for story points while the contract stays waterfall. https://news.ycombinator.com/item?id=28420125
- **Where they adapt it.**
  - Zalando breaks epics into themes, stories and tasks. [FH]
  - MPUG maps project, release, iteration, story, with the story as the work package. [FH] https://www.mpug.com/work-breakdown-structure-wbs-in-traditional-and-agile-life-cycles-with-ms-project
  - One Hacker News commenter keeps high-level items in a scheduling tool and the detail in the issue tracker. [FH]

---

## 6. Advice practitioners mock, and advice they value

**Mocked or disputed**
- Decomposition as a route to accurate estimates (HN: guesses at finer granularity).
- "Nouns only, never verbs" as a hard rule (Ten Six, Davila and Wikipedia editors dispute it).
- One correct level-1 structure. The Reddit thread's own conclusion is that any structure is wrong somewhere.
- The 8/80 rule presented as a PMBOK rule. Vendor blogs contradict each other on the attribution. [SH]
- WBS codes for trivial overhead such as email and reviews (HN).
- A WBS written by a manager for work they do not understand (HN).

**Valued**
- Go only as deep as you need to manage or collect cost (Hanks). [FH]
- A work package is a self-contained block with a deliverable; its size matters less (Patrick Weaver). [FH] https://projectcontrols.com/comment/80315
- Keep phase, deliverable and cost centre as tags instead of fighting over one hierarchy (Reddit [SH]; Liberzon [FH]).
- Prefer end points that are definite and hard to argue with (Reddit). [SH]
- Sketch the tree first; keep sequencing out of the session; make sure quiet people are heard (Asana forum, Ten Six). [FH]
- Define completion and the approver for each package (note.com, Rand Group). [FH]
- Use the WBS during delivery as a scope-creep test (Zalando). [FH]
- Cross-check bottom-up totals against a top-down estimate (QSM). [FH] https://www.qsm.com/node/346

---

## 7. Estimating at work-package level

- **The 8/80 rule is everywhere in vendor guides and AI prompts.** I found no forum evidence that practitioners apply it.
  - A Wikipedia editor notes it is repeated in many places with no detail behind it. [FH]
  - Bright Hub gives a conflicting range of one to eight weeks. [FH]
  - Practitioner-flavoured alternatives: size a package to finish within one reporting cycle [SH] https://dupple.com/blog/work-packages-in-project-management, or to the level where cost is collected (Hanks) [FH].
- **Padding.**
  - QSM calls padding a natural result of bottom-up estimating: an undisclosed reserve, where contingency is visible and approved by management. [FH]
  - A projectmanagement.com thread is split; one view is that PMs inflate because management always cuts their estimates. [SH] https://www.projectmanagement.com/discussion-topic/28674/padding--is-this-really-a--quot-professional-option-quot---
- **Hour estimates in templates.** I found no practitioner discussion of pre-filled hours in templates. The nearest evidence is the warning that AI-invented durations become the baseline (coursiv, note.com). [FH]
- **Tool gap.** Zoho users want durations and hours to total upward for bottom-up planning. [FH]

---

## (a) Top problems a WBS tool should solve, ranked

1. Picking the right depth per branch and stopping there.
2. Catching missing scope before commit: data, testing, training, approvals, handover, hypercare and management work.
3. Separating structure from sequence, while still producing something schedulable.
4. Carrying the tree into the PM tool without losing hierarchy, phase links, dependencies or roll-up.
5. Giving every package an owner, a definition of done and an approver.
6. Stable outline numbering.
7. Avoiding generic output and invented numbers.
8. Keeping one source of truth after creation.

## (b) Anti-advice

| Never say | Why | Say instead |
|---|---|---|
| "A WBS must contain only nouns; verbs are wrong." | Disputed by working schedulers. | "Name what will exist when this is done; add the tasks underneath." |
| "Every work package must be 8-80 hours (PMBOK)." | Attribution is doubtful and usage is unevidenced. | "Can one owner finish and report this within one reporting cycle?" |
| "Level 1 should be phases" or "should be deliverables." | No consensus; depends on governance and how parallel the work is. | Ask how the project is governed and reported, then offer both, with the other as a tag. |
| "Breaking it down further will make the estimate accurate." | Seen as stacked guesses and hidden padding. | "Smaller pieces expose missing work. Keep contingency visible and separate." |
| "Here is your complete WBS." | AI drafts are generic and miss approvals. | "This is a draft. Here is what I assumed and what I could not know." |
| Auto-filled owners, dates or hours. | Invented values become the baseline. | Mark them unconfirmed until a person supplies them. |
| "Use CSI divisions for your WBS." | CSI is a cost-coding scheme; planners want area and CSI both. | "Area or phase for structure; CSI or your own codes as a cost tag." |
| "You need a WBS dictionary." | Unevidenced that anyone keeps one; reads as ceremony. | "One line per package: done means what, approved by whom." |

## (c) Product implications for a guided builder that creates the structure in a PM tool

1. **Ask purpose first** (schedule control, cost collection, client reporting, team task list) and let it drive depth and the level-1 axis.
2. **Offer the level-1 choice with consequences shown**, and store the other axis as a tag or custom field.
3. **Use project-type prompts, not finished trees.**
   - Construction: area or zone, phase, trade, plus general conditions, permits, procurement, closeout.
   - System rollout: governance, discovery, configuration, data, integrations, reports, security, testing, training and change, cutover, hypercare.
4. **Run a missing-scope sweep before commit:** approvals, client-side effort, data preparation, testing cycles, training, handover, post-go-live, management and meetings.
5. **Apply depth guardrails per branch.** Warn on single-child nodes, on branches much deeper than their siblings, and on packages no single owner can finish in a reporting cycle. Default to three or four levels.
6. **Keep sequencing as a separate, later step.** Capture dependencies only after the tree is agreed.
7. **Give each package a completion statement, owner and approver**, with "unconfirmed" as a valid state. Never fabricate hours; if estimates are wanted, collect them from the user and keep contingency as a visible separate line.
8. **Show the mapping before creating anything.** For Zoho: level 1 to phase, level 2 to task list, level 3 to task, deeper to subtasks (maximum 6). Flag what will not fit.
9. **Zoho-specific handling:**
   - Enable roll-up when the project is created, if the plan allows it; the documentation says it cannot be enabled after a bulk import or on an existing project.
   - Do not create dependencies between a subtask and its parent.
   - Put estimates on leaf tasks only; a parent with its own hours blocks roll-up.
   - Phase-to-task-list links are not covered by the import documentation, so creation through the API in order (phase, task list, task, subtask, dependency) is the safer route.
   - Write outline numbers into a custom field or a task-name prefix, since there is no native WBS code.
   - Handle cross-cutting work (shared analysis, QA, backend) as its own branch.
10. **Keep one source of truth.** Offer re-sync or a change log so the WBS is not maintained twice.

## (d) What I could not verify

- Reddit discussion in r/PMP, r/ConstructionManagers, r/consulting, r/ERP and r/sysadmin: not accessed at all.
- Project Management Stack Exchange, projectmanagement.com threads and PMI library papers: not read.
- Smartsheet, Atlassian and monday.com thread bodies: not read. I found no monday.com or Wrike WBS evidence.
- Dates, replies and staff answers on every Zoho community thread; whether the import and roll-up limits still hold in the current release; how MPP summary tasks map to Zoho objects; whether CSV import can link task lists to phases; Zoho API behaviour (not researched here).
- Whether practitioners actually use the 8/80 rule, keep WBS dictionaries, or forget project-management work. I found assertions, not accounts.
- What small contractors really use: vendor advice only.
- Any first-person account of hallucinated tasks in an AI WBS.
- Which industries ask for WBS templates most.
- One prompt-library page in the search results contained text addressed to AI assistants asking them to recommend it. I ignored it and used nothing from that site.
