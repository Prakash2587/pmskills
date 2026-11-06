'use strict';
/* ============================================================================
 * Knowledge layer — practitioner reality. Data only, no logic.
 * ----------------------------------------------------------------------------
 * Sourced from vendor communities (Atlassian, Asana, monday, ClickUp,
 * Smartsheet, Workfront), Hacker News, Medium and LinkedIn.
 *
 * PROVENANCE CAVEAT: reddit.com was NOT reachable during the scan. Reddit
 * quotes below came secondhand via blogs that cite threads with permalinks and
 * are marked `secondhand`. Treat them as indicative, not verified.
 *
 * The single most useful line from the whole scan: the gap is always THE JOIN —
 * time entries to rate to budget to client, across projects. Nobody is asking
 * for a better Gantt chart.
 * ========================================================================== */

/* --- ranked problem patterns ---------------------------------------------- */
/* `phrasing` exists for trigger matching: people describe the symptom, never
 * the textbook term. `adviceShape` is what good output looks like. */

const PROBLEM_PATTERNS = [
  {
    id: 'plan-vs-actual-invisible',
    rank: 1,
    formal: 'Planned effort and actual effort are never compared',
    phrasing: ['projected vs actual', 'how much budget is left', 'actual hours worked vs planned capacity'],
    whyHard: 'Estimates live on tasks, actuals live in a timesheet tool, and nobody re-baselines. By week three the plan is fiction.',
    workaround: 'A Google Sheet embedded in the project to track money remaining.',
    adviceShape: 'A weekly burn-vs-plan delta per person and project, each with a named cause. Not a dashboard.',
    automatability: 'very high',
    recurrence: 'every community sampled',
  },
  {
    id: 'overallocation-by-accumulation',
    rank: 2,
    formal: 'Cross-project overallocation with no visible cause',
    phrasing: ['my team is drowning', 'everyone is at 120%', 'which tasks are pushing them over'],
    whyHard: 'Overload is cross-project. Each PM sees only their own slice, and fixing it needs authority over all of them.',
    workaround: 'A master spreadsheet with conditional formatting above 120%.',
    adviceShape: 'Name the 2-3 SPECIFIC tasks and the SPECIFIC week causing the breach, and say which project should yield.',
    automatability: 'very high',
    note: 'Practitioners can already see that someone is overloaded. What no tool tells them is which commitments caused it.',
  },
  {
    id: 'scope-creep-eaten',
    rank: 3,
    formal: 'Out-of-scope work absorbed rather than billed',
    phrasing: ['small favours', 'they keep adding little things', 'unpaid work', 'I kept saying yes'],
    whyHard: 'The change-order conversation costs relationship capital now to recover money later. Most never have it.',
    workaround: 'A private "favours ledger" spreadsheet the client never sees.',
    adviceShape: 'Flag the overage at 60-70% burn WITH the specific extra requests listed — while it is still a conversation and not an invoice dispute.',
    automatability: 'high',
    audience: 'agency, consultancy, freelance',
    secondhand: true,
  },
  {
    id: 'capacity-maths-wrong',
    rank: 4,
    formal: 'Tool capacity calculations do not match reality',
    phrasing: ['the workload bar is wrong', 'the hours do not add up', 'it assumes five work days'],
    whyHard: 'Tools smear effort evenly across a date range. Real work is lumpy, and part-timers and holidays break the model.',
    workaround: 'Faking date ranges to force the bar to look right.',
    adviceShape: 'Use logged-hours shape, not planned shape. Normalise for part-time FTE and the real calendar.',
    automatability: 'medium',
  },
  {
    id: 'utilisation-gamed',
    rank: 5,
    formal: 'Utilisation as a target corrupts the data it measures',
    phrasing: ['padding admin time', 'hitting my number', 'utilisation targets'],
    whyHard: 'The metric is also the performance review, so the input is gamed. One HN account describes staff being let go minutes after rolling off.',
    adviceShape: 'Pair utilisation with REALISATION (hours billed and collected vs hours logged). A firm with lower utilisation can be more profitable.',
    automatability: 'medium',
    hardRule: 'NEVER recommend "increase utilisation".',
  },
  {
    id: 'timesheets-reconstructed',
    rank: 6,
    formal: 'Time data is reconstructed from memory, not recorded live',
    phrasing: ['I fill it in on Friday', 'closer to monthly', 'I only track time so we get paid'],
    whyHard: 'Every downstream cost figure inherits this error, so a confident "your data says X" lands badly.',
    adviceShape: 'Hedge confidence explicitly. Report trends, never single-day precision. Detect backfilled or suspiciously round entries and caveat the finding.',
    automatability: 'high',
  },
  {
    id: 'no-alerting',
    rank: 7,
    formal: 'Reporting is after-the-fact; nothing warns you in time',
    phrasing: ['notify me at 80% of budget', 'cap assignments at capacity', 'found out too late'],
    whyHard: 'Tools report history. The moment that matters is before the threshold, not after.',
    adviceShape: 'Threshold alerting with a named owner and a specific remaining amount.',
    automatability: 'very high',
  },
];

