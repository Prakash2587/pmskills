'use strict';
/* ============================================================================
 * Knowledge layer — work breakdown structures. Data only, no logic.
 * ----------------------------------------------------------------------------
 * Every rule carries where it comes from and how far that source was verified:
 *   sourced      read in a standard or government handbook
 *   single       sourced, but from one body only
 *   heuristic    a rule of thumb from a named practitioner source
 *   practice     reported by practitioners; no standard behind it
 *   zoho-tested  observed on a live Zoho Projects portal (see research/wbs/live-tests.md)
 *   ours         this project's own rule, stated as such
 *
 * What was NOT read (paywalled): PMI's Practice Standard for WBS, the current
 * PMBOK Guide, ISO 21511 and MIL-STD-881F. Nothing here may be attributed to them.
 * Research notes: research/wbs/.
 * ========================================================================== */

const SOURCES = {
  gao: { name: 'GAO Cost Estimating and Assessment Guide (GAO-20-195G), 2020', url: 'https://www.gao.gov/products/gao-20-195g' },
  gaoSched: { name: 'GAO Schedule Assessment Guide (GAO-16-89G), 2015', url: 'https://www.gao.gov/assets/gao-16-89g.pdf' },
  nasa: { name: 'NASA Work Breakdown Structure Handbook (NASA/SP-20210023927), 2021', url: 'https://www.nasa.gov/wp-content/uploads/2023/08/nasa-work-breakdown-structure-handbook.pdf' },
  doe: { name: 'US DOE Work Breakdown Structure Handbook, 2012', url: 'https://www.energy.gov/sites/prod/files/DOE%20WBS%20Handbook%20%202012-08-16.pdf' },
  eia: { name: 'ANSI/EIA-748 Earned Value Management Systems (1998 edition)', url: 'https://mosaicprojects.com.au/PDF-Gen/ANSI-EIA_748_May-1998.pdf' },
  apm: { name: 'APM Glossary (APM Body of Knowledge, 7th edition)', url: 'https://www.apm.org.uk/resources/glossary/' },
  nist: { name: 'NIST, UNIFORMAT II Elemental Classification (NISTIR 6389), 1999', url: 'https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir6389.pdf' },
  nrm: { name: 'RICS NRM 1, 3rd edition, 2021', url: 'https://www.rics.org/content/dam/ricsglobal/documents/standards/october_2021_nrm_1.pdf' },
  mosaic: { name: 'Weaver, Mosaic white paper WP1011, Work Breakdown Structures', url: 'https://mail.mosaicprojects.com.au/WhitePapers/WP1011_WBS.pdf' },
  zoho: { name: 'Live tests on a Zoho Projects portal, November 2026', url: 'research/wbs/live-tests.md' },
};

/* The bodies this skill may be said to be "checked against". Deliberately not PMI or ISO. */
const CHECKED_AGAINST = ['GAO', 'NASA', 'US DOE', 'APM', 'ANSI/EIA-748'];

/* --- rules ------------------------------------------------------------------
 * level: blocker  must be fixed before anything is created
 *        warning  shown; the user must acknowledge it to carry on
 *        confirm  only a person can judge it; the user ticks it */

