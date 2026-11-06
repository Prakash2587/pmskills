'use strict';
/* ============================================================================
 * Deterministic recommendation layer.
 * ----------------------------------------------------------------------------
 * Turns either (a) a digest built from real portal data, or (b) an intake
 * profile from someone with no Zoho account, into an assessment + action plan.
 *
 * No model runs here. Same input always produces the same output — which for
 * financial advice is the point, not a limitation. The flip side is that an
 * unsourced claim in this file is repeated identically forever, so every
 * benchmark comes from ../knowledge with its provenance attached.
 *
 * Three rules this file holds to:
 *   1. NEVER recommend raising utilisation. It is the instruction that produces
 *      timesheet padding and bench-firing culture, and practitioners mock it.
 *   2. The billing model decides what utilisation MEANS. Under fixed fee, high
 *      hours on a project is margin erosion, not success. Most tools get this
 *      backwards.
 *   3. Folklore renders as folklore. A band with no published source is never
 *      presented as a target the user is failing.
 * ========================================================================== */

const B = require('../knowledge/benchmarks');
const P = require('../knowledge/practice');

const MATURITY = [
  { level: 0, name: 'Unmeasured', title: 'Start logging time',
    blocker: 'No time tracking. Nothing about cost or capacity can be answered from data.',
    next: 'Log time against tasks. Even partial, imperfect logging beats estimates — every other question on this ladder depends on it.' },
  { level: 1, name: 'Tracking time', title: 'Set a cost rate per person',
    blocker: 'Time is logged but people have no cost rates, so hours cannot become money.',
    next: 'Give each person a cost rate. This single field is what turns hours into money, and nothing financial works without it.' },
  { level: 2, name: 'Costed', title: 'Define availability and a calendar',
    blocker: 'Cost is known but capacity is not, so over- and under-load stay invisible.',
    next: 'Set per-person availability and the portal working calendar, then read allocation. Without a calendar, weekend and overtime figures are guesswork.' },
  { level: 3, name: 'Capacity-aware', title: 'Set project budgets',
    blocker: 'No budget set at project level, so there is nothing to vary against.',
    next: 'Set planned cost and hours per project, then start snapshotting them so a trend accumulates.' },
  { level: 4, name: 'Forecasting', title: 'Keep the snapshots running',
    blocker: null,
    next: 'Maintain the snapshots. Your own history is now the benchmark worth beating — and a better one than any industry average.' },
];

function maturityLevel(profile) {
  const { tracksTime, hasRates, hasCapacity, hasBudgets } = profile;
  let level = 0;
  if (tracksTime) level = 1;
  if (tracksTime && hasRates) level = 2;
  if (tracksTime && hasRates && hasCapacity) level = 3;
  if (tracksTime && hasRates && hasCapacity && hasBudgets) level = 4;
  return MATURITY[level];
}

function action(priority, title, detail, zohoPath) {
  return { priority, title, detail, zohoPath };
}

/** Agencies and internal teams need a different lead, not just different words. */
function audienceOf(profile) {
  if (profile.audience) return profile.audience;
  const internalIndustries = ['software_internal', 'nonprofit', 'internal'];
  return internalIndustries.includes(profile.industry) ? 'internal' : 'agency';
}

/* --- path A: real portal data -------------------------------------------- */

