'use strict';
/* ============================================================================
 * Knowledge layer — authoritative doctrine. Data only, no logic.
 * ----------------------------------------------------------------------------
 * verification:
 *   'read'      - wording or an authoritative abstract was read directly
 *   'canonical' - not read in full (paywalled), but the instrument is canonical
 *   'folklore'  - circulates widely, no authoritative provenance
 *
 * The single most important thing in this file: DURATION, not magnitude, is
 * what the evidence says damages productivity. A one-off heavy week is not a
 * finding. Three sustained weeks is.
 * ========================================================================== */

/* --- terminology ---------------------------------------------------------- */
/* PMBOK 7 is principle-based and defines NO numeric utilisation metric. Do not
 * cite PMI for a threshold; it does not have one. */

const TERMINOLOGY = {
  rule: 'utilisation = committed_hours / available_hours_from_resource_calendar',
  neverUse: 'a nominal 40-hour week as the denominator',
  labelling:
    'Call the metric "allocation" unless timesheet actuals back it. "Utilisation" implies measured effort; ' +
    'allocation only implies planned commitment.',
  bodies: {
    pmi: { term: 'resource optimisation', numericMetric: false, verification: 'canonical',
      note: 'PMBOK 7 performance domains. Capacity appears implicitly via the resource calendar.' },
    apm: { term: 'resource optimisation', numericMetric: false, verification: 'read',
      note: 'Capacity expressed as availability limits feeding resource-limited vs time-limited scheduling.' },
    aace: { term: 'resource planning (distinct from estimating)', verification: 'canonical',
      note: 'TCM Framework 2nd ed. rev. 2019-10. The rigorous body on cost. RP 10S-90 defines the terminology.' },
    iso: { term: 'Resources (ISO 21502:2020 clause 7.5)', numericMetric: false, verification: 'read' },
    scrum: { term: 'capacity', verification: 'read',
      note: 'The 2020 Scrum Guide uses "capacity" exactly once and never uses "velocity", "utilization" or "overtime". It does prescribe "a sustainable pace".' },
    safe: { term: 'capacity allocation by work type', numericMetric: false, verification: 'canonical',
      note: 'Negotiated percentage per work type, adjusted at PI boundaries. SAFe prescribes no number.' },
  },
};

/* --- overtime and overallocation: what is actually defensible -------------- */

const OVERTIME_EVIDENCE = [
  {
    id: 'eu-wtd',
    claim: 'Maximum 48h average weekly working time over a 17-week reference period; minimum 24h uninterrupted weekly rest plus 11h daily rest.',
    source: 'EU Directive 2003/88/EC, Articles 5 and 6',
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32003L0088',
    verification: 'canonical',
    note: 'The strongest citable numeric threshold in the whole domain. It is a legal limit, not a productivity finding — present it as such.',
  },
  {
    id: 'thomas-raynar-1997',
    claim: '10-15% efficiency loss at 50- and 60-hour weeks. Five-day vs six-day weeks lose 12% vs 14%.',
    source: 'Thomas & Raynar, "Scheduled Overtime and Labor Productivity: Quantitative Analysis", JCEM 123(2):181 (1997)',
    url: 'https://doi.org/10.1061/(ASCE)0733-9364(1997)123:2(181)',
    verification: 'read',
    note: 'The best direct evidence for a weekend-burn flag — the 12% vs 14% delta is specifically about adding a sixth day.',
  },
  {
    id: 'hanna-2005',
    claim: 'Productivity falls as weekly hours rise AND as the overtime period lengthens. Duration is an independent factor.',
    source: 'Hanna, Taylor & Sullivan, "Impact of Extended Overtime on Construction Labor Productivity", JCEM 131(6):734 (2005)',
    url: 'https://doi.org/10.1061/(ASCE)0733-9364(2005)131:6(734)',
    verification: 'read',
  },
  {
    id: 'brt-c2',
    claim: 'Sustained 60h+ weeks beyond roughly two months deliver LATER completion than a 40h schedule with the same crew.',
    source: 'Business Roundtable Report C-2, "Scheduled Overtime Effect on Construction Projects" (1980)',
    url: 'https://trid.trb.org/View/206774',
    verification: 'read',
    note: 'Counter-intuitive and persuasive: overtime past a point moves the end date the wrong way.',
  },
  {
    id: 'kivimaki-2015',
    claim: 'Working 55h+/week vs 35-40h: stroke relative risk 1.33 (CI 1.11-1.61), coronary heart disease RR 1.13 (1.02-1.26). Dose-response visible at 49-54h (RR 1.27).',
    source: 'Kivimäki et al., The Lancet 386:1739 (2015)',
    url: 'https://doi.org/10.1016/S0140-6736(15)60295-1',
    verification: 'read',
    note: 'Health, not productivity. Use sparingly and never as a scare tactic — but it is the reason sustained overload is not merely an efficiency question.',
  },
  {
    id: 'aace-25r-03',
    claim: 'There is no common agreement on how lost hours are calculated, and the existence of overtime does not by itself warrant a productivity-loss claim.',
    source: 'AACE RP 25R-03, Estimating Lost Labor Productivity in Construction Claims',
    verification: 'canonical',
    note: 'The honest counterweight. Cite this when tempted to over-claim a cost of overtime.',
  },
];

