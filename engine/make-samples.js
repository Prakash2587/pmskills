'use strict';
/* Regenerates sample reports so template changes can be eyeballed.
 * Run: node engine/make-samples.js */

const fs = require('fs');
const path = require('path');
const d = require('./digest');
const r = require('./recommend');

const outDir = path.join(__dirname, 'samples');
fs.mkdirSync(outDir, { recursive: true });

/* A believable 6-person delivery team: one person drowning, two idle,
 * a chunk of weekend work, and a forecast drifting past plan. */
const users = [
  { zpuid: '1', name: 'A. Kumar', budget: { cost_per_hour: 40 } },
  { zpuid: '2', name: 'R. Shah', budget: { cost_per_hour: 35 } },
  { zpuid: '3', name: 'M. Iyer', budget: { cost_per_hour: 55 } },
  { zpuid: '4', name: 'S. Pillai', budget: { cost_per_hour: 45 } },
  { zpuid: '5', name: 'D. Roy', budget: { cost_per_hour: 50 } },
  { zpuid: '6', name: 'T. Nair' }, // no rate on purpose
];

const workload = [
  { zpuid: '1', name: 'A. Kumar', total_work: 66, total_availability: 160, overall_allocation: 'under' },
  { zpuid: '2', name: 'R. Shah', total_work: 58, total_availability: 160, overall_allocation: 'under' },
  { zpuid: '3', name: 'M. Iyer', total_work: 186, total_availability: 160, overall_allocation: 'over' },
  { zpuid: '4', name: 'S. Pillai', total_work: 148, total_availability: 160, overall_allocation: 'optimal' },
  { zpuid: '5', name: 'D. Roy', total_work: 139, total_availability: 160, overall_allocation: 'optimal' },
  { zpuid: '6', name: 'T. Nair', total_work: 151, total_availability: 160, overall_allocation: 'optimal' },
];

const timelogs = [];
// 10 weeks of logs; M. Iyer works most Saturdays, everyone else does not.
for (let w = 0; w < 10; w++) {
  const monday = new Date(Date.UTC(2026, 0, 5 + w * 7));
  for (const u of users) {
    for (let day = 0; day < 5; day++) {
      const dt = new Date(monday); dt.setUTCDate(monday.getUTCDate() + day);
      timelogs.push({ date: dt.toISOString().slice(0, 10), log_hour: 7,
        owner: { zpuid: u.zpuid, name: u.name } });
    }
  }
  const sat = new Date(monday); sat.setUTCDate(monday.getUTCDate() + 5);
  timelogs.push({ date: sat.toISOString().slice(0, 10), log_hour: 6,
    owner: { zpuid: '3', name: 'M. Iyer' } });
}

const totalHours = timelogs.reduce((s, l) => s + l.log_hour, 0);

const digest = d.buildDigest({
  users, workload, timelogs,
  calendar: { businessDays: [1, 2, 3, 4, 5], holidays: ['2026-01-26'] },
  weeksCovered: 10,
  logHours: {
    billable_hours: Math.round(totalHours * 0.61),
    non_billable_hours: Math.round(totalHours * 0.39),
    total_hours: totalHours,
  },
  budgetInfo: {
    planned_cost: { amount: 240000, currency_code: 'USD' },
    actual_cost: { amount: 198400, currency_code: 'USD' },
    forecasted_cost: { amount: 271800, currency_code: 'USD' },
  },
  unapprovedShare: 0.14,
});

const measured = r.recommendFromDigest(digest,
  { industry: 'agency', billingModel: 'time_and_materials' });
fs.writeFileSync(path.join(outDir, 'measured.md'),
  r.renderMarkdown(measured, 'Cost and capacity assessment — Apex Delivery (10 weeks)'));

/* Same portal, fixed-fee contract: the utilisation reading should invert. */
const fixedFee = r.recommendFromDigest(digest,
  { industry: 'agency', billingModel: 'fixed_fee' });
fs.writeFileSync(path.join(outDir, 'measured-fixed-fee.md'),
  r.renderMarkdown(fixedFee, 'Cost and capacity assessment — same data, fixed-fee contract'));

const intake = r.recommendFromProfile({
  tracksTime: true, hasRates: false, hasCapacity: false, hasBudgets: false,
  headcount: 12, region: 'uae', industry: 'professional_services',
  billingModel: 'fixed_fee',
});
fs.writeFileSync(path.join(outDir, 'intake.md'),
  r.renderMarkdown(intake, 'Cost and capacity assessment — self-reported'));

console.log(`wrote ${outDir}/ measured.md, measured-fixed-fee.md, intake.md`);
