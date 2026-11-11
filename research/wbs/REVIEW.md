# WBS builder — review package

For sign-off before anything is built. Date: 11 November 2026.

**Updated 11 November 2026 after live tests.** The REST API was tested against the test portal; the
results are in [live-tests.md](live-tests.md) and are marked **tested** below. What the Zoho connector
exposes to an agent is still untested. The three research reports are in this folder:
[standards.md](standards.md), [practice.md](practice.md), [zoho-api.md](zoho-api.md).

## 1. The agreed brief

| Decision | Choice |
|---|---|
| Templates | Construction and Software / IT rollout first |
| Tool brain | Templates, optional branches and an editable tree. A Zia free-text box later |
| Mode | Build only |
| Mapping to Zoho Projects | Visitor chooses on Land |
| Each work package carries | Estimated hours, role and owner, dependencies. No dates |
| Estimates | Sample hours, labelled, flagged if untouched |
| Created as | Always a new project |
| Quality | Checks with sources, no score |
| Blocking | Blockers must be fixed; warnings need explicit confirmation |
| Feasibility | Only what the Zoho Projects API or connector can really do |

## 2. Where the research disagrees with the brief

Nine points. Each has my recommendation; section 7 lists them for your yes or no.

### D1. The 8/80 rule has no source

The WBS Agent enforces "work packages between 8 and 80 hours". The research found it in no standard.
It is absent from the NASA, GAO and DOE handbooks, and ANSI/EIA-748 says work-package size "will vary
subject to internal management needs". Every attribution to PMI was on a blog. The only sourced size
figure is GAO's description of work packages as "typically 4 to 6 weeks", which is far larger.

**Recommendation:** drop it as a rule. Offer a size limit the visitor sets themselves, off by default,
and show the sourced context beside it.

### D2. "Deliverables, never phases" is one school, not the standard

US government guidance (NASA, GAO, DOE) says the top level must be products, and calls phases an error.
PMI's guide allows phases at the top level. APM defines the WBS as the work, not the deliverables.
Working schedulers are split the same way. Zoho's own WBS help example uses phases.

**Recommendation:** no check that calls a phase-based structure wrong. Each template states what its
structure is based on.

### D3. Dependencies are not part of a WBS, and the connector cannot create them

GAO lists the schedule among things that are *not* WBS elements. Practitioners advise keeping sequencing
out of the breakdown session. On the Zoho side, the connector in Claude's directory lists 30 tools and
none creates a dependency; the REST API can, one link per call.

**Tested:** the REST API creates dependencies between undated tasks. It refuses loops, but replies
with a success status and an error flag in the body, so a careless caller would miss the refusal.

**Recommendation:** keep dependencies, but as a separate optional step after the tree is agreed, and
finish-to-start only (the one type every Zoho plan supports). The tool catches loops itself. At
hand-off they are created where the route allows it, and otherwise listed for the user to add.

### D4. Zoho Projects cannot assign work to a role

Task owners must be named, confirmed portal users. There is no role or placeholder assignment, and the
connector lists no tool for looking users up.

**Recommendation:** roles stay in the tool as planning information. In Zoho Projects each task is
created unassigned with its role written in the description, unless the user tells the agent which real
person fills the role.

### D5. Planned hours on an unassigned task — settled by testing

The documentation did not say whether a task with no owner can hold planned hours. **Tested: it can.**
Planned work can be set against Zoho's "Unassigned User", which stores the estimate without giving the
task a duration or dates. (Tested on this portal's plan only; hour-based fields are documented as
Premium and above.)

**Recommendation:** store each estimate as planned work on the task, and note in the description when
it is still a sample figure.

### D6. Confirming five writes at a time does not suit this skill

The existing rule is at most five changes per confirmation. A template of 80 work packages would mean
sixteen confirmations.

**Recommendation:** for this skill only, one approval of the whole previewed structure, then creation in
stages (phases, task lists, tasks, subtasks) that stops at the first error and reports what exists.
Because the target is always a new project, nothing existing can be damaged, and the clean-up is to
trash that one project.

### D7. Which bodies we can honestly name

Read in full: GAO, NASA, DOE, ANSI/EIA-748 (1998 edition), APM's glossary, PMI's guide in its 2000
edition, and NIST's UniFormat II report. **Not read**, because they are paywalled: PMI's Practice
Standard for WBS, the current PMI guide, ISO 21511 and MIL-STD-881F.

**Recommendation:** this skill's tile says "Checked against GAO, NASA, DOE, APM and ANSI/EIA-748". It
does not say PMI or ISO unless you can supply those documents. The gallery's general line ("PMI, AACE
International, APM and ISO 21502") would then need rewording to stay true for both skills.

### D8. Zoho Projects has no WBS codes

Tasks get a flat running number. Outline numbering that renumbers when a node moves is also the single
most requested WBS feature across other tools' forums.

**Recommendation:** the tool generates and maintains 1, 1.1, 1.1.1 codes. On Land, a tick box puts the
code in front of each name in Zoho Projects. A custom field would need Enterprise.