function recommendFromDigest(digest, profile = {}) {
  if (!digest.analysable) {
    return {
      headline: 'Not enough data to make a recommendation',
      assessment: [],
      actions: digest.reasons.map((r, i) => action(i + 1, 'Resolve before analysis', r, null)),
      gaps: digest.reasons,
      confidence: 'none',
    };
  }

  const audience = audienceOf(profile);
  const billing = B.BILLING_MODELS[profile.billingModel] || null;
  const by = id => digest.findings.find(f => f.id === id);

  // The raw billable finding is dropped here and replaced below by commentary
  // that knows the billing model and the provenance of any sector band.
  const assessment = digest.findings
    .filter(f => f.id !== 'billable.ratio')
    .map(f => ({ grade: f.grade, headline: f.headline, detail: f.detail }));
  const actions = [];

  const under = by('utilisation.under');
  const over = by('utilisation.over');

  /* 1. Rebalancing — but what it MEANS depends on the billing model. */
  if (under && over) {
    const fromNames = over.value.map(p => p.name).join(', ');
    const toNames = under.value.map(p => p.name).join(', ');
    const lead = audience === 'agency'
      ? 'This is capacity you have already paid for, so reassignment costs nothing and protects margin.'
      : 'This is the cheapest available move: no new headcount, no dropped commitment.';
    actions.push(action(1, 'Rebalance before you spend',
      `Move work from ${fromNames} to ${toNames}. ${lead} ` +
      `Peak demand currently exceeds availability for ${fromNames}, so this is resource LEVELLING — ` +
      `expect the end date to move if the work cannot be absorbed (APM).`,
      'Workload report → reassign tasks, or bulk-reassign from the task list.'));
  } else if (over) {
    actions.push(action(1, 'No slack to absorb the overload',
      `${over.value.map(p => p.name).join(', ')} are above available capacity and nobody is under-utilised. ` +
      `The honest options are scope, deadline or headcount — not effort. ` +
      (audience === 'internal'
        ? 'Decide which commitment to drop, and say so explicitly rather than letting it slip quietly.'
        : 'Decide which client work yields, before it becomes an overrun you absorb.'),
      'Set per-person availability, then use the Workload report to see the gap.'));
  }

  /* 2. Sustained overload — duration-based, evidence-backed. */
  const sustained = by('overload.sustained') || by('overload.sixday') || by('overload.wtd');
  if (sustained) {
    actions.push(action(actions.length + 1, 'Sustained overload is costing you output',
      `${sustained.detail} This is a duration finding, not a busy week — a single heavy week carries ` +
      `no evidenced penalty, which is why this only fires on a sustained pattern.`,
      'Workload report → check availability and redistribute the recurring load, not just this week\'s.'));
  }

  /* 3. Weekend work: check the calendar before concluding anything. */
  const burn = by('burn.offhours');
  if (burn && burn.value.share > 0.05) {
    actions.push(action(actions.length + 1, 'Verify the working calendar before acting on weekend work',
      `${burn.detail}. Confirm the portal's business days and holidays match this team's region first — ` +
      `a misconfigured calendar is the most common cause of a false weekend signal, and several regions ` +
      `do not use a Saturday-Sunday weekend at all.`,
      'Portal Settings → Business Hours and Holidays.'));
  }

  /* 4. Billable ratio — interpreted through the billing model, never a target. */
  const billableFinding = by('billable.ratio');
  if (billableFinding) {
    const note = billableCommentary(billableFinding, profile, billing);
    if (note.assessment) assessment.push(note.assessment);
    if (note.action) actions.push(action(actions.length + 1, note.action.title, note.action.detail, note.action.zohoPath));
  }

  /* 5. Budget variance. Zoho gives this directly; no EVM claim is made. */
  const budget = by('budget.variance');
  if (budget && budget.value.overrun > 0) {
    actions.push(action(actions.length + 1, 'Forecast exceeds plan',
      `Forecast overruns plan by ${budget.value.overrun} ${budget.value.currency || ''}. ` +
      `Rebalancing above may absorb part of it; the remainder is a scope or budget conversation. ` +
      `No contingency percentage is suggested here — no standards body prescribes one, and AACE requires ` +
      `contingency to be derived from risk analysis rather than a flat uplift.`,
      'Project → Budget. Set a revised budget and enable variance alerts.'));
  }

  /* 6. Snapshotting — the only honest route to a trend. */
  actions.push(action(actions.length + 1, 'Start a cost baseline of your own',
    'Zoho keeps no historical cost baseline — its baselines store schedule only, with no hours and no cost. ' +
    'Snapshot the budget figures on a schedule and you will own a genuine trend within a few weeks. ' +
    'Your own prior period is a better benchmark than any industry average.',
    'Schedule a recurring snapshot of planned / actual / forecasted cost per project.'));

  return {
    headline: buildHeadline(digest, audience),
    audience,
    assessment,
    actions,
    gaps: [...digest.gaps, ...standingGaps(digest, profile)],
    confidence: digest.gaps.length === 0 ? 'high' : 'qualified',
  };
}

