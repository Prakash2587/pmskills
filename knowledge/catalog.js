'use strict';
/* ============================================================================
 * Knowledge layer — catalogue for the planner wizard. Data only, no logic.
 * ----------------------------------------------------------------------------
 * Industries, work-week patterns, the Zoho Projects features each finding binds
 * to, and the starting scenarios. Nothing here invents a benchmark: an industry
 * either points at a sourced band in benchmarks.js (`band`) or carries none.
 * ========================================================================== */

/* --- industries -----------------------------------------------------------
 * `band`     : key into benchmarks.UTILISATION, or null when no band exists.
 * `billable` : true  = client-billed work is the norm, billable ratio matters
 *              false = no external rate, billable ratio is meaningless
 *              'mixed' = depends on the team; ask the billing model. */

const INDUSTRIES = [
  { key: 'professional_services', group: 'Client services', label: 'Professional services (general)', band: 'professional_services', billable: true },
  { key: 'management_consulting', group: 'Client services', label: 'Management / strategy consulting', band: 'professional_services', billable: true },
  { key: 'it_consulting', group: 'Client services', label: 'IT consulting / systems integration', band: 'professional_services', billable: true },
  { key: 'agency', group: 'Client services', label: 'Digital / creative / marketing agency', band: 'agency', billable: true },
  { key: 'msp', group: 'Client services', label: 'Managed services / IT support (MSP)', band: 'msp', billable: true },
  { key: 'technology_services', group: 'Client services', label: 'SaaS professional services / implementation', band: 'technology_services', billable: true },
  { key: 'legal', group: 'Client services', label: 'Legal services', band: null, billable: true },
  { key: 'accounting', group: 'Client services', label: 'Accounting / audit / tax', band: null, billable: true },
  { key: 'staffing', group: 'Client services', label: 'Staffing / outsourcing', band: null, billable: true },

  { key: 'architecture_engineering', group: 'Built environment', label: 'Architecture & engineering', band: 'architecture_engineering', billable: true },
  { key: 'construction', group: 'Built environment', label: 'Construction / general contracting', band: null, billable: 'mixed' },
  { key: 'real_estate', group: 'Built environment', label: 'Real estate / property development', band: null, billable: 'mixed' },
  { key: 'energy_utilities', group: 'Built environment', label: 'Energy / utilities / infrastructure', band: null, billable: 'mixed' },

  { key: 'software_internal', group: 'Internal teams', label: 'In-house software / product engineering', band: 'software_internal', billable: false },
  { key: 'it_internal', group: 'Internal teams', label: 'Internal IT / operations', band: null, billable: false },
  { key: 'manufacturing', group: 'Internal teams', label: 'Manufacturing / industrial / new product development', band: null, billable: false },
  { key: 'financial_services', group: 'Internal teams', label: 'Banking / insurance / financial services', band: null, billable: false },
  { key: 'healthcare', group: 'Internal teams', label: 'Healthcare / life sciences', band: null, billable: false },
  { key: 'retail', group: 'Internal teams', label: 'Retail / e-commerce', band: null, billable: false },
  { key: 'telecom', group: 'Internal teams', label: 'Telecom', band: null, billable: false },
  { key: 'research', group: 'Internal teams', label: 'Research & development', band: null, billable: false },

  { key: 'government', group: 'Public & non-profit', label: 'Government / public sector', band: null, billable: false },
  { key: 'education', group: 'Public & non-profit', label: 'Education', band: null, billable: false },
  { key: 'nonprofit', group: 'Public & non-profit', label: 'Non-profit / NGO', band: 'nonprofit', billable: false },

  { key: 'media', group: 'Other', label: 'Media / film / production', band: null, billable: 'mixed' },
  { key: 'events', group: 'Other', label: 'Events / hospitality', band: null, billable: 'mixed' },
  { key: 'other', group: 'Other', label: 'Something else', band: null, billable: 'mixed' },
];

/* --- work-week patterns ---------------------------------------------------
 * Patterns rather than a country list: a pattern is a fact about the team,
 * and "custom" covers every case this list does not. JS day index, 0 = Sunday. */

