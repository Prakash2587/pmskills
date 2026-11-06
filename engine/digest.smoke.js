'use strict';
/* Smoke test for the digest engine. Run: node engine/digest.smoke.js
 * Proves the guardrails fire before it proves the happy path — a wrong refusal
 * is cheap, a confident wrong number is not. */

const d = require('./digest');

let failures = 0;
function check(label, cond, extra) {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra && !ok ? `\n      ${extra}` : ''}`);
}

const calendar = { businessDays: [1, 2, 3, 4, 5], holidays: ['2026-01-26'] };

const users = [
  { zpuid: '1', name: 'A. Kumar', budget: { cost_per_hour: 40 } },
  { zpuid: '2', name: 'R. Shah', budget: { cost_per_hour: 35 } },
  { zpuid: '3', name: 'M. Iyer', budget: { cost_per_hour: 55 } },
  { zpuid: '4', name: 'T. Nair' }, // deliberately no rate
];

const workload = [
  { zpuid: '1', name: 'A. Kumar', total_work: 66, total_availability: 160, overall_allocation: 'under' },
  { zpuid: '2', name: 'R. Shah', total_work: 61, total_availability: 160, overall_allocation: 'under' },
  { zpuid: '3', name: 'M. Iyer', total_work: 179, total_availability: 160, overall_allocation: 'over' },
  { zpuid: '4', name: 'T. Nair', total_work: 140, total_availability: 160, overall_allocation: 'optimal' },
];

// 2026-01-24 is a Saturday, 2026-01-25 a Sunday, 2026-01-26 a holiday.
const timelogs = [
  { date: '2026-01-20', log_hour: 8, owner: { zpuid: '3', name: 'M. Iyer' } },
  { date: '2026-01-24', log_hour: 6, owner: { zpuid: '3', name: 'M. Iyer' } },
  { date: '2026-01-25', log_hour: 4, owner: { zpuid: '3', name: 'M. Iyer' } },
  { date: '2026-01-26', log_hour: 5, owner: { zpuid: '4', name: 'T. Nair' } },
  { date: '2026-01-21', log_hour: 7, owner: { zpuid: '1', name: 'A. Kumar' } },
];

console.log('\n--- guardrails ---');

const tooShort = d.buildDigest({ users, workload, timelogs, calendar, weeksCovered: 2 });
check('refuses under 4 weeks of data', tooShort.analysable === false);

const noCalendar = d.buildDigest({ users, workload, timelogs, calendar: null, weeksCovered: 8 });
check('refuses to assume Mon-Fri when no calendar supplied', noCalendar.analysable === false);

console.log('\n--- analysis ---');

const out = d.buildDigest({
  users, workload, timelogs, calendar, weeksCovered: 8,
  logHours: { billable_hours: 22, non_billable_hours: 8, total_hours: 30 },
  budgetInfo: {
    planned_cost: { amount: 120000, currency_code: 'USD' },
    actual_cost: { amount: 98000, currency_code: 'USD' },
    forecasted_cost: { amount: 141000, currency_code: 'USD' },
  },
  unapprovedShare: 0.18,
});

check('analysable with good data', out.analysable === true);

const ids = out.findings.map(f => f.id);
check('flags under-utilisation', ids.includes('utilisation.under'));
check('flags over-allocation', ids.includes('utilisation.over'));
check('under-utilisation graded hard (Zoho gave the verdict)',
  out.findings.find(f => f.id === 'utilisation.under')?.grade === 'hard');

const burn = out.findings.find(f => f.id === 'burn.offhours');
// 6 + 4 + 5 = 15 off-calendar hours of 30 total
check('off-calendar hours counted incl. holiday', burn?.value.offHours === 15,
  `got ${burn?.value.offHours}`);
check('off-calendar cost excludes the rate-less user',
  burn?.value.cost === 6 * 55 + 4 * 55, `got ${burn?.value.cost}`);
check('marks cost as partial when a rate is missing', burn?.value.costIncomplete === true);

check('budget overrun detected',
  out.findings.find(f => f.id === 'budget.variance')?.value.overrun === 21000);
check('billable ratio from Zoho aggregate',
  Math.round(out.findings.find(f => f.id === 'billable.ratio').value.ratio * 100) === 73);

check('gap raised for missing cost rate', out.gaps.some(g => g.includes('T. Nair')));
check('gap raised for unapproved logs', out.gaps.some(g => g.includes('unapproved')));

console.log('\n--- what-if ---');

const { rates } = d.rateIndex(users);
const model = d.modelHoursChange({
  people: [
    { zpuid: '1', name: 'A. Kumar', verdict: 'under' },
    { zpuid: '2', name: 'R. Shah', verdict: 'under' },
    { zpuid: '3', name: 'M. Iyer', verdict: 'over' },
  ],
  deltaHoursPerWeek: 2, weeks: 12, rates,
});

check('refuses to add hours to an over-allocated person',
  model.refused.length === 1 && model.refused[0].name === 'M. Iyer');
check('costs only the people it actually applied to',
  model.costDelta === (2 * 12 * 40) + (2 * 12 * 35), `got ${model.costDelta}`);

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}\n`);
process.exit(failures === 0 ? 0 : 1);