/**
 * Billable ratio commentary. This is where most tools say "increase utilisation"
 * and lose the room. We never do. We report, contextualise honestly, and where
 * the only available band is folklore, we say so.
 */
function billableCommentary(finding, profile, billing) {
  const band = B.UTILISATION[profile.industry];
  const ratio = finding.value.ratio;
  const asPct = Math.round(ratio * 100);

  // Billing models where the metric is misleading or inverted.
  if (billing && billing.utilisationMeaning === 'inverted') {
    return { assessment: { grade: 'derived',
      headline: `Billable ratio is ${asPct}%, but under ${billing.label} that is not the measure`,
      detail: `${billing.high} Track ${billing.keyMetric} instead.` } };
  }
  if (billing && billing.utilisationMeaning === 'not-applicable') {
    return { assessment: { grade: 'derived',
      headline: `Utilisation is near-meaningless under ${billing.label}`,
      detail: `Use ${billing.keyMetric} instead.` } };
  }
  if (billing && billing.utilisationMeaning === 'bounded') {
    return { assessment: { grade: 'derived',
      headline: `Under ${billing.label}, read this against contracted hours, not against a target`,
      detail: `${billing.high} ${billing.low}` } };
  }

  // Industries where the metric does not apply at all.
  if (band && band.applicable === false) {
    return { assessment: { grade: 'hard',
      headline: `Billable ratio is not a meaningful measure for ${band.label}`,
      detail: band.note } };
  }

  // A genuinely sourced band.
  if (band && band.provenance === 'sourced') {
    const ref = band.actual ?? band.median;
    return { assessment: { grade: 'hard',
      headline: `Billable ratio is ${asPct}%, against a published figure of ${Math.round(ref * 100)}% for ${band.label}`,
      detail: `${band.source.name} (${band.source.detail}). Denominators differ between studies, so treat this ` +
              `as orientation, not a league table. Your own prior period remains the better comparison.` } };
  }

  // Folklore: report the number, refuse to make it a target.
  if (band && band.provenance === 'folklore') {
    return { assessment: { grade: 'derived',
      headline: `Billable ratio is ${asPct}%. No published benchmark exists for ${band.label}`,
      detail: `Figures circulate widely for this sector but none trace to a published study — ${band.note} ` +
              `Compare against your own prior quarter instead.` } };
  }

  return { assessment: { grade: 'hard',
    headline: `Billable ratio is ${asPct}%`,
    detail: 'No sector benchmark applied. Compare against your own prior period.' } };
}

/** Gaps that are true of the method itself, not of this particular dataset. */
function standingGaps(digest, profile) {
  const gaps = [];
  // Honest: we can compute billable ratio, but NOT realisation.
  if (digest.findings.some(f => f.id === 'billable.ratio')) {
    gaps.push('Billable ratio is not realisation. Realisation needs hours actually invoiced and collected, ' +
              'which lives in billing data rather than time logs. Read the ratio alongside invoicing before ' +
              'drawing conclusions about margin.');
  }
  if (!profile.billingModel) {
    gaps.push('No billing model supplied. Utilisation means opposite things under time-and-materials and ' +
              'fixed fee, so this reading assumes time-and-materials.');
  }
  return gaps;
}

function buildHeadline(digest, audience) {
  const under = digest.capacity.under.length;
  const over = digest.capacity.over.length;
  if (under && over) {
    return audience === 'agency'
      ? `${over} over-allocated and ${under} idle — margin is leaking through the gap`
      : `${over} over-allocated, ${under} under-utilised — rebalance before dropping anything`;
  }
  if (over) return `${over === 1 ? '1 person is' : `${over} people are`} above capacity with no slack to absorb it`;
  if (under) return `${under === 1 ? '1 person has' : `${under} people have`} unused capacity`;
  return 'Capacity is broadly balanced';
}