const RULES = {
  B1: { level: 'blocker', title: 'Every element has a name',
    basis: 'Zoho Projects requires a name on every project, phase, task list and task.', provenance: 'zoho-tested', source: 'zoho' },
  B2: { level: 'blocker', title: 'No dependency loop',
    basis: 'Zoho Projects refuses a loop, but replies with a success status and an error flag, so it has to be caught before anything is sent.', provenance: 'zoho-tested', source: 'zoho' },
  B3: { level: 'blocker', title: 'Dependencies join two existing work packages',
    basis: 'A dependency needs two tasks that will exist. Sequencing belongs to work packages, not to the branches above them (GAO, p. 65).', provenance: 'sourced', source: 'gao' },
  B4: { level: 'blocker', title: 'Depth fits the chosen mapping',
    basis: 'Zoho Projects allows six levels of subtask under a task; a seventh is refused.', provenance: 'zoho-tested', source: 'zoho' },
  B5: { level: 'blocker', title: 'At least one work package exists',
    basis: 'With no work package there is nothing to create.', provenance: 'ours', source: null },

  W1: { level: 'warning', title: 'Scope sweep: branches that are usually present',
    basis: 'Every WBS includes project management as a level 2 element (GAO, p. 61; NASA, App. C). The other branches listed are the ones practitioners report as most often missed.', provenance: 'sourced', source: 'gao' },
  W2: { level: 'warning', title: 'At least three levels',
    basis: 'A WBS should include at least three levels (GAO, p. 57; DOE, s. 2.1).', provenance: 'sourced', source: 'gao' },
  W3: { level: 'warning', title: 'No branch has a single child',
    basis: 'A parent with one child adds a level without dividing anything. A rule of thumb, not a standard (Mosaic WP1011).', provenance: 'heuristic', source: 'mosaic' },
  W4: { level: 'warning', title: 'Every work package has a role',
    basis: 'Each unit of controlled work has one accountable manager (GAO, p. 225).', provenance: 'sourced', source: 'gao' },
  W5: { level: 'warning', title: 'Every work package has your own estimate',
    basis: 'Template hours are samples. An estimate nobody has looked at becomes the baseline by accident.', provenance: 'ours', source: null },
  W6: { level: 'warning', title: 'Work packages within your size limit',
    basis: 'Your own threshold. No standard fixes a size: it "will vary subject to internal management needs" (ANSI/EIA-748, s. 3.5.10). GAO describes work packages as typically four to six weeks long.', provenance: 'ours', source: 'eia' },
  W7: { level: 'warning', title: 'No catch-all element above 10% of its level',
    basis: 'An "other" element should stay under 10% of the work at its level (DOE, s. 3.2). One agency\'s rule.', provenance: 'single', source: 'doe' },
  W8: { level: 'warning', title: 'Every work package says what "done" means',
    basis: 'A WBS dictionary defines the content of each element (GAO, p. 69; NASA, s. 3.4.4).', provenance: 'sourced', source: 'gao' },

  C1: { level: 'confirm', title: 'Each branch holds everything needed to deliver it, and nothing else',
    basis: 'The 100% rule: the children of an element account for all of its work (GAO, p. 58; DOE, s. 3.2). A program cannot judge this; only someone who knows the project can.', provenance: 'sourced', source: 'gao' },
};

/* Shown beside the size limit, so the number the user picks is not mistaken for a standard. */
const SIZE_CONTEXT = 'The often-quoted "8 to 80 hours" rule appears in no standard we could read. It is a habit, not a requirement.';

/* --- how a WBS becomes Zoho Projects objects ---------------------------------
 * `containers` is how many levels become containers before tasks start. A task
 * may then hold six levels of subtask (tested). */

const MAPPINGS = {
  A: { key: 'A', label: 'Phases, task lists, tasks', containers: ['phase', 'tasklist'], maxDepth: 8,
    summary: 'Level 2 becomes a phase, level 3 a task list, level 4 a task, anything deeper a subtask.',
    note: 'Zoho Projects gives a phase created without dates the day it is created as both its start and its end. Set the real dates there afterwards.' },
  B: { key: 'B', label: 'Task lists and tasks only', containers: ['tasklist'], maxDepth: 7,
    summary: 'Level 2 becomes a task list, level 3 a task, anything deeper a subtask. No phases are created.',
    note: 'Nothing here carries a date, so the structure stays a scope breakdown until you schedule it.' },
};
const MAX_SUBTASK_LEVELS = 6;

/* What the Zoho Projects side can and cannot do — each line observed or documented. */
const ZOHO_FACTS = [
  { fact: 'Work can only be assigned to a named, confirmed user of the portal — never to a role.', provenance: 'documented' },
  { fact: 'An estimate can be stored on a task that has no owner.', provenance: 'zoho-tested' },
  { fact: 'Tasks keep the order they are created in. Zoho Projects has no outline numbers of its own.', provenance: 'zoho-tested' },
  { fact: 'Hour roll-up to parents is a project setting chosen at creation; it cannot be turned off later.', provenance: 'zoho-tested' },
  { fact: 'There is no undo for a half-finished creation. The clean-up is to trash the new project.', provenance: 'documented' },
];

/* --- advice never to give ---------------------------------------------------- */