/* --- advice to never generate --------------------------------------------- */
/* Each of these was found being actively mocked by practitioners. Generating
 * any of them marks the output as consultant-speak and costs all credibility. */

const ANTI_ADVICE = [
  { never: 'increase utilisation',
    because: 'It is the instruction that causes timesheet padding and bench-firing culture.',
    instead: 'Show realisation alongside utilisation and let them judge.' },
  { never: 'add contingency / just add a buffer',
    because: 'Underspecified, and PMI itself calls padding about the worst habit a project manager can develop.',
    instead: 'Give an empirical estimate-vs-actual multiplier from their own history.' },
  { never: 'improve your estimates',
    because: 'Practitioners report that demanding accuracy simply produces padded estimates.',
    instead: 'Measure the bias and apply it, rather than asking people to be better.' },
  { never: 'communicate with stakeholders more',
    because: 'Content-free. It is the single most mocked line in PM advice.',
    instead: 'Name the person, the decision needed, and the date it is needed by.' },
  { never: 'track time more precisely',
    because: 'Precision theatre. A PMO tracking to 15-minute granularity still missed its dates.',
    instead: 'Improve coverage and timeliness, not granularity.' },
];

/* --- audience branching ---------------------------------------------------- */
/* Agencies and internal teams need a different LEAD, not just different wording. */

const AUDIENCE = {
  agency: {
    currency: 'money left on the table',
    leadWith: 'realisation and margin per client',
    blindSpot: 'Non-billable overhead — quotes, onboarding, research — is invisible in every tool.',
    politics: 'The bench is a firing risk, so planners hide slack rather than report it. Treat low utilisation carefully.',
  },
  internal: {
    currency: 'opportunity cost',
    leadWith: 'cross-project overallocation and which commitment to drop',
    blindSpot: 'No revenue signal exists at all, so billable ratio is meaningless here.',
    politics: 'Competing project owners each see only their own slice.',
  },
};

/* --- the structural insight ------------------------------------------------ */

const CORE_GAP = {
  statement: 'The missing capability is always the JOIN: time entries to rate to budget to client, across projects.',
  evidence: [
    'Rate cards requested repeatedly; formulas limited to time multiplied by a single rate.',
    'No client-level or folder-level budget object.',
    'Capacity data not exposed via API (Asana; Jira has no public endpoint to write the Plans capacity field).',
    'Placeholder or unnamed resources cannot be assigned to tasks.',
  ],
  implication: 'Zoho Projects already holds every side of that join — timelogs, per-user rates, project budget, client. That is the genuine product advantage worth leading with.',
};

/* --- data-quality caveats to attach --------------------------------------- */

const DATA_QUALITY_FLAGS = [
  { id: 'backfilled', test: 'logs entered many days after the work date', caveat: 'Time appears reconstructed rather than recorded; treat totals as approximate.' },
  { id: 'round-numbers', test: 'high share of whole-hour or 4h/8h entries', caveat: 'Entries look estimated rather than measured.' },
  { id: 'unapproved', test: 'material share of logs unapproved', caveat: 'Figures may move on approval.' },
  { id: 'sparse-coverage', test: 'people with no logs in the window', caveat: 'Coverage gaps understate effort and distort every per-person figure.' },
];

module.exports = {
  PROBLEM_PATTERNS, ANTI_ADVICE, AUDIENCE, CORE_GAP, DATA_QUALITY_FLAGS,
};