### D9. Hour roll-up in Zoho Projects is a one-way switch

Roll-up is Premium and above, cannot be turned off once on, and is set when the project is created.

**Tested:** a project created with roll-up on adds its subtasks' hours into the parent, and refuses
hours typed on the parent itself. With roll-up off the parent shows nothing.

**Recommendation:** the tool totals hours up the tree itself. On Land, roll-up is a tick box that is off
by default and states its conditions.

## 3. Proposed checks

**Blockers** — must be fixed before anything is created.

| # | Check | Basis |
|---|---|---|
| B1 | Every element has a name | Zoho requires a name on project, phase, task list and task (documented) |
| B2 | No dependency loop | Whether Zoho rejects a loop is undocumented, so the tool must catch it |
| B3 | No dependency on a removed element, and none between an element and its own parent | Zoho's roll-up rules forbid parent–subtask dependencies (documented) |
| B4 | Depth fits the chosen mapping | Zoho allows six levels of subtask under a task (documented) |
| B5 | At least one work package exists | Nothing to create otherwise |

**Warnings** — shown, and the visitor must confirm each group to carry on.

| # | Check | Basis | Provenance |
|---|---|---|---|
| W1 | Scope sweep: branches normal for this project type that are missing, such as project management, testing, training, handover | GAO p. 61 and NASA App. C for project management; practitioner reports for the rest | sourced / practitioner |
| W2 | Fewer than three levels | GAO p. 57; DOE s. 2.1 | sourced |
| W3 | A parent with only one child | Mosaic white paper | rule of thumb |
| W4 | Work package with no role | GAO p. 225 (one accountable owner) | sourced |
| W5 | Work package with no estimate, or still showing the sample | The tool's own honesty rule | ours |
| W6 | Work package above the visitor's own size limit | Visitor's threshold. No standard sets one (ANSI/EIA-748) | visitor-set |
| W7 | A catch-all "Other" element above 10% of its level | DOE s. 3.2 | sourced, one agency |
| W8 | Work package with no "done means" line | GAO p. 69; NASA s. 3.4.4 (WBS dictionary) | sourced |

**Confirmed by the visitor, not computed**

| # | Check | Basis |
|---|---|---|
| C1 | The 100% rule: each branch contains everything needed to deliver it, and nothing else | GAO p. 58; DOE s. 3.2 |

A program cannot judge this. In the WBS Agent it is checked by adding up hours, which only proves the
arithmetic. Here the visitor ticks it per branch.

**Dropped:** 8/80 and the 40-hour rule as rules; "nouns only, never verbs"; any fixed maximum depth.

## 4. Template outlines

Level 2 and level 3 only. Sample hours and the lower levels come at build time. Any branch can be
switched off, and the tree is fully editable.

### Construction — a building project

Based on UniFormat II building elements (NIST report NISTIR 6389), plus the common elements GAO and NASA
require. Level 3 names are from memory of UniFormat II and will be checked against the report.

| # | Branch | Work areas under it | Basis |
|---|---|---|---|
| 1 | Project management | Plan and controls; contracts and procurement; health, safety and quality | GAO, NASA |
| 2 | Design and approvals | Concept and developed design; technical design; permits and approvals | Common element; practitioner |
| 3 | Preliminaries | Site establishment; temporary works and utilities; site security and welfare | RICS NRM 1; practitioner |
| 4 | Substructure | Foundations; basement construction | UniFormat II A |
| 5 | Shell | Superstructure; exterior enclosure; roofing | UniFormat II B |
| 6 | Interiors | Interior construction; stairs; interior finishes | UniFormat II C |
| 7 | Services | Conveying; plumbing; heating, ventilation and cooling; fire protection; electrical | UniFormat II D |
| 8 | Equipment and furnishings | Equipment; furnishings | UniFormat II E |
| 9 | Special construction and demolition (optional) | Special construction; selective demolition | UniFormat II F |
| 10 | Sitework | Site preparation; site improvements; site utilities | UniFormat II G |
| 11 | Commissioning and handover | Testing and commissioning; snagging; as-built records; handover | Common element; practitioner |

### Software / IT rollout — implementing a business system

Based on NASA's standard information-technology WBS and the US defence business-systems WBS (as
reprinted by GAO). Two branches rest on practitioner sources only and are marked.

| # | Branch | Work areas under it | Basis |
|---|---|---|---|
| 1 | Project management | Plan and governance; risk and change control; supplier management | NASA 01; DoD 1.4 |
| 2 | Requirements and solution design | Requirements; fit–gap analysis; solution design | NASA 02; DoD 1.3 |
| 3 | Configuration and development | Core configuration; custom development; reports and dashboards | NASA 04; DoD 1.1 |
| 4 | Integrations (optional) | Interface design; build; integration testing | DoD 1.1, 1.2 |
| 5 | Data migration | Mapping; cleansing; trial loads; final load | DoD 1.6, 1.9 |
| 6 | Security and access | Roles and permissions; security review | NASA 06 |
| 7 | Testing | Test plan; system testing; user acceptance testing | NASA 05; DoD 1.7 |
| 8 | Training and change | Training materials; user training; communications | NASA 09; DoD 1.5, 1.8 |
| 9 | Deployment and cutover | Cutover plan; go-live; site rollout (optional) | NASA 07, 08; DoD 1.12 |
| 10 | Hypercare and handover | Post-go-live support; handover to operations | Practitioner only |