/* --- path B: no portal, intake only -------------------------------------- */

function recommendFromProfile(profile = {}) {
  const maturity = maturityLevel(profile);
  const week = B.WORKING_WEEK[profile.region] || B.WORKING_WEEK.default;
  const band = B.UTILISATION[profile.industry];
  const billing = B.BILLING_MODELS[profile.billingModel];
  const audience = audienceOf(profile);

  const assessment = [
    { grade: 'hard', headline: `Measurement maturity: ${maturity.name} (level ${maturity.level} of 4)`,
      detail: maturity.blocker || 'All four foundations are in place.' },
    { grade: 'hard', headline: `Assumed working week: ${week.label}`,
      detail: week.note || 'Confirm this before any weekend or overtime figure is trusted.' },
  ];

  if (band && band.applicable === false) {
    assessment.push({ grade: 'hard',
      headline: `Billable ratio will not be a useful measure for ${band.label}`,
      detail: band.note });
  }
  if (billing) {
    assessment.push({ grade: 'derived',
      headline: `Under ${billing.label}, the metric that matters is ${billing.keyMetric}`,
      detail: `${billing.high}` });
  }

  const actions = [action(1, maturity.title, maturity.next,
    zohoPathForMaturity(maturity.level))];

  if (profile.headcount && profile.headcount < 5) {
    actions.push(action(actions.length + 1, 'Keep the instrumentation light',
      `At ${profile.headcount} people, formal capacity planning costs more than it returns. ` +
      `Time logging plus cost rates answers most questions at this size.`, null));
  }

  const instrument = B.WORKING_TIME_INSTRUMENTS[profile.region];
  if (instrument) {
    actions.push(action(actions.length + 1, 'Verify local working-time rules',
      `Working-time and overtime rules differ by jurisdiction and this assessment does not account for them. ` +
      `The relevant instrument here is the ${instrument}. Confirm with whoever owns employment compliance ` +
      `before acting on any recommendation that changes hours.`, null));
  }

  return {
    headline: `${maturity.name} — ${maturity.blocker || 'ready to forecast'}`,
    audience,
    assessment,
    actions,
    gaps: ['Based on self-reported answers, not portal data. Connect a portal for measured findings.'],
    confidence: 'indicative',
  };
}

function zohoPathForMaturity(level) {
  return [
    'Enable Timesheets, then log time against tasks.',
    'Users → set a cost rate per person.',
    'Set per-person availability and the portal working calendar, then open the Workload report.',
    'Project → Budget. Set planned cost and hours.',
    'Schedule recurring budget snapshots.',
  ][level];
}

/* --- report rendering ----------------------------------------------------- */

function renderMarkdown(result, title = 'Cost and capacity assessment') {
  const L = [`# ${title}`, '', `**${result.headline}**`, '',
    `Confidence: ${result.confidence}`, '', '## Assessment', ''];

  for (const a of result.assessment) L.push(`- *(${a.grade})* **${a.headline}** — ${a.detail}`);

  L.push('', '## Action plan', '');
  for (const a of result.actions) {
    L.push(`**${a.priority}. ${a.title}**`, '', a.detail, '');
    if (a.zohoPath) L.push(`> In Zoho Projects: ${a.zohoPath}`, '');
  }

  if (result.gaps && result.gaps.length) {
    L.push('## What this does not cover', '');
    for (const g of result.gaps) L.push(`- ${g}`);
  }
  return L.join('\n');
}

module.exports = {
  recommendFromDigest, recommendFromProfile, maturityLevel, renderMarkdown,
  audienceOf, billableCommentary, MATURITY,
  ANTI_ADVICE: P.ANTI_ADVICE,
};
