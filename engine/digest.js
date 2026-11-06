'use strict';
/* ============================================================================
 * Deterministic cost & capacity analysis.
 * ----------------------------------------------------------------------------
 * This layer does ALL the arithmetic. The LLM never orchestrates API calls and
 * never does maths — it receives the compact digest produced here and writes
 * judgement over it. That keeps latency predictable (Catalyst Advanced I/O has
 * a hard 30s ceiling), makes every number unit-testable without a model, and
 * means a wrong figure is a bug we can reproduce rather than a hallucination.
 *
 * Every finding carries a grade:
 *   hard      - a field Zoho returned
 *   derived   - arithmetic over returned fields
 *   inference - a judgement about cause (the LLM adds these, never this file)
 * ========================================================================== */

const MIN_WEEKS = 4;

/** Findings below this share of availability are 'under' when Zoho gives no verdict. */
const FALLBACK_UNDER = 0.70;
const FALLBACK_OVER = 0.90;

function finding(id, grade, headline, detail, value) {
  return { id, grade, headline, detail, value };
}

/* --- preflight ----------------------------------------------------------- */

/**
 * Decide whether the data can support any recommendation at all.
 * Returns { ok, reasons[] }. Refusing is a valid, honest outcome.
 */
function preflight({ timelogs = [], weeksCovered = 0, users = [], calendar = null }) {
  const reasons = [];

  if (weeksCovered < MIN_WEEKS) {
    reasons.push(
      `Only ${weeksCovered} week(s) of time logs. Utilisation below ${MIN_WEEKS} weeks is noise, not signal.`
    );
  }
  if (!timelogs.length) reasons.push('No time logs returned for the requested window.');
  if (!calendar || !Array.isArray(calendar.businessDays) || !calendar.businessDays.length) {
    reasons.push(
      'No business-day calendar supplied. Refusing to assume Mon-Fri — that assumption is wrong for many portals.'
    );
  }
  if (!users.length) reasons.push('No users returned; cannot attribute effort.');

  return { ok: reasons.length === 0, reasons };
}

/* --- rates --------------------------------------------------------------- */

/**
 * Build a zpuid -> cost_per_hour map, and report who is missing a rate.
 * Anyone missing a rate is reported in HOURS ONLY downstream. We never
 * silently treat a missing rate as zero — that understates cost.
 */
function rateIndex(users) {
  const rates = new Map();
  const missing = [];

  for (const u of users) {
    const id = String(u.zpuid ?? u.id ?? '');
    const cost = Number(u?.budget?.cost_per_hour);
    if (!id) continue;
    if (Number.isFinite(cost) && cost > 0) rates.set(id, cost);
    else missing.push(u.name || u.email || id);
  }
  return { rates, missing };
}

/* --- utilisation --------------------------------------------------------- */

/**
 * Zoho's workload report already classifies each person against that portal's
 * own availability, business hours and holidays. Prefer its verdict; it is the
 * reason this finding is defensible rather than modelled.
 */
function utilisation(workloadRows = []) {
  const under = [], over = [], optimal = [];
  let usedFallback = false;

  for (const row of workloadRows) {
    const name = row.name || row.user_name || String(row.zpuid || '');
    const work = Number(row.total_work);
    const avail = Number(row.total_availability);
    const pct = avail > 0 ? work / avail : null;
    const entry = { name, work, availability: avail, pct };

    let verdict = row.overall_allocation;
    if (!verdict) {
      usedFallback = true;
      if (pct === null) continue;
      verdict = pct < FALLBACK_UNDER ? 'under' : pct > FALLBACK_OVER ? 'over' : 'optimal';
    }

    if (verdict === 'under') under.push(entry);
    else if (verdict === 'over') over.push(entry);
    else optimal.push(entry);
  }

  const grade = usedFallback ? 'derived' : 'hard';
  const out = [];

  if (under.length) {
    out.push(finding('utilisation.under', grade,
      `${under.length} of ${workloadRows.length} people ${under.length === 1 ? 'is' : 'are'} under-utilised`,
      under.map(u => `${u.name} (${pct(u.pct)} of availability)`).join(', '),
      under));
  }
  if (over.length) {
    out.push(finding('utilisation.over', grade,
      `${over.length === 1 ? '1 person is' : `${over.length} people are`} over-allocated`,
      over.map(u => `${u.name} (${pct(u.pct)})`).join(', '),
      over));
  }
  return { findings: out, under, over, optimal, usedFallback };
}

