'use strict';
/* ============================================================================
 * Explore the NEW-USER brain (recommendFromProfile) — the one behind the
 * no-account web tool.
 *
 * Dabble with it:
 *   node engine/explore.js                      # run the built-in scenarios
 *   node engine/explore.js '{"industry":"agency","billingModel":"fixed_fee","region":"uae","tracksTime":true,"hasRates":true,"headcount":12}'
 *
 * Valid field values (all optional):
 *   industry      : professional_services | architecture_engineering | agency | msp |
 *                   technology_services | software_internal | nonprofit
 *   billingModel  : time_and_materials | fixed_fee | retainer | milestone | outcome
 *   region        : default | uae | saudi | qatar | kuwait | oman | bahrain | israel | india | nepal
 *   tracksTime, hasRates, hasCapacity, hasBudgets : true/false   (the 4 maturity gates)
 *   headcount     : a number
 * ========================================================================== */

const r = require('./recommend');

function run(label, profile) {
  console.log('\n' + '='.repeat(74));
  console.log(label);
  console.log('input: ' + JSON.stringify(profile));
  console.log('='.repeat(74));
  console.log(r.renderMarkdown(r.recommendFromProfile(profile), 'New-user assessment'));
}

const custom = process.argv[2];
if (custom) {
  run('CUSTOM PROFILE', JSON.parse(custom));
  process.exit(0);
}

/* A few deliberately contrasting scenarios so the branching is visible. */

run('1. Brand-new team, measures nothing',
  { tracksTime: false, headcount: 8, industry: 'agency', billingModel: 'time_and_materials' });

run('2. Same team, now logging time (one rung up the ladder)',
  { tracksTime: true, headcount: 8, industry: 'agency', billingModel: 'time_and_materials' });

run('3. Fully instrumented agency — ready to forecast',
  { tracksTime: true, hasRates: true, hasCapacity: true, hasBudgets: true,
    headcount: 8, industry: 'agency', billingModel: 'time_and_materials' });

run('4. Same maturity, but FIXED-FEE — the signal inverts',
  { tracksTime: true, hasRates: true, hasCapacity: true, hasBudgets: true,
    headcount: 8, industry: 'agency', billingModel: 'fixed_fee' });

run('5. In-house software team — utilisation does not even apply',
  { tracksTime: true, hasRates: true, headcount: 20, industry: 'software_internal' });

run('6. UAE consultancy — working week + compliance flag change',
  { tracksTime: true, hasRates: true, headcount: 15, industry: 'professional_services',
    billingModel: 'retainer', region: 'uae' });

run('7. Tiny team — told NOT to over-instrument',
  { tracksTime: true, headcount: 3, industry: 'consulting', billingModel: 'time_and_materials' });

console.log('\n' + '-'.repeat(74));
console.log('Tweak any of these, or pass your own profile as a JSON arg (see top of file).');
