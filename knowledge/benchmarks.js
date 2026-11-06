'use strict';
/* ============================================================================
 * Knowledge layer — data only, no logic. Reviewable without reading code.
 * ----------------------------------------------------------------------------
 * EVERY number carries `provenance`:
 *
 *   sourced     - a named, published study we can cite
 *   directional - reasoning or weak restatement; safe to use, not to cite
 *   folklore    - circulates widely, no traceable published benchmark
 *
 * RENDERING CONTRACT: a `folklore` band must NEVER be presented as a target the
 * user is failing. It renders as "commonly cited, no published benchmark" or is
 * omitted. A deterministic engine that asserts an unsourced number states the
 * same wrong thing every single run, which is worse than a model doing it once.
 * ========================================================================== */

/* --- utilisation bands by industry --------------------------------------- */

const UTILISATION = {
  professional_services: {
    label: 'professional services (cross-industry)',
    actual: 0.664,
    priorYear: 0.689,
    highPerformers: 0.750,
    others: 0.649,
    target: [0.70, 0.80],
    targetProvenance: 'directional', // vendor restatement, not the report table
    provenance: 'sourced',
    source: {
      name: 'SPI Research, 2026 Professional Services Maturity Benchmark',
      detail: '509 firms, 2025 data',
    },
  },

  architecture_engineering: {
    label: 'architecture & engineering',
    median: 0.61,
    overheadRate: 1.62,
    provenance: 'sourced',
    source: {
      name: 'Deltek Clarity A&E Industry Study',
      detail: '~900 North American firms, 2023 data. North America only.',
    },
  },

  agency: {
    label: 'digital / creative agency',
    circulating: [0.60, 0.75],
    provenance: 'folklore',
    note: 'No 4A\'s or equivalent cost study found. Figures of 60%, 65% and 70-75% all circulate, all from agency-software vendors.',
  },

  msp: {
    label: 'MSP / IT services',
    circulating: [0.75, 0.75],
    provenance: 'folklore',
    note: '"75%" is usually just 6 billable hours in an 8-hour day restated. Service Leadership holds real benchmark data but it is not public.',
  },

  technology_services: {
    label: 'technology / SaaS professional services',
    provenance: 'uncitable',
    note: 'TSIA has a utilisation framework but every figure sits behind the member portal. Do not invent a TSIA number.',
  },

  software_internal: {
    label: 'in-house software team',
    applicable: false,
    provenance: 'category-error',
    note: 'Utilisation is conceptually inapplicable with no external billing rate. Any percentage here is invented. Measure capacity and delivery predictability instead.',
  },

  nonprofit: {
    label: 'non-profit',
    applicable: false,
    provenance: 'category-error',
    note: 'Grant-funded time allocation is not billable utilisation. No benchmark exists.',
  },
};

/* Two warnings the engine must respect when showing these. */
const UTILISATION_CAVEATS = [
  'SPI (66.4%) and Deltek (61%) use different "billable" denominators. Never show them side by side as if one firm is beating another.',
  'SPI\'s own position is that a single firm-wide target is a poor target. Bands should differ by role — delivery vs management vs sales.',
];

/* --- billing models ------------------------------------------------------- */
/* This is the highest-value logic in the knowledge base and needs no citation:
 * it is reasoning, not benchmark data. It is also the thing most tools get
 * wrong — under fixed fee, high utilisation on a project is BAD news. */

const BILLING_MODELS = {
  time_and_materials: {
    label: 'time & materials',
    utilisationMeaning: 'direct',
    keyMetric: 'utilisation x realised rate',
    high: 'Hours convert to revenue, so a high figure is genuinely good news.',
    low: 'Unsold capacity is bench cost.',
    provenance: 'directional',
  },
  fixed_fee: {
    label: 'fixed fee',
    utilisationMeaning: 'inverted',
    keyMetric: 'effort variance and cost-to-complete',
    high: 'Hours spent erode margin directly, because capacity is a cost here rather than revenue.',
    low: 'Possibly good news, if scope is still being met. Check delivery before celebrating.',
    provenance: 'directional',
  },
  retainer: {
    label: 'retainer',
    utilisationMeaning: 'bounded',
    keyMetric: 'retainer absorption against contracted hours',
    high: 'Above the contracted hours you are working uncompensated — and unused hours rarely roll over.',
    low: 'Renewal risk: the client sees poor value for the committed fee.',
    provenance: 'directional',
  },
  milestone: {
    label: 'milestone-based',
    utilisationMeaning: 'timing-sensitive',
    keyMetric: 'milestone slip rate and the age of unbilled work in progress',
    high: 'Before acceptance this is unrecognised revenue — a working-capital risk rather than a win.',
    low: 'Check whether the milestone itself is at risk of slipping.',
    provenance: 'directional',
  },
  outcome: {
    label: 'outcome-based',
    utilisationMeaning: 'not-applicable',
    keyMetric: 'cost-to-serve against contracted outcome value',
    high: 'Effort is decoupled from revenue, so utilisation says little either way.',
    low: 'Effort is decoupled from revenue, so utilisation says little either way.',
    provenance: 'directional',
  },
};

