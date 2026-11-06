'use strict';
/* Smoke test for the recommendation layer. Run: node engine/recommend.smoke.js
 *
 * Most of these assert things the engine must NOT say. That is deliberate: a
 * deterministic engine repeats its mistakes identically forever, so the
 * negative cases matter more than the positive ones. */

const d = require('./digest');
const r = require('./recommend');
const B = require('../knowledge/benchmarks');

let failures = 0;
function check(label, cond, extra) {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra && !ok ? `\n      ${extra}` : ''}`);
}

const calendar = { businessDays: [1, 2, 3, 4, 5], holidays: [] };
const users = [
  { zpuid: '1', name: 'A. Kumar', budget: { cost_per_hour: 40 } },
  { zpuid: '2', name: 'R. Shah', budget: { cost_per_hour: 35 } },
  { zpuid: '3', name: 'M. Iyer', budget: { cost_per_hour: 55 } },
];
const workload = [
  { zpuid: '1', name: 'A. Kumar', total_work: 60, total_availability: 160, overall_allocation: 'under' },
  { zpuid: '2', name: 'R. Shah', total_work: 58, total_availability: 160, overall_allocation: 'under' },
  { zpuid: '3', name: 'M. Iyer', total_work: 216, total_availability: 160, overall_allocation: 'over' },
];

/* M. Iyer: 4 consecutive weeks of 6 nine-hour days = 54h/week.
 * Mondays in Jan 2026: 5th, 12th, 19th, 26th. */
const timelogs = [];
for (const monday of ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']) {
  const base = new Date(`${monday}T00:00:00Z`);
  for (let i = 0; i < 6; i++) {
    const dt = new Date(base); dt.setUTCDate(base.getUTCDate() + i);
    timelogs.push({ date: dt.toISOString().slice(0, 10), log_hour: 9,
      owner: { zpuid: '3', name: 'M. Iyer' } });
  }
  for (let i = 0; i < 3; i++) {
    const dt = new Date(base); dt.setUTCDate(base.getUTCDate() + i);
    timelogs.push({ date: dt.toISOString().slice(0, 10), log_hour: 5,
      owner: { zpuid: '1', name: 'A. Kumar' } });
  }
}

function digestWith(extra = {}) {
  return d.buildDigest({
    users, workload, timelogs, calendar, weeksCovered: 10,
    logHours: { billable_hours: 160, non_billable_hours: 111, total_hours: 271 },
    budgetInfo: {
      planned_cost: { amount: 100000, currency_code: 'USD' },
      actual_cost: { amount: 80000, currency_code: 'USD' },
      forecasted_cost: { amount: 118000, currency_code: 'USD' },
    },
    ...extra,
  });
}

const digest = digestWith();

console.log('\n--- duration-based overload (the corrected trigger) ---');

const ids = digest.findings.map(f => f.id);
check('detects 3+ consecutive weeks above 50h', ids.includes('overload.sustained'));
check('detects a sustained six-day pattern', ids.includes('overload.sixday'));
check('does NOT claim the 48h WTD average on a sub-17-week window',
  !ids.includes('overload.wtd'));
check('cites the evidence for the sustained finding',
  digest.findings.find(f => f.id === 'overload.sustained').detail.includes('Thomas & Raynar'));

console.log('\n--- anti-advice (must never appear) ---');

const agency = r.recommendFromDigest(digest, { industry: 'agency', billingModel: 'time_and_materials' });
const blob = JSON.stringify(agency).toLowerCase();

check('never says "increase utilisation"', !/increase utilisation|raise utilisation|improve utilisation/.test(blob));
check('never says "add contingency" or "add a buffer"', !/add contingency|add a buffer/.test(blob));
check('never says "improve your estimates"', !/improve your estimates/.test(blob));
check('never says "communicate with stakeholders"', !/communicate with stakeholders/.test(blob));
check('never recommends removing a person',
  !/\b(lay off|let go|terminate|headcount cut)\b/.test(blob));
check('never suggests a contingency percentage',
  !/\b\d{1,2}% contingency\b/.test(blob));

console.log('\n--- folklore is labelled, not asserted ---');

const folklore = agency.assessment.find(a => a.headline.includes('No published benchmark'));
check('agency band reported as having no published benchmark', !!folklore);
check('and redirects to their own prior period',
  folklore && folklore.detail.includes('own prior quarter'));

const ps = r.recommendFromDigest(digest,
  { industry: 'professional_services', billingModel: 'time_and_materials' });
check('sourced band cites the actual study',
  ps.assessment.some(a => a.detail.includes('SPI Research')));

console.log('\n--- billing model inverts the signal ---');

const fixed = r.recommendFromDigest(digest, { industry: 'agency', billingModel: 'fixed_fee' });
check('fixed fee: says the ratio is not the right measure',
  fixed.assessment.some(a => a.headline.includes('that is not the measure')));
check('fixed fee: explains hours erode margin, and names what to track',
  fixed.assessment.some(a => a.detail.includes('erode margin') &&
                             a.detail.includes('cost-to-complete')));
check('no internal verdict markers leak into user text',
  !/\b(BAD|GOOD) —/.test(JSON.stringify(fixed)));

const outcome = r.recommendFromDigest(digest, { industry: 'agency', billingModel: 'outcome' });
check('outcome-based: utilisation called near-meaningless',
  outcome.assessment.some(a => a.headline.includes('near-meaningless')));

const retainer = r.recommendFromDigest(digest, { industry: 'agency', billingModel: 'retainer' });
check('retainer: read against contracted hours',
  retainer.assessment.some(a => a.headline.includes('contracted hours')));

const internal = r.recommendFromDigest(digest, { industry: 'software_internal' });
check('in-house software: billable ratio called not meaningful',
  internal.assessment.some(a => a.headline.includes('not a meaningful measure')));

console.log('\n--- honesty about what it cannot measure ---');

check('states that billable ratio is not realisation',
  agency.gaps.some(g => g.includes('not realisation')));
check('warns when no billing model was supplied',
  r.recommendFromDigest(digest, { industry: 'agency' }).gaps.some(g => g.includes('assumes time-and-materials')));
check('flags users who logged no time', digest.gaps.some(g => g.includes('logged no time')));

console.log('\n--- audience branching ---');

check('agency lead talks about margin', agency.headline.includes('margin'));
check('internal lead talks about rebalancing before dropping work',
  r.recommendFromDigest(digest, { industry: 'software_internal' }).headline.includes('before dropping'));
/* Nobody idle to absorb the overload — the advice must change shape entirely. */
const noSlack = d.buildDigest({
  users, timelogs, calendar, weeksCovered: 10,
  workload: [
    { zpuid: '1', name: 'A. Kumar', total_work: 150, total_availability: 160, overall_allocation: 'optimal' },
    { zpuid: '2', name: 'R. Shah', total_work: 148, total_availability: 160, overall_allocation: 'optimal' },
    { zpuid: '3', name: 'M. Iyer', total_work: 216, total_availability: 160, overall_allocation: 'over' },
  ],
});
check('with no slack, internal is told which commitment to drop',
  JSON.stringify(r.recommendFromDigest(noSlack, { industry: 'software_internal' }))
    .includes('which commitment to drop'));
check('with no slack, agency is told which client work yields',
  JSON.stringify(r.recommendFromDigest(noSlack, { industry: 'agency' }))
    .includes('client work yields'));
check('with no slack it does not propose rebalancing',
  !r.recommendFromDigest(noSlack, {}).actions.some(a => a.title.includes('Rebalance')));

console.log('\n--- regional calendars (the 2022 UAE change) ---');

check('UAE is Monday-Friday, NOT Sunday-Thursday',
  B.WORKING_WEEK.uae.businessDays.join() === '1,2,3,4,5');
check('Saudi remains Sunday-Thursday',
  B.WORKING_WEEK.saudi.businessDays.join() === '0,1,2,3,4');

const uae = r.recommendFromProfile({ tracksTime: true, region: 'uae', industry: 'agency' });
check('UAE profile reports the Friday half-day', uae.assessment[1].headline.includes('Friday half-day'));
check('names the governing instrument without stating the law',
  uae.actions.some(a => a.detail.includes('Federal Decree-Law No. 33 of 2021')) &&
  !JSON.stringify(uae).includes('is required by law'));

console.log('\n--- intake-only path ---');

const raw = r.recommendFromProfile({ tracksTime: false, headcount: 3 });
check('level 0 when no time tracking', raw.assessment[0].headline.includes('level 0'));
check('next step is to start logging time', /log(ging)? time/i.test(raw.actions[0].detail));
check('action title is not a duplicate of its own detail',
  raw.actions[0].detail.trim() !== raw.actions[0].title.trim());
check('no maintainer notes leak into user-facing text',
  !/do NOT|TODO|FIXME/.test(JSON.stringify(uae) + JSON.stringify(raw)));
check('small teams told not to over-instrument', raw.actions.some(a => a.title.includes('light')));
check('intake output labelled indicative', raw.confidence === 'indicative');

console.log('\n--- unmeasurable input ---');

const thin = r.recommendFromDigest(digestWith({ weeksCovered: 1 }), {});
check('refuses rather than guessing', thin.confidence === 'none');

console.log('\n--- rendering ---');

const md = r.renderMarkdown(agency);
check('renders a markdown report', md.startsWith('# ') && md.includes('## Action plan'));
check('carries evidence grades', md.includes('*(hard)*'));

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}\n`);
process.exit(failures === 0 ? 0 : 1);