const WEEK_PATTERNS = [
  { key: 'mon_fri', label: 'Monday – Friday', days: [1, 2, 3, 4, 5],
    where: 'Most of Europe, the Americas, East and South-East Asia' },
  { key: 'sun_thu', label: 'Sunday – Thursday', days: [0, 1, 2, 3, 4],
    where: 'Saudi Arabia, Qatar, Kuwait, Israel (Oman and Bahrain: verify locally)' },
  { key: 'mon_fri_half', label: 'Monday – Friday, Friday half-day', days: [1, 2, 3, 4, 5], halfDay: 5,
    where: 'United Arab Emirates since January 2022' },
  { key: 'mon_sat', label: 'Monday – Saturday (six-day)', days: [1, 2, 3, 4, 5, 6],
    where: 'Common in parts of India and in site-based work; varies by state and sector' },
  { key: 'sun_fri', label: 'Sunday – Friday (six-day)', days: [0, 1, 2, 3, 4, 5],
    where: 'Nepal' },
  { key: 'custom', label: 'Custom — pick the days', days: null, where: 'Anything else: shifts, compressed weeks, four-day weeks' },
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* --- Zoho Projects features a finding binds to ------------------------------
 * Only features confirmed in the API research. `tier` is the standalone gating. */

const ZOHO_FEATURES = {
  workload: {
    name: 'Workload report',
    does: 'Shows each person\'s allocation against their real availability and labels them under, optimal or over.',
    tier: 'Premium (per project) · Enterprise (across projects)',
    api: 'GET /reports/workload',
  },
  budget: {
    name: 'Project Budget',
    does: 'Tracks planned, actual and forecasted cost and hours per project.',
    tier: 'Premium',
    api: 'budget_info on GET /projects/{id}',
  },
  rates: {
    name: 'Per-user cost and billing rates',
    does: 'Stores a cost rate and a billing rate for each person, which is what turns logged hours into money.',
    tier: 'Premium',
    api: 'user budget { cost_per_hour, rate_per_hour }',
  },
  timesheets: {
    name: 'Timesheets with approval',
    does: 'Captures hours per person per task, billable or not, with an approval step.',
    tier: 'Approvals: Premium',
    api: 'GET /timelogs',
  },
  calendar: {
    name: 'Business hours and holidays',
    does: 'Defines the working week and holidays that every capacity figure is measured against.',
    tier: 'All plans',
    api: 'portal settings',
  },
  tasks: {
    name: 'Tasks and assignment',
    does: 'Holds the work itself: owner, planned hours, dates. Reassigning a task is how rebalancing happens.',
    tier: 'All plans',
    api: 'task create / update (owner, work hours)',
  },
};

/* --- scenarios --------------------------------------------------------------
 * Each scenario is the PROBLEM the user came with, plus sample data in the
 * right shape so the plan is visible immediately and every number is editable. */

const SCENARIOS = [
  {
    key: 'overloaded',
    title: 'My team is overloaded',
    tagline: 'Some people are buried while others have room. Find who, by how much, and what to move.',
    pattern: 'overallocation-by-accumulation',
    chips: ['Rebalance work', 'Capacity vs load'],
    org: { industry: 'agency', billingModel: 'time_and_materials' },
    people: [
      { id: 'p1', name: 'Maya Iyer', role: 'Developer', capacity: 40, costRate: 55, billRate: 120 },
      { id: 'p2', name: 'Arjun Kumar', role: 'Developer', capacity: 40, costRate: 40, billRate: 95 },
      { id: 'p3', name: 'Rhea Shah', role: 'Developer', capacity: 40, costRate: 38, billRate: 95 },
      { id: 'p4', name: 'Sam Pillai', role: 'QA Engineer', capacity: 40, costRate: 35, billRate: 80 },
      { id: 'p5', name: 'Dev Roy', role: 'Designer', capacity: 40, costRate: 45, billRate: 100 },
      { id: 'p6', name: 'Tara Nair', role: 'Project Manager', capacity: 40, costRate: 50, billRate: 110 },
    ],
    work: [
      { id: 'w1', title: 'Platform build', project: 'Client A', owner: 'p1', hours: 30, billable: true },
      { id: 'w2', title: 'Code reviews', project: 'Client A', owner: 'p1', hours: 8, billable: true },
      { id: 'w3', title: 'API integration', project: 'Client B', owner: 'p1', hours: 14, billable: true },
      { id: 'w4', title: 'Frontend', project: 'Client B', owner: 'p2', hours: 22, billable: true },
      { id: 'w5', title: 'Internal tooling', project: 'Internal', owner: 'p2', hours: 4, billable: false },
      { id: 'w6', title: 'Mobile fixes', project: 'Client C', owner: 'p3', hours: 18, billable: true },
      { id: 'w7', title: 'Regression testing', project: 'Client A', owner: 'p4', hours: 26, billable: true },
      { id: 'w8', title: 'Test automation', project: 'Internal', owner: 'p4', hours: 16, billable: false },
      { id: 'w9', title: 'Design system', project: 'Client B', owner: 'p5', hours: 28, billable: true },
      { id: 'w10', title: 'Pitch work', project: 'Internal', owner: 'p5', hours: 8, billable: false },
      { id: 'w11', title: 'Delivery management', project: 'All clients', owner: 'p6', hours: 34, billable: true },
      { id: 'w12', title: 'Status reporting', project: 'Internal', owner: 'p6', hours: 6, billable: false },
    ],
    budget: { amount: 0, spent: 0 },
  },
  {
    key: 'budget',
    title: 'We are burning through the budget',
    tagline: 'See where the money goes each week, what the forecast really is, and whether rebalancing can fix it.',
    pattern: 'plan-vs-actual-invisible',
    chips: ['Forecast vs budget', 'Cost per week'],
    org: { industry: 'management_consulting', billingModel: 'fixed_fee' },
    people: [
      { id: 'p1', name: 'Nisha Rao', role: 'Lead Consultant', capacity: 40, costRate: 85, billRate: 190 },
      { id: 'p2', name: 'Karan Mehta', role: 'Consultant', capacity: 40, costRate: 60, billRate: 140 },
      { id: 'p3', name: 'Priya Das', role: 'Consultant', capacity: 40, costRate: 60, billRate: 140 },
      { id: 'p4', name: 'Omar Sheikh', role: 'Analyst', capacity: 40, costRate: 35, billRate: 90 },
      { id: 'p5', name: 'Lina Paul', role: 'Analyst', capacity: 40, costRate: 35, billRate: 90 },
    ],
    work: [
      { id: 'w1', title: 'Discovery workshops', project: 'Transformation programme', owner: 'p1', hours: 20, billable: true },
      { id: 'w2', title: 'Solution design', project: 'Transformation programme', owner: 'p1', hours: 18, billable: true },
      { id: 'w3', title: 'Process mapping', project: 'Transformation programme', owner: 'p2', hours: 30, billable: true },
      { id: 'w4', title: 'Stakeholder interviews', project: 'Transformation programme', owner: 'p2', hours: 12, billable: true },
      { id: 'w5', title: 'Data migration plan', project: 'Transformation programme', owner: 'p3', hours: 24, billable: true },
      { id: 'w6', title: 'Reporting pack', project: 'Transformation programme', owner: 'p4', hours: 30, billable: true },
      { id: 'w7', title: 'Data clean-up', project: 'Transformation programme', owner: 'p4', hours: 6, billable: true },
      { id: 'w8', title: 'Benchmark research', project: 'Transformation programme', owner: 'p5', hours: 14, billable: true },
      { id: 'w9', title: 'Internal training', project: 'Internal', owner: 'p5', hours: 6, billable: false },
    ],
    budget: { amount: 120000, spent: 78000 },
    horizonWeeks: 8,
  },
  {
    key: 'incoming',
    title: 'New work is coming — can we absorb it?',
    tagline: 'Add the incoming work, see who can take it, and get the exact staffing gap if the team cannot.',
    pattern: 'capacity-maths-wrong',
    chips: ['Assign new work', 'Staffing gap'],
    org: { industry: 'software_internal', billingModel: '' },
    people: [
      { id: 'p1', name: 'Anil Verma', role: 'Engineer', capacity: 40, costRate: 60, billRate: 0 },
      { id: 'p2', name: 'Sara Joseph', role: 'Engineer', capacity: 40, costRate: 58, billRate: 0 },
      { id: 'p3', name: 'Vikram Bose', role: 'Engineer', capacity: 40, costRate: 62, billRate: 0 },
      { id: 'p4', name: 'Meera Pai', role: 'Designer', capacity: 40, costRate: 50, billRate: 0 },
      { id: 'p5', name: 'Joel Thomas', role: 'QA Engineer', capacity: 40, costRate: 42, billRate: 0 },
    ],
    work: [
      { id: 'w1', title: 'Checkout service', project: 'Web platform', owner: 'p1', hours: 34, billable: false },
      { id: 'w2', title: 'Search rewrite', project: 'Web platform', owner: 'p2', hours: 30, billable: false },
      { id: 'w3', title: 'Payments maintenance', project: 'Web platform', owner: 'p3', hours: 38, billable: false },
      { id: 'w4', title: 'Design QA and components', project: 'Web platform', owner: 'p4', hours: 28, billable: false },
      { id: 'w5', title: 'Release testing', project: 'Web platform', owner: 'p5', hours: 30, billable: false },
      { id: 'w6', title: 'Mobile app v2 — build', project: 'Mobile app v2', owner: null, role: 'Engineer', hours: 30, billable: false },
      { id: 'w7', title: 'Mobile app v2 — design', project: 'Mobile app v2', owner: null, role: 'Designer', hours: 10, billable: false },
      { id: 'w8', title: 'Mobile app v2 — testing', project: 'Mobile app v2', owner: null, role: 'QA Engineer', hours: 10, billable: false },
    ],
    budget: { amount: 0, spent: 0 },
  },
];

module.exports = { INDUSTRIES, WEEK_PATTERNS, DAY_NAMES, ZOHO_FEATURES, SCENARIOS };