/* --- working week by region ----------------------------------------------- */
/* JS day index: 0 = Sunday. Never hardcode Sat/Sun as "the weekend" — several
 * of these break naive date maths, and the UAE changed in 2022. */

const WORKING_WEEK = {
  default: { businessDays: [1, 2, 3, 4, 5], label: 'Monday-Friday', provenance: 'sourced' },

  uae: {
    businessDays: [1, 2, 3, 4, 5],
    halfDay: 5,
    label: 'Monday-Friday, Friday half-day',
    provenance: 'sourced',
    // Maintainer note: do NOT fold the UAE back into a generic "Gulf" bucket.
    // It diverged from its neighbours in 2022 and the rest are still Sun-Thu.
    note: 'Changed on 3 January 2022 (federal government; the private sector largely followed). The weekend is Saturday and Sunday.',
  },
  saudi: { businessDays: [0, 1, 2, 3, 4], label: 'Sunday-Thursday', provenance: 'sourced' },
  qatar: { businessDays: [0, 1, 2, 3, 4], label: 'Sunday-Thursday', provenance: 'sourced' },
  kuwait: { businessDays: [0, 1, 2, 3, 4], label: 'Sunday-Thursday', provenance: 'sourced' },
  oman: { businessDays: [0, 1, 2, 3, 4], label: 'Sunday-Thursday', provenance: 'directional',
    note: 'Verify against the labour ministry.' },
  bahrain: { businessDays: [0, 1, 2, 3, 4], label: 'Sunday-Thursday', provenance: 'directional',
    note: 'Verify against the labour ministry.' },

  israel: { businessDays: [0, 1, 2, 3, 4], label: 'Sunday-Thursday, short Friday',
    provenance: 'sourced', note: 'Saturday (Shabbat) off.' },

  india: { businessDays: [1, 2, 3, 4, 5], label: 'Monday-Friday or Monday-Saturday',
    provenance: 'directional', ask: true,
    note: 'Varies by state and sector under state Shops & Establishments Acts. No single national answer — ask the user.' },

  nepal: { businessDays: [0, 1, 2, 3, 4, 5], label: 'Sunday-Friday, Saturday-only weekend',
    provenance: 'directional' },
};

/* A real cross-border effect worth surfacing: UAE firms serving Saudi clients
 * often work Sundays to stay aligned, so Sunday logs there may be normal. */
const CALENDAR_NOTES = [
  'UAE firms with Saudi clients commonly work Sundays to stay aligned. Sunday logs are not automatically overtime.',
];

/* --- jurisdictions needing a "check locally" flag -------------------------- */
/* Instrument NAMES only. The engine must never state what a rule requires. */

const WORKING_TIME_INSTRUMENTS = {
  eu: 'Working Time Directive 2003/88/EC and national transpositions',
  france: 'Code du travail (35-hour reference week; cadres dirigeants treated differently)',
  germany: 'Arbeitszeitgesetz (ArbZG), plus works council co-determination under the Betriebsverfassungsgesetz',
  uk: 'Working Time Regulations 1998 (individual opt-out exists)',
  india: 'Factories Act 1948 and state-level Shops & Establishments Acts',
  uae: 'Federal Decree-Law No. 33 of 2021 and its Executive Regulations',
  california: 'California Labor Code § 510 (daily overtime, distinct from federal FLSA)',
  japan: 'Labour Standards Act, Article 36 ("Saburoku") agreements',
  brazil: 'Consolidação das Leis do Trabalho (CLT)',
  saudi: 'Labour Law, Royal Decree M/51',
};

/* --- methodology vocabulary by region -------------------------------------- */
/* Safe use: vary the LANGUAGE of advice. Unsafe: assert market share. */

const METHODOLOGY_TONE = {
  commonwealth_public: {
    vocabulary: 'PRINCE2 — stage boundaries, business case, tolerances, exception reports',
    provenance: 'sourced',
    note: 'PRINCE2 originated with the UK government and is widely adopted by Commonwealth government agencies (peer-reviewed source).',
  },
  us: {
    vocabulary: 'PMBOK — process groups, knowledge areas',
    provenance: 'directional',
    note: 'PMI is US-headquartered (fact). Its *dominance* in US practice is inferred, not sourced.',
  },
};

/* --- deliberately omitted --------------------------------------------------
 * Industry cost structure (labour/materials/subcontract splits). Public sources
 * contradict each other by roughly 3x for construction — estimates for the same
 * line item range from 20% to 60%. Pull BEA input-output tables or RSMeans
 * before shipping any of it. Shipping a 3x-uncertain number as a benchmark is
 * worse than shipping nothing.
 * ------------------------------------------------------------------------- */

module.exports = {
  UTILISATION, UTILISATION_CAVEATS, BILLING_MODELS,
  WORKING_WEEK, CALENDAR_NOTES, WORKING_TIME_INSTRUMENTS, METHODOLOGY_TONE,
};