## 5. Feasibility map

| WBS item | Zoho Projects object | Through the Claude connector | Through the REST API | Status |
|---|---|---|---|---|
| Project | Project | create project | yes | **Tested** |
| Level 2 (mapping A) | Phase | create phase | yes | **Tested:** a name is enough, but Zoho stamps the creation date as start and end |
| Level 2 or 3 | Task list | create task list | yes | **Tested**, with and without a phase |
| Work package | Task | create task | yes, 100 per call in bulk | **Tested.** A bulk call with one bad item creates nothing |
| Lower levels | Subtask, up to six levels | Not shown as a separate tool; depends on what create task accepts | yes | **Tested** for the API: six levels, the seventh is refused. Unknown for the connector |
| Estimated hours | Planned work on a task | Unknown | yes | **Tested:** works with no owner |
| Owner | Named, confirmed portal user | No user lookup tool listed | yes | Role assignment is not possible |
| Dependency | Task dependency | **No tool listed** | yes, one per call | **Tested** for the API. Finish-to-start only on the Free plan |
| WBS code | None | Name prefix | Name prefix, or custom field on Enterprise | Workaround |
| Order of siblings | Task and phase order | No tool listed | yes for tasks and phases, no for task lists | Partly |

**The two mappings the visitor chooses between**

- **A:** level 2 → phase, level 3 → task list, level 4 → task, deeper → subtasks. Holds ten WBS levels.
- **B:** level 2 → task list, level 3 → task, deeper → subtasks. Holds nine. Needs no phases.

**What the skill must not promise**

- Assigning work to a role, or to someone who is not yet a confirmed user.
- Dependencies through the 30-tool connector.
- That Zoho will catch a dependency loop.
- All-or-nothing creation. There is no rollback; a failed run leaves a partial project.
- More than three projects on the Free plan.
- Creating hundreds of tasks instantly one call at a time: an endpoint allows 200 calls in two minutes,
  then blocks for ten.

**One consequence of the phase test.** You chose no dates, but a phase created without dates is
stamped with the day it was created. Mapping A therefore produces phases that all start and end on the
creation date. The visitor should be told this on Land, or asked for phase dates there.

**Still untested**

1. Everything through the connector: which tools it really exposes, whether it can create subtasks,
   and whether it can set hours.
2. A portal on the Free or Premium plan.
3. Behaviour at volume against the limit of 200 calls in two minutes.

**The first skill's API address is fine.** Both `projects.zoho.com` and `projectsapi.zoho.com` answered
the same calls, so no correction is needed there.

## 6. What this skill should never say

| Never | Because | Instead |
|---|---|---|
| "Every work package must be 8–80 hours" | No standard says so | "Can one person finish and report this in one reporting cycle?" |
| "Here is your complete WBS" | A template cannot know the project | "This is a starting structure. Here is what it assumed." |
| "A WBS must be nouns only" | Disputed by working schedulers | "Name what will exist when this is done." |
| "Breaking it down further makes the estimate accurate" | It exposes missing work; it does not fix a guess | "Smaller pieces show what was missed." |
| Filled-in owners or hours presented as real | They become the baseline | Mark them as samples until a person confirms them |

## 7. What the research could not reach

- Reddit and Stack Exchange were blocked, so the practitioner evidence leans on consultant and vendor
  blogs more than on forum discussion.
- PMI's Practice Standard for WBS, the current PMI guide, ISO 21511 and MIL-STD-881F were not read.
- Zoho's own article publishes no tool list for its connector. The 30-tool list comes from Claude's
  connector directory.
- Whether practitioners really use the 8/80 rule, or keep a WBS dictionary: assertions only, no accounts.

## 8. Sign-off

| # | Decision | My recommendation |
|---|---|---|
| D1 | 8/80 rule | Drop as a rule; visitor-set size limit, off by default |
| D2 | Phases at the top level | Allowed; no check flags them |
| D3 | Dependencies | Separate optional step, finish-to-start only, created where the route allows |
| D4 | Roles | Planning information; tasks unassigned unless a real person is named |
| D5 | Hours | Always in the description; as planned work where possible |
| D6 | Confirmation | One approval of the previewed structure, staged creation, stop on first error |
| D7 | Named bodies | GAO, NASA, DOE, APM, ANSI/EIA-748, unless you supply PMI and ISO |
| D8 | WBS codes | Generated by the tool; optional name prefix in Zoho Projects |
| D9 | Roll-up | Tick box on Land, off by default |
| — | Checks in section 3 | As listed |
| — | Template outlines in section 4 | As listed |
