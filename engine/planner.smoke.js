'use strict';
/* Smoke test for the planner. Run: node engine/planner.smoke.js */

const P = require('./planner');
const C = require('../knowledge/catalog');

let failures = 0;
function check(label, cond, extra) {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra !== undefined && !ok ? `\n      ${extra}` : ''}`);
}

function inputFor(key, orgOverrides = {}) {
  const s = JSON.parse(JSON.stringify(C.SCENARIOS.find(x => x.key === key)));
  return {
    org: { name: '', weekPattern: 'mon_fri', hoursPerDay: 8, currency: '$', jurisdiction: '',
      horizonWeeks: s.horizonWeeks || 12, ...s.org, ...orgOverrides },
    people: s.people, work: s.work, budget: s.budget,
  };
}
const stepText = (input, steps) => steps.map(s => P.describeStep(s, input));

/* ------------------------------------------------------------------ */
console.log('\n--- scenario: overloaded team ---');
{
  const input = inputFor('overloaded');
  const steps = P.proposePlan(input);
  const a = P.assess(input, steps);

  check('finds 14h/week of overload before the plan', a.before.totals.overHours === 14, a.before.totals.overHours);
  check('names the specific work an overloaded person carries',
    a.findings.find(f => f.id === 'over.p1').detail.includes('API integration'));
  check('proposes two moves', steps.length === 2, JSON.stringify(stepText(input, steps)));
  check('moves the closest-fitting whole item to a same-role colleague',
    steps[0].workId === 'w3' && steps[0].to === 'p3' && steps[0].hours === 14, JSON.stringify(steps[0]));
  check('splits off only the hours needed when no whole item fits',
    steps[1].workId === 'w7' && steps[1].hours === 2, JSON.stringify(steps[1]));
  check('plan clears the overload', a.after.totals.overHours === 0, a.after.totals.overHours);
  check('headline says the plan resolves it', a.headline.includes('resolves all 14h'), a.headline);

  const v = P.validate(input, steps);
  check('capacity rule passes after the plan', v[0].state === 'pass');
  check('cross-role move is flagged, not hidden',
    v.find(x => x.rule.includes('within a role')).state === 'warn');

  const blob = JSON.stringify(a.findings) + JSON.stringify(v) + a.headline;
  check('no "under-utilised" band and no 85% anywhere', !/under-?utili[sz]ed|85%/i.test(blob));
  check('never says to increase utilisation', !/increase utili[sz]ation/i.test(blob));
  check('every finding binds to a Zoho Projects feature',
    a.findings.every(f => C.ZOHO_FEATURES[f.feature]));
  check('grades are reported/derived only — nothing claims to be measured',
    a.findings.every(f => f.grade === 'reported' || f.grade === 'derived'));
}

/* ------------------------------------------------------------------ */
console.log('\n--- editing the plan ---');
{
  const input = inputFor('overloaded');
  const steps = P.proposePlan(input);

  const sameRole = P.refine('same role only', input, steps, {});
  check('"same role only" leaves the QA overload unresolved',
    P.assess(sameRole.input, sameRole.steps).residual.overHours === 2);
  check('...and validation then fails the capacity rule',
    P.validate(sameRole.input, sameRole.steps)[0].state === 'fail');

  const noRhea = P.refine("don't touch Rhea", input, steps, {});
  check('"don\'t touch Rhea" routes the work elsewhere',
    noRhea.understood && noRhea.steps.every(s => s.to !== 'p3'), JSON.stringify(noRhea.steps));

  const keep = P.refine('keep API integration', input, steps, {});
  check('"keep X" locks the item and moves something else instead',
    keep.steps.every(s => s.workId !== 'w3') && P.assess(keep.input, keep.steps).after.totals.overHours === 0,
    JSON.stringify(stepText(keep.input, keep.steps)));

  const added = P.refine('move 6h of Platform build to Arjun', input, steps, {});
  check('"move 6h of X to Y" appends a partial move',
    added.steps.length === 3 && added.steps[2].hours === 6 && added.steps[2].to === 'p2');

  const removed = P.refine('remove step 1', input, steps, {});
  check('"remove step 1" removes it', removed.steps.length === 1 && removed.steps[0].workId === 'w7');

  const junk = P.refine('make everything better please', input, steps, {});
  check('unrecognised text is refused honestly, with examples',
    junk.understood === false && junk.summary.includes('Try:') && junk.steps.length === steps.length);

  const cutShort = P.assess(input, [steps[1]]);
  check('removing a step is reported as "room remains", not "no capacity"',
    cutShort.residual.absorbable === true && cutShort.headline.includes('has room to absorb') &&
    !cutShort.headline.includes('headcount'), cutShort.headline);
  check('a genuine gap is still called a scope, date or headcount decision',
    P.assess(sameRole.input, sameRole.steps, sameRole.opts).residual.absorbable === false);

  const reordered = [steps[1], steps[0]];
  check('reordered plan still applies', P.assess(input, reordered).after.totals.overHours === 0);

  const broken = [{ id: 'x1', kind: 'move', workId: 'w3', to: 'nobody', hours: 14 }, ...steps];
  const res = P.applyPlan(input, broken);
  check('a nonsense step is skipped and reported, not thrown', res.issues.length === 1 && res.issues[0].stepId === 'x1');
  check('...and shows up as a validation warning',
    P.validate(input, broken).some(x => x.rule.includes('can be applied') && x.state === 'warn'));

  const split = P.applyPlan(input, steps).work.find(w => w.splitOf === 'w7');
  check('a partial move splits the work item', split && split.hours === 2 && split.owner === 'p2');
}

/* ------------------------------------------------------------------ */
console.log('\n--- scenario: burning budget (fixed fee) ---');
{
  const input = inputFor('budget');
  const steps = P.proposePlan(input);
  const a = P.assess(input, steps);

  check('weekly cost is hours x cost rate', a.before.totals.weeklyCost === 9150, a.before.totals.weeklyCost);
  check('forecast = spent + weekly cost x remaining weeks', a.budget.before.forecast === 151200, a.budget.before.forecast);
  check('overrun computed', a.budget.before.over === 31200);
  check('headline admits rebalancing does not fix the budget', a.headline.includes('does not close that'), a.headline);
  check('fixed fee: billable ratio called not the measure',
    a.findings.find(f => f.id === 'billable').headline.includes('not the measure'));

  const v = P.validate(input, steps);
  const budgetRule = v.find(x => x.rule.includes('within budget'));
  check('budget rule fails', budgetRule.state === 'fail');
  check('no contingency percentage is suggested', !/\d+\s*% contingency/i.test(JSON.stringify(v)));

  const withCut = [...steps, { id: 'd1', kind: 'descope', workId: 'w3', hours: 10 }];
  check('a descope step lowers the forecast',
    P.assess(input, withCut).budget.after.forecast === 151200 - 10 * 60 * 8,
    P.assess(input, withCut).budget.after.forecast);
}

/* ------------------------------------------------------------------ */
console.log('\n--- scenario: incoming work (in-house team) ---');
{
  const input = inputFor('incoming');
  const steps = P.proposePlan(input);
  const a = P.assess(input, steps);

  check('50h/week arrives unowned', a.before.totals.unassignedHours === 50);
  check('plan places 38h and leaves an honest 12h gap', a.residual.unassignedHours === 12, a.residual.unassignedHours);
  check('the gap is Engineer work', a.residual.work[0].role === 'Engineer');
  check('engineering work is never quietly handed to another role',
    steps.filter(s => s.workId === 'w6').every(s => ['p1', 'p2', 'p3'].includes(s.to)));
  check('headline calls it a scope, date or headcount decision', a.headline.includes('scope, date or headcount'));
  check('billable ratio dismissed for an in-house team',
    a.findings.find(f => f.id === 'billable').headline.includes('not a useful measure'));

  const hired = [...steps,
    { id: 'h1', kind: 'hire', role: 'Engineer', capacity: 40, costRate: 60 },
    { id: 'h2', kind: 'move', workId: 'w6', to: 'hire-h1', hours: 12 }];
  check('adding a hire and assigning the gap resolves it',
    P.assess(input, hired).residual.unassignedHours === 0);
  check('the hire appears in the Zoho payload flagged as to be hired',
    P.buildZohoPayload(input, hired).users.some(u => u.to_be_hired));
}

/* ------------------------------------------------------------------ */
console.log('\n--- calendar, payload, hand-off ---');
{
  check('UAE week with half-day Friday is 36h at 8h/day',
    P.weekHours({ weekPattern: 'mon_fri_half', hoursPerDay: 8 }).hours === 36);
  check('custom four-day week is 32h',
    P.weekHours({ weekPattern: 'custom', workDays: [1, 2, 3, 4], hoursPerDay: 8 }).hours === 32);

  const short = inputFor('overloaded', { weekPattern: 'custom', workDays: [1, 2, 3, 4] });
  check('capacity above the working calendar is flagged',
    P.validate(short, P.proposePlan(short)).find(x => x.rule.includes('calendar')).state === 'warn');

  const heavy = inputFor('overloaded', { jurisdiction: 'uae', weekPattern: 'mon_fri_half' });
  const hv = P.validate(heavy, []);
  check('sustained overload fails when nothing is done', hv.find(x => x.rule === 'No sustained overload').state === 'fail');
  check('names the instrument without stating the law',
    hv.some(x => x.detail.includes('Federal Decree-Law No. 33 of 2021')) && !/is required by law/.test(JSON.stringify(hv)));

  const input = inputFor('overloaded');
  const steps = P.proposePlan(input);
  const payload = P.buildZohoPayload(input, steps);
  check('payload carries the rebalanced owner', payload.projects.find(p => p.name === 'Client B')
    .tasks.find(t => t.name === 'API integration').owner === 'Rhea Shah');
  check('payload maps time & materials to a Zoho billing method', payload.projects[0].billing_method === 'staff_hours');
  check('payload sets the business days', payload.portal_settings.business_days.join() === 'Monday,Tuesday,Wednesday,Thursday,Friday');
  check('payload never invents a portal id', payload.portal_id === '{{PORTAL_ID}}');

  const setup = P.buildSetupSteps(input, steps);
  check('setup sequence ends at the Workload report', setup[setup.length - 1].feature === 'workload');
  check('every setup step names its Zoho feature and plan tier', setup.every(s => s.featureName && s.tier));

  const prompt = P.buildAgentPrompt(input, steps);
  check('agent hand-off demands confirm-first writes', prompt.includes('wait for my yes'));
  check('agent hand-off forbids rate changes', prompt.includes('Never change a cost or billing rate'));
  check('agent hand-off asks for measured data first', prompt.includes('Read the real Workload report'));

  const md = P.renderReport(input, steps);
  check('report renders with plan and setup sections',
    md.includes('## The plan') && md.includes('## Setting this up in Zoho Projects'));
  check('report states the data is self-reported', md.includes('self-reported'));
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}\n`);
process.exit(failures === 0 ? 0 : 1);