const ANTI_ADVICE = [
  { never: 'Every work package must be 8 to 80 hours', because: 'No standard says so.', instead: 'Ask whether one person can finish it and report on it within one reporting cycle.' },
  { never: 'Here is your complete WBS', because: 'A template cannot know the project.', instead: 'Call it a starting structure and say what it assumed.' },
  { never: 'A WBS must be nouns only', because: 'Working schedulers dispute it, and PMI and APM allow other structures.', instead: 'Name what will exist when the element is done.' },
  { never: 'Breaking it down further makes the estimate accurate', because: 'Smaller pieces expose missing work; they do not fix a guess.', instead: 'Say that decomposition shows what was missed, and keep contingency visible.' },
  { never: 'Phases at the top level are wrong', because: 'Only US government guidance says so.', instead: 'Ask how the project is governed and reported, and structure it that way.' },
];

/* --- templates ---------------------------------------------------------------
 * branch:  { key, title, basis, expected?, off? , areas }
 *   expected  the scope sweep warns if this branch is removed, with `why`
 *   off       not included unless switched on
 * area:    [title, [ [work package, sample hours, role], ... ]]
 * Sample hours are illustrative only. They are flagged until the user changes them. */

const TEMPLATES = [
  {
    key: 'construction',
    title: 'Construction — a building project',
    tagline: 'A new building or a major fit-out, broken down by building element.',
    basis: 'Building elements follow UNIFORMAT II (NIST report NISTIR 6389). Project management and the other common branches follow GAO and NASA.',
    chips: ['By building element', 'UNIFORMAT II'],
    branches: [
      { key: 'pm', title: 'Project management', basis: 'GAO; NASA', expected: true, why: 'Every WBS carries project management as its own branch.', areas: [
        ['Plan and controls', [['Project execution plan', 40, 'Project Manager'], ['Cost plan and controls', 32, 'Quantity Surveyor'], ['Baseline schedule', 24, 'Project Manager']]],
        ['Contracts and procurement', [['Tender documents', 40, 'Quantity Surveyor'], ['Subcontract awards', 32, 'Quantity Surveyor']]],
        ['Health, safety and quality', [['Health and safety plan', 24, 'Site Manager'], ['Quality plan', 16, 'Site Manager']]],
      ] },
      { key: 'design', title: 'Design and approvals', basis: 'Common element; practitioner reports', expected: true, why: 'Permits and approvals are a frequent cause of late surprises.', areas: [
        ['Concept and developed design', [['Concept design', 80, 'Design Lead'], ['Developed design', 120, 'Design Lead']]],
        ['Technical design', [['Construction drawings', 160, 'Design Lead'], ['Specifications', 60, 'Design Lead']]],
        ['Permits and approvals', [['Planning approval', 40, 'Project Manager'], ['Building permit', 24, 'Project Manager']]],
      ] },
      { key: 'prelims', title: 'Preliminaries', basis: 'RICS NRM 1; practitioner reports', expected: true, why: 'Site set-up is real work that elemental breakdowns leave out.', areas: [
        ['Site establishment', [['Site offices and welfare', 40, 'Site Manager'], ['Hoarding and access', 24, 'Site Manager']]],
        ['Temporary works and utilities', [['Temporary power and water', 24, 'Services Engineer'], ['Scaffolding and temporary works', 40, 'Structural Contractor']]],
      ] },
      { key: 'substructure', title: 'Substructure', basis: 'UNIFORMAT II, group A', areas: [
        ['Foundations', [['Standard foundations', 160, 'Structural Contractor'], ['Slab on grade', 120, 'Structural Contractor']]],
        ['Basement construction', [['Basement excavation', 80, 'Civil Contractor'], ['Basement walls', 120, 'Structural Contractor']]],
      ] },
      { key: 'shell', title: 'Shell', basis: 'UNIFORMAT II, group B', areas: [
        ['Superstructure', [['Floor construction', 240, 'Structural Contractor'], ['Roof construction', 120, 'Structural Contractor']]],
        ['Exterior enclosure', [['Exterior walls', 200, 'Envelope Contractor'], ['Exterior windows and doors', 120, 'Envelope Contractor']]],
        ['Roofing', [['Roof coverings', 80, 'Envelope Contractor'], ['Roof openings', 24, 'Envelope Contractor']]],
      ] },
      { key: 'interiors', title: 'Interiors', basis: 'UNIFORMAT II, group C', areas: [
        ['Interior construction', [['Partitions', 160, 'Interiors Contractor'], ['Interior doors', 60, 'Interiors Contractor']]],
        ['Stairs', [['Stair construction', 60, 'Structural Contractor'], ['Stair finishes', 24, 'Interiors Contractor']]],
        ['Interior finishes', [['Wall finishes', 120, 'Interiors Contractor'], ['Floor finishes', 100, 'Interiors Contractor'], ['Ceiling finishes', 80, 'Interiors Contractor']]],
      ] },
      { key: 'services', title: 'Services', basis: 'UNIFORMAT II, group D', areas: [
        ['Conveying', [['Lifts', 80, 'Services Engineer']]],
        ['Plumbing', [['Plumbing fixtures', 60, 'Services Engineer'], ['Domestic water distribution', 80, 'Services Engineer']]],
        ['Heating, ventilation and cooling', [['Heating and cooling plant', 120, 'Services Engineer'], ['Air distribution', 120, 'Services Engineer']]],
        ['Fire protection', [['Sprinklers', 80, 'Services Engineer']]],
        ['Electrical', [['Electrical service and distribution', 120, 'Services Engineer'], ['Lighting and branch wiring', 160, 'Services Engineer'], ['Communications and security', 80, 'Services Engineer']]],
      ] },
      { key: 'equipment', title: 'Equipment and furnishings', basis: 'UNIFORMAT II, group E', areas: [
        ['Equipment', [['Fixed equipment', 40, 'Interiors Contractor']]],
        ['Furnishings', [['Fixed furnishings', 40, 'Interiors Contractor'], ['Movable furnishings', 24, 'Interiors Contractor']]],
      ] },
      { key: 'special', title: 'Special construction and demolition', basis: 'UNIFORMAT II, group F', off: true, areas: [
        ['Special construction', [['Special structures', 80, 'Structural Contractor']]],
        ['Selective demolition', [['Building elements demolition', 80, 'Civil Contractor'], ['Hazardous components abatement', 60, 'Civil Contractor']]],
      ] },
      { key: 'sitework', title: 'Sitework', basis: 'UNIFORMAT II, group G', areas: [
        ['Site preparation', [['Site clearing', 40, 'Civil Contractor'], ['Site earthwork', 120, 'Civil Contractor']]],
        ['Site improvements', [['Roads and parking', 120, 'Civil Contractor'], ['Landscaping', 60, 'Civil Contractor']]],
        ['Site utilities', [['Water, drainage and sewer connections', 100, 'Civil Contractor'], ['Site electrical distribution', 60, 'Services Engineer']]],
      ] },
      { key: 'handover', title: 'Commissioning and handover', basis: 'Common element; practitioner reports', expected: true, why: 'Closure and handover are among the most often forgotten work.', areas: [
        ['Testing and commissioning', [['Services commissioning', 80, 'Commissioning Lead'], ['Building inspections', 24, 'Project Manager']]],
        ['Snagging', [['Snag list and rectification', 60, 'Site Manager']]],
        ['Handover', [['As-built records and manuals', 40, 'Design Lead'], ['Handover to the client', 16, 'Project Manager']]],
      ] },
    ],
  },
  {
    key: 'software',
    title: 'Software / IT rollout — a business system',
    tagline: 'Implementing a business system such as a CRM or ERP, from requirements to hypercare.',
    basis: 'Branches follow NASA\'s standard information-technology WBS and the US defence business-systems WBS as reprinted by GAO. Hypercare rests on practitioner sources only.',
    chips: ['System implementation', 'NASA and DoD structures'],
    branches: [
      { key: 'pm', title: 'Project management', basis: 'NASA 01; DoD 1.4', expected: true, why: 'Every WBS carries project management as its own branch.', areas: [
        ['Plan and governance', [['Project plan', 40, 'Project Manager'], ['Governance and reporting set-up', 16, 'Project Manager']]],
        ['Risk and change control', [['Risk register', 16, 'Project Manager'], ['Change control process', 12, 'Project Manager']]],
        ['Supplier management', [['Supplier contract and onboarding', 24, 'Project Manager']]],
      ] },
      { key: 'requirements', title: 'Requirements and solution design', basis: 'NASA 02; DoD 1.3', areas: [
        ['Requirements', [['Process and requirements workshops', 60, 'Business Analyst'], ['Requirements baseline', 40, 'Business Analyst']]],
        ['Fit–gap analysis', [['Fit–gap assessment', 40, 'Solution Architect']]],
        ['Solution design', [['Solution design document', 60, 'Solution Architect'], ['Design sign-off', 8, 'Project Manager']]],
      ] },
      { key: 'configuration', title: 'Configuration and development', basis: 'NASA 04; DoD 1.1', areas: [
        ['Core configuration', [['Modules and settings', 120, 'Developer'], ['Workflows and automation', 80, 'Developer']]],
        ['Custom development', [['Custom functions and extensions', 100, 'Developer']]],
        ['Reports and dashboards', [['Standard reports', 40, 'Business Analyst'], ['Management dashboards', 40, 'Business Analyst']]],
      ] },
      { key: 'integrations', title: 'Integrations', basis: 'DoD 1.1, 1.2', areas: [
        ['Interface design', [['Integration specification', 40, 'Integration Specialist']]],
        ['Interface build', [['Interface build', 100, 'Integration Specialist']]],
        ['Integration testing', [['End-to-end interface tests', 40, 'Integration Specialist']]],
      ] },
      { key: 'data', title: 'Data migration', basis: 'DoD 1.6, 1.9', expected: true, why: 'Data preparation started too late is a classic rollout failure.', areas: [
        ['Mapping and cleansing', [['Data mapping', 40, 'Data Lead'], ['Data cleansing', 60, 'Data Lead']]],
        ['Trial loads', [['Trial migration', 40, 'Data Lead'], ['Reconciliation', 24, 'Data Lead']]],
        ['Final load', [['Production migration', 24, 'Data Lead']]],
      ] },
      { key: 'security', title: 'Security and access', basis: 'NASA 06', areas: [
        ['Roles and permissions', [['Role and permission matrix', 24, 'Security Lead'], ['Access configuration', 24, 'Developer']]],
        ['Security review', [['Security review and fixes', 32, 'Security Lead']]],
      ] },
      { key: 'testing', title: 'Testing', basis: 'NASA 05; DoD 1.7', expected: true, why: 'Testing treated as a final check is routinely under-scoped.', areas: [
        ['Test plan', [['Test strategy and scripts', 40, 'Test Lead']]],
        ['System testing', [['System test execution', 80, 'Test Lead'], ['Defect fixes', 60, 'Developer']]],
        ['User acceptance testing', [['Acceptance test execution', 60, 'Test Lead'], ['Acceptance sign-off', 8, 'Project Manager']]],
      ] },
      { key: 'training', title: 'Training and change', basis: 'NASA 09; DoD 1.5, 1.8', expected: true, why: 'Training treated as a one-off event is routinely under-scoped.', areas: [
        ['Training materials', [['User guides and videos', 40, 'Trainer']]],
        ['User training', [['Training sessions', 40, 'Trainer']]],
        ['Communications', [['Change communications', 24, 'Project Manager']]],
      ] },
      { key: 'deployment', title: 'Deployment and cutover', basis: 'NASA 07, 08; DoD 1.12', expected: true, why: 'Cutover needs its own plan and its own go or no-go decision.', areas: [
        ['Cutover plan', [['Cutover runbook', 24, 'Project Manager'], ['Go or no-go checklist', 8, 'Project Manager']]],
        ['Go-live', [['Production deployment', 24, 'Developer']]],
        ['Site rollout', [['Rollout to remaining sites', 40, 'Project Manager']]],
      ] },
      { key: 'hypercare', title: 'Hypercare and handover', basis: 'Practitioner reports only', expected: true, why: 'Support after go-live is commonly left out of the plan.', areas: [
        ['Post-go-live support', [['Hypercare support', 80, 'Support Lead']]],
        ['Handover to operations', [['Operations handover and documentation', 24, 'Support Lead']]],
      ] },
    ],
  },
];

module.exports = { SOURCES, CHECKED_AGAINST, RULES, SIZE_CONTEXT, MAPPINGS, MAX_SUBTASK_LEVELS, ZOHO_FACTS, ANTI_ADVICE, TEMPLATES };