/* --- non-business-day burn ----------------------------------------------- */

/**
 * Classify each log against the PORTAL's calendar, not a hardcoded week.
 * calendar = { businessDays: [1,2,3,4,5], holidays: ['YYYY-MM-DD', ...] }
 * (JS day index: 0 = Sunday)
 */
function offHoursBurn(timelogs, calendar, rates) {
  const holidays = new Set(calendar.holidays || []);
  const business = new Set(calendar.businessDays);

  let offHours = 0, totalHours = 0, offCost = 0;
  let costIncomplete = false;
  const byPerson = new Map();

  for (const log of timelogs) {
    const hours = Number(log.log_hour) || 0;
    totalHours += hours;

    const day = new Date(`${log.date}T00:00:00Z`).getUTCDay();
    const isOff = holidays.has(log.date) || !business.has(day);
    if (!isOff) continue;

    offHours += hours;
    const id = String(log?.owner?.zpuid ?? '');
    const rate = rates.get(id);
    if (rate) offCost += hours * rate;
    else costIncomplete = true;

    const name = log?.owner?.name || id;
    byPerson.set(name, (byPerson.get(name) || 0) + hours);
  }

  const share = totalHours > 0 ? offHours / totalHours : 0;
  const top = [...byPerson.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  return finding('burn.offhours', 'derived',
    `${pct(share)} of logged hours fell outside business days`,
    `${round(offHours)}h off-calendar${costIncomplete ? ' (cost partial — some rates missing)' : ''}` +
    (top.length ? `; concentrated in ${top.map(([n, h]) => `${n} (${round(h)}h)`).join(', ')}` : ''),
    { offHours: round(offHours), totalHours: round(totalHours), share, cost: round(offCost), costIncomplete });
}

/* --- billable ratio ------------------------------------------------------- */

/** Use Zoho's own aggregate. Recomputing invites rounding disputes. */
function billableRatio(logHours) {
  if (!logHours) return null;
  const billable = Number(logHours.billable_hours) || 0;
  const total = Number(logHours.total_hours) || 0;
  if (total <= 0) return null;

  return finding('billable.ratio', 'hard',
    `Billable ratio is ${pct(billable / total)}`,
    `${round(billable)}h billable of ${round(total)}h logged`,
    { billable, total, ratio: billable / total });
}

/* --- budget variance ------------------------------------------------------ */

function budgetVariance(budgetInfo) {
  if (!budgetInfo) return null;
  const planned = amount(budgetInfo.planned_cost);
  const actual = amount(budgetInfo.actual_cost);
  const forecast = amount(budgetInfo.forecasted_cost);
  if (planned === null && actual === null) return null;

  const overrun = planned && forecast ? forecast - planned : null;
  const headline = overrun === null
    ? 'Budget figures available'
    : overrun > 0
      ? `Forecast overruns plan by ${round(overrun)}`
      : `Forecast is ${round(Math.abs(overrun))} under plan`;

  return finding('budget.variance', 'hard', headline,
    `planned ${planned} / actual ${actual} / forecast ${forecast}`,
    { planned, actual, forecast, overrun,
      currency: budgetInfo?.planned_cost?.currency_code ?? null });
}

/* --- what-if modelling ---------------------------------------------------- */

/**
 * Model an hours change. Bounded by availability: proposing extra hours for
 * someone already 'over' is burnout, not optimisation, and is refused here.
 */
function modelHoursChange({ people = [], deltaHoursPerWeek = 0, weeks = 0, rates }) {
  const applied = [], refused = [];
  let cost = 0, hoursMissingRate = 0;

  for (const p of people) {
    if (deltaHoursPerWeek > 0 && p.verdict === 'over') {
      refused.push({ name: p.name, reason: 'already over-allocated' });
      continue;
    }
    const hours = deltaHoursPerWeek * weeks;
    const rate = rates.get(String(p.zpuid ?? ''));
    if (rate) cost += hours * rate;
    else hoursMissingRate += hours;
    applied.push({ name: p.name, hours });
  }

  return {
    applied, refused,
    totalHours: round(applied.reduce((s, a) => s + a.hours, 0)),
    costDelta: round(cost),
    hoursMissingRate: round(hoursMissingRate),
    arithmetic: `${applied.length} people x ${deltaHoursPerWeek} h/week x ${weeks} weeks`,
  };
}

/* --- sustained overload --------------------------------------------------- */

/** EU Working Time Directive reference period, in weeks. */
const WTD_REFERENCE_WEEKS = 17;

/* Epoch day 0 is Thursday 1970-01-01, so day 4 is the first Monday. */
function weekIndex(dateStr) {
  const days = Date.parse(`${dateStr}T00:00:00Z`) / 86400000;
  return Math.floor((days - 4) / 7);
}

/**
 * Duration-aware overload detection.
 *
 * This is deliberately NOT a single-window test. The evidence (Thomas & Raynar
 * 1997, Hanna 2005, Business Roundtable C-2) is that sustained duration is the
 * damaging variable — one heavy week carries no evidenced penalty. Flagging a
 * single spike would be noise dressed as a finding.
 */
function overtimePattern(timelogs, weeksCovered) {
  const perPerson = new Map();

  for (const log of timelogs) {
    const id = String(log?.owner?.zpuid ?? '');
    const name = log?.owner?.name || id;
    if (!id) continue;
    if (!perPerson.has(id)) perPerson.set(id, { name, weeks: new Map() });
    const weeks = perPerson.get(id).weeks;
    const wk = weekIndex(log.date);
    if (!weeks.has(wk)) weeks.set(wk, { hours: 0, days: new Set() });
    const w = weeks.get(wk);
    w.hours += Number(log.log_hour) || 0;
    w.days.add(log.date);
  }

  const sustained = [], sixDay = [], aboveReference = [];

  for (const [, person] of perPerson) {
    const keys = [...person.weeks.keys()].sort((a, b) => a - b);

    // Three or more consecutive weeks above 50h (Thomas & Raynar).
    let run = 0, best = 0;
    let prev = null;
    for (const k of keys) {
      const over50 = person.weeks.get(k).hours > 50;
      run = over50 && (prev === null || k === prev + 1) ? run + 1 : (over50 ? 1 : 0);
      best = Math.max(best, run);
      prev = k;
    }
    if (best >= 3) sustained.push({ name: person.name, consecutiveWeeks: best });

    // Sustained six-day working (the 12% -> 14% delta).
    const sixDayWeeks = keys.filter(k => person.weeks.get(k).days.size >= 6).length;
    if (sixDayWeeks >= 3) sixDay.push({ name: person.name, weeks: sixDayWeeks });

    // WTD 48h mean — only claimable over a full reference period.
    if (weeksCovered >= WTD_REFERENCE_WEEKS) {
      const total = keys.reduce((s, k) => s + person.weeks.get(k).hours, 0);
      const mean = total / weeksCovered;
      if (mean > 48) aboveReference.push({ name: person.name, meanWeeklyHours: round(mean) });
    }
  }

  const out = [];
  if (sustained.length) {
    out.push(finding('overload.sustained', 'derived',
      `${people(sustained.length)} worked 3+ consecutive weeks above 50 hours`,
      sustained.map(s => `${s.name} (${s.consecutiveWeeks} weeks)`).join(', ') +
      '. Evidence associates sustained 50-60h weeks with a 10-15% efficiency loss (Thomas & Raynar, JCEM 1997).',
      sustained));
  }
  if (sixDay.length) {
    out.push(finding('overload.sixday', 'derived',
      `${people(sixDay.length)} sustained a six-day working pattern`,
      sixDay.map(s => `${s.name} (${s.weeks} weeks)`).join(', ') +
      '. Six-day weeks lose roughly 14% efficiency against 12% for five-day (Thomas & Raynar, JCEM 1997).',
      sixDay));
  }
  if (aboveReference.length) {
    out.push(finding('overload.wtd', 'derived',
      `${people(aboveReference.length)} averaged above 48 hours across a ${weeksCovered}-week period`,
      aboveReference.map(s => `${s.name} (${s.meanWeeklyHours}h mean)`).join(', ') +
      '. The EU Working Time Directive sets 48h averaged over 17 weeks as a legal ceiling in member states.',
      aboveReference));
  }
  return out;
}

/* --- data quality --------------------------------------------------------- */

/**
 * Time data is usually reconstructed from memory rather than recorded live, and
 * every cost figure inherits that error. These flags are attached to the digest
 * so the recommendation layer can hedge rather than assert.
 */
function dataQuality(timelogs, users, unapprovedShare) {
  const flags = [];

  const whole = timelogs.filter(l => Number.isInteger(Number(l.log_hour))).length;
  if (timelogs.length && whole / timelogs.length > 0.9) {
    flags.push('Over 90% of entries are whole hours — time looks estimated rather than measured.');
  }

  const logged = new Set(timelogs.map(l => String(l?.owner?.zpuid ?? '')));
  const silent = users.filter(u => !logged.has(String(u.zpuid ?? u.id ?? '')));
  if (silent.length) {
    flags.push(`${silent.length} user(s) logged no time at all: ` +
      `${silent.map(u => u.name || u.email).join(', ')}. Coverage gaps distort every per-person figure.`);
  }

  if (unapprovedShare > 0.1) {
    flags.push(`${pct(unapprovedShare)} of time logs are unapproved — figures may move on approval.`);
  }
  return flags;
}

/* --- digest --------------------------------------------------------------- */

/**
 * Compact, LLM-ready summary. Deliberately small: one reasoning pass, not a
 * tool loop. Everything here is hard or derived — never inference.
 */
function buildDigest(input) {
  const { users = [], workload = [], timelogs = [], logHours, budgetInfo,
          calendar, weeksCovered = 0, unapprovedShare = 0 } = input;

  const check = preflight({ timelogs, weeksCovered, users, calendar });
  if (!check.ok) return { analysable: false, reasons: check.reasons, findings: [] };

  const { rates, missing } = rateIndex(users);
  const util = utilisation(workload);

  const findings = [
    ...util.findings,
    ...overtimePattern(timelogs, weeksCovered),
    offHoursBurn(timelogs, calendar, rates),
    billableRatio(logHours),
    budgetVariance(budgetInfo),
  ].filter(Boolean);

  const gaps = dataQuality(timelogs, users, unapprovedShare);
  if (missing.length) {
    gaps.push(`No cost rate for ${missing.length} user(s): ${missing.join(', ')}. ` +
              `Their effort is reported in hours only — cost figures exclude them.`);
  }
  if (util.usedFallback) {
    gaps.push('Zoho returned no allocation verdict for some people. A 70/90% fallback band was used — ' +
              'that band has no published provenance, so those entries are marked derived, not measured.');
  }

  return {
    analysable: true,
    window: { weeks: weeksCovered },
    headcount: users.length,
    // "allocation" unless timesheet actuals back it — utilisation implies measured effort.
    metric: timelogs.length ? 'utilisation' : 'allocation',
    findings,
    gaps,
    capacity: { under: util.under, over: util.over },
  };
}

/* --- helpers -------------------------------------------------------------- */

function amount(v) {
  if (v == null) return null;
  const n = Number(typeof v === 'object' ? v.amount : v);
  return Number.isFinite(n) ? n : null;
}
function round(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function pct(n) { return n == null ? 'n/a' : `${Math.round(n * 100)}%`; }
function people(n) { return n === 1 ? '1 person' : `${n} people`; }

module.exports = {
  buildDigest, preflight, rateIndex, utilisation,
  offHoursBurn, billableRatio, budgetVariance, modelHoursChange,
  overtimePattern, dataQuality, weekIndex,
  MIN_WEEKS, WTD_REFERENCE_WEEKS,
};