/* Encodable triggers. Note every one is duration-aware. */
const OVERTIME_TRIGGERS = [
  { id: 'rolling-48', test: 'rolling 17-week mean weekly hours > 48', justifiedBy: 'eu-wtd' },
  { id: 'sustained-50', test: '>= 3 consecutive weeks above 50h', justifiedBy: 'thomas-raynar-1997' },
  { id: 'no-rest', test: 'any 7-day window with no 24h continuous rest block', justifiedBy: 'eu-wtd' },
  { id: 'sixth-day', test: 'sustained six-day working pattern', justifiedBy: 'thomas-raynar-1997' },
];

/* --- levelling vs smoothing ----------------------------------------------- */
/* APM is the precise source here, not PMI. Wording below is APM's. */

const RESOURCE_OPTIMISATION = {
  smoothing: {
    definition: 'Time-limited resource scheduling. Uses float or varies resource quantities to even out peaks and troughs WITHOUT changing overall duration.',
    useWhen: 'the time constraint takes priority',
    source: 'APM, "Difference between resource smoothing and resource levelling"',
    url: 'https://apm.org.uk/resources/find-a-resource/difference-between-resource-smoothing-and-resource-levelling',
    verification: 'read',
  },
  levelling: {
    definition: 'Resource-limited scheduling. Works within available resources to answer: with the resources available, when will the work be finished?',
    useWhen: 'limits on resource availability are paramount',
    source: 'APM (as above)',
    verification: 'read',
  },
  encodable: [
    'If peak demand > availability -> recommend LEVELLING and warn the end date will move.',
    'If peak <= availability but variance is high and float exists -> recommend SMOOTHING, end date unchanged.',
    'NEVER propose smoothing for an activity with zero total float.',
    'A mixture is usually required at programme/portfolio level (APM).',
  ],
};

/* --- reserves and baseline ------------------------------------------------ */

const RESERVES = {
  costBaseline: 'Approved time-phased budget EXCLUDING management reserve. The measurement basis for EVM.',
  contingencyReserve: {
    for: 'identified risks',
    position: 'INSIDE the cost baseline',
    owner: 'project manager',
    spendable: 'without change control',
  },
  managementReserve: {
    for: 'unknown-unknowns',
    position: 'OUTSIDE the baseline, inside the total project budget',
    owner: 'sponsor / management',
    spendable: 'consuming it CHANGES the cost baseline',
  },
  prince2: 'Uses different terms entirely — change budget and risk budget, both authorised by the Project Board.',
  sizing: 'NO standards body prescribes a percentage. AACE position: derive contingency by risk analysis (expected value, Monte Carlo, parametric) — never a flat percentage. See RP 40R-08, 42R-08, 44R-08.',
  verification: 'canonical',
  caveat: 'A PMBOK 7 figure (p.63) is reported to draw contingency OUTSIDE the baseline. Verify before asserting.',
  encodable: [
    'Never auto-apply a percentage contingency.',
    'Never count a management-reserve draw as baseline cost variance — raise a BASELINE-CHANGE event instead.',
  ],
};

/* --- formulas -------------------------------------------------------------- */

const FORMULAS = {
  requiresApprovedBaseline: {
    CV: 'EV - AC', SV: 'EV - PV', CPI: 'EV / AC', SPI: 'EV / PV',
    EAC: 'BAC / CPI  (or AC + (BAC - EV) / (CPI x SPI))',
    ETC: 'EAC - AC', VAC: 'BAC - EAC', TCPI: '(BAC - EV) / (BAC - AC)',
    source: 'PMI Practice Standard for Earned Value Management, 3rd ed.',
    gate: 'baseline_approved === true. Do not compute otherwise.',
  },
  noBaselineRequired: {
    triangularMean: '(O + M + P) / 3',
    pertMean: '(O + 4M + P) / 6',
    pertSigma: '(P - O) / 6',
    source: 'PMI Practice Standard for Project Estimating, 2nd ed.',
    caveat: 'sigma = (P-O)/6 assumes a +/-3 sigma range. That is a modelling convention, not a derived truth.',
  },
  estimateClasses: {
    source: 'AACE RP 17R-97 (generic) and 18R-97 (process industries)',
    primaryCharacteristic: 'maturity of project definition (Class 5 = 0-2% defined, through Class 1 = 65-100%)',
    secondaryCharacteristic: 'accuracy range',
    warning: 'The widely-quoted Class 5 range is from 18R-97 Table 1 and is PROCESS-INDUSTRY SPECIFIC. Do not apply it to software.',
    gate: 'Refuse to show a +/- accuracy range when the estimate class is unknown.',
  },
};

/* --- rates ---------------------------------------------------------------- */

const RATE_MODEL = {
  authority: 'AACE RP 10S-90 (Cost Engineering Terminology) formally defines direct cost, indirect cost, overhead, burden and loaded/burdened rate.',
  basisOfEstimate: 'AACE RP 34R-05 makes a documented Basis of Estimate a REQUIRED component of any estimate, including rate assumptions.',
  principle: 'Billable rate is NOT cost rate. No standard sets either. What must be documented and auditable is the BASIS: labour rate + burden + overhead allocation method + escalation.',
  overheadAllocation: 'Per-hour burden vs percentage uplift vs activity-based is an ACCOUNTING POLICY choice. No PM standard prescribes one.',
  verification: 'canonical',
  encodable: [
    'Store cost_rate, billable_rate and burden_multiplier as SEPARATE fields, each with a required basis note.',
    'margin = billable - (cost x burden).',
    'Never silently substitute one rate for the other.',
    'Refuse a margin calculation when burden is unset rather than defaulting it to 1.0.',
  ],
};

/* --- when NOT to raise a finding ------------------------------------------ */

const SUPPRESSIONS = [
  { id: 'no-baseline', rule: 'No approved baseline -> suppress all variance and EVM alerts.',
    because: 'Variance is defined against a baseline (PMI).' },
  { id: 'single-spike', rule: 'A single-period spike with float available is not overallocation.',
    because: 'That is precisely what smoothing exists for (APM).' },
  { id: 'short-episode', rule: 'A single week above 40h has no evidenced productivity penalty.',
    because: 'Sustained duration is the damaging variable (Hanna 2005, BRT C-2).' },
  { id: 'immature-estimate', rule: 'If the estimate class is too immature, a small deviation is inside noise.',
    because: 'AACE 17R/18R accuracy ranges at low classes are very wide.' },
  { id: 'calendar-effects', rule: 'Normalise for leave, part-time FTE and public holidays before judging a denominator.',
    because: 'Both AACE and PMI treat the resource calendar, not a nominal week, as the availability source.' },
];

/* --- folklore register ----------------------------------------------------- */
/* Numbers to refuse to state as targets, with what to say instead. */

const FOLKLORE = [
  { claim: '85% utilisation target',
    why: 'No authoritative source. Kingman\'s formula (1961) shows queue time rising as utilisation approaches 1 but yields NO knee at 85%. Proudlove (2020), "The 85% bed occupancy fallacy", Health Services Management Research, explicitly refutes it as a universal number.',
    instead: 'Compare the team against its own prior periods.' },
  { claim: '80% billable utilisation', why: 'No standards provenance.', instead: 'Use a sourced industry band where one exists, labelled as such.' },
  { claim: '120% allocation is acceptable', why: 'No standards provenance.', instead: 'Report the allocation and let the duration triggers decide.' },
  { claim: '10% contingency / 5% management reserve', why: 'No authoritative provenance. AACE requires risk-derived sizing.', instead: 'Decline to suggest a percentage.' },
  { claim: 'The ninety-ninety rule', why: 'Folklore (though a true observation about optimism).', instead: 'Use empirical estimate-vs-actual multipliers from their own history.' },
];

module.exports = {
  TERMINOLOGY, OVERTIME_EVIDENCE, OVERTIME_TRIGGERS, RESOURCE_OPTIMISATION,
  RESERVES, FORMULAS, RATE_MODEL, SUPPRESSIONS, FOLKLORE,
};
