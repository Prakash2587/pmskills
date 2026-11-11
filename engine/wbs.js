'use strict';
/* ============================================================================
 * WBS builder — the engine behind the wizard.
 * ----------------------------------------------------------------------------
 * Holds a work breakdown structure as a flat list of nodes with parent links,
 * numbers it, totals hours up the tree, checks it against the sourced rules in
 * knowledge/wbs.js, and turns it into the ordered list of things to create in
 * Zoho Projects.
 *
 * Deliberate choices:
 *   - Hours live on work packages (leaves) only. A parent's figure is always
 *     the sum of its children, which is also what Zoho's own roll-up requires.
 *   - The 100% rule is not computed. Adding up hours proves the arithmetic, not
 *     that the scope is complete, so it is returned as something to confirm.
 *   - Dependencies join work packages only, and are finish-to-start: the one
 *     type every Zoho Projects plan supports.
 *   - Nothing is assigned to a role in Zoho Projects, because it cannot be. A
 *     task carries an owner only when a real person has been named for the role.
 *
 * model = { project: { name, template }, nodes, deps, people, options, seq }
 *   node = { id, parent, title, hours, role, done, sample, tkey }
 *   dep  = { from, to }            from must finish before to starts
 * Sibling order is the order of the nodes array.
 * ========================================================================== */

const K = require('../knowledge/wbs');

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r1 = n => Math.round(n * 10) / 10;
const fmtH = n => `${r1(n)}h`;
const clean = s => String(s == null ? '' : s).trim();

/* --- building a model from a template -------------------------------------- */

/** include: { branchKey: boolean } overrides each branch's default (on unless `off`). */
function instantiate(templateKey, include = {}) {
  const t = K.TEMPLATES.find(x => x.key === templateKey);
  if (!t) throw new Error(`unknown template: ${templateKey}`);
  const model = { project: { name: '', template: t.key }, nodes: [], deps: [], people: {}, seq: 1,
    options: { sizeLimit: 0, mapping: 'A', prefixCodes: true, rollup: false } };
  const add = (parent, fields) => { const id = `n${model.seq++}`; model.nodes.push({ id, parent, title: '', hours: null, role: '', done: '', sample: false, ...fields }); return id; };

  for (const b of t.branches) {
    const on = b.key in include ? !!include[b.key] : !b.off;
    if (!on) continue;
    const branch = add(null, { title: b.title, tkey: b.key });
    for (const [areaTitle, packages] of b.areas) {
      const area = add(branch, { title: areaTitle });
      for (const [title, hours, role] of packages) add(area, { title, hours, role, sample: true });
    }
  }
  return model;
}

function blank(name = '') {
  return { project: { name, template: null }, nodes: [], deps: [], people: {}, seq: 1,
    options: { sizeLimit: 0, mapping: 'A', prefixCodes: true, rollup: false } };
}

/* --- reading the tree ------------------------------------------------------ */

/**
 * The tree in display order. Each row: { id, node, depth, code, parentId,
 * children, isLeaf, hours } where hours is the node's own figure for a work
 * package and the sum of its descendants otherwise.
 */
function outline(model) {
  const kids = new Map();
  for (const n of model.nodes) {
    const key = n.parent == null ? '' : n.parent;
    if (!kids.has(key)) kids.set(key, []);
    kids.get(key).push(n);
  }
  const rows = [];
  const walk = (parentId, depth, prefix) => {
    const list = kids.get(parentId == null ? '' : parentId) || [];
    let sum = 0;
    list.forEach((node, i) => {
      const code = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      const row = { id: node.id, node, depth, code, parentId, children: [], isLeaf: true, hours: 0 };
      rows.push(row);
      const childSum = walk(node.id, depth + 1, code);
      row.children = (kids.get(node.id) || []).map(c => c.id);
      row.isLeaf = row.children.length === 0;
      row.hours = row.isLeaf ? num(node.hours) : childSum;
      sum += row.hours;
    });
    return r1(sum);
  };
  const total = walk(null, 0, '');
  const byId = new Map(rows.map(r => [r.id, r]));
  return { rows, byId, total,
    leaves: rows.filter(r => r.isLeaf),
    maxDepth: rows.reduce((m, r) => Math.max(m, r.depth), -1) };
}

function pathOf(o, id) {
  const out = [];
  for (let r = o.byId.get(id); r; r = o.byId.get(r.parentId)) out.unshift(clean(r.node.title) || '(unnamed)');
  return out.join(' › ');
}

/* --- editing (these change the model they are given) ------------------------ */

function descendants(model, id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of model.nodes) if (n.parent != null && out.has(n.parent) && !out.has(n.id)) { out.add(n.id); grew = true; }
  }
  return out;
}

function newNode(model, parent, fields) {
  return { id: `n${model.seq++}`, parent, title: '', hours: null, role: '', done: '', sample: false, ...fields };
}

/* Sibling order is the order of the nodes array among nodes that share a parent, so
 * adding at the end of a parent's children is simply adding at the end of the array. */

/** Adds a child at the end of a node's children (or a new top-level branch when parentId is null). */
function addChild(model, parentId, fields = {}) {
  const node = newNode(model, parentId, fields);
  model.nodes.push(node);
  return node.id;
}

/** Adds a node directly after `id`, under the same parent. */
function addSibling(model, id, fields = {}) {
  const me = model.nodes.find(n => n.id === id);
  if (!me) return null;
  const node = newNode(model, me.parent, fields);
  const next = model.nodes.slice(model.nodes.indexOf(me) + 1).find(n => n.parent === me.parent);
  if (next) model.nodes.splice(model.nodes.indexOf(next), 0, node); else model.nodes.push(node);
  return node.id;
}

/** Removes a node, everything under it, and any dependency touching them. */
function remove(model, id) {
  const gone = descendants(model, id);
  model.nodes = model.nodes.filter(n => !gone.has(n.id));
  model.deps = model.deps.filter(d => !gone.has(d.from) && !gone.has(d.to));
  return gone.size;
}

/** Moves a node one place up (-1) or down (+1) among its siblings. */
function move(model, id, dir) {
  const me = model.nodes.find(n => n.id === id);
  if (!me) return false;
  const sibs = model.nodes.filter(n => n.parent === me.parent);
  const i = sibs.indexOf(me), other = sibs[i + dir];
  if (!other) return false;
  const a = model.nodes.indexOf(me), b = model.nodes.indexOf(other);
  model.nodes[a] = other; model.nodes[b] = me;
  return true;
}

/** Drops `fromId` into the place of `toId`. Only among siblings: a drag never re-parents. */
function reorder(model, fromId, toId) {
  const from = model.nodes.find(n => n.id === fromId), to = model.nodes.find(n => n.id === toId);
  if (!from || !to || from === to || from.parent !== to.parent) return false;
  const a = model.nodes.indexOf(from);
  model.nodes.splice(a, 1);
  const b = model.nodes.indexOf(to);
  model.nodes.splice(a <= b ? b + 1 : b, 0, from);
  return true;
}

/* --- dependencies ----------------------------------------------------------- */

/** Returns one loop as a list of node ids (first repeated at the end), or null. */
function findCycle(deps) {
  const next = new Map();
  for (const d of deps) { if (!next.has(d.from)) next.set(d.from, []); next.get(d.from).push(d.to); }
  const state = new Map();           // 1 = on the current path, 2 = finished
  const path = [];
  const visit = id => {
    state.set(id, 1); path.push(id);
    for (const to of next.get(id) || []) {
      if (state.get(to) === 1) return path.slice(path.indexOf(to)).concat(to);
      if (!state.has(to)) { const hit = visit(to); if (hit) return hit; }
    }
    state.set(id, 2); path.pop();
    return null;
  };
  for (const id of next.keys()) if (!state.has(id)) { const hit = visit(id); if (hit) return hit; }
  return null;
}

/** Would adding from -> to be valid? Returns '' or the reason it is not. */
function whyNotDep(model, from, to) {
  const o = outline(model), a = o.byId.get(from), b = o.byId.get(to);
  if (!a || !b) return 'Both ends must be work packages that still exist.';
  if (from === to) return 'A work package cannot depend on itself.';
  if (!a.isLeaf || !b.isLeaf) return 'Dependencies join work packages, not the branches above them.';
  if (model.deps.some(d => d.from === from && d.to === to)) return 'That dependency is already there.';
  if (findCycle(model.deps.concat({ from, to }))) return 'That would create a loop.';
  return '';
}

/* --- checks ------------------------------------------------------------------ */

const CATCH_ALL = /^(other|others|misc|miscellaneous|general|sundry|various)\b/i;

/**
 * Every rule, in order, each as { id, level, title, basis, provenance, state,
 * detail, items, sig }. `sig` changes when the failing items change, so an
 * acknowledgement cannot silently cover a different problem later.
 * opts.confirmed: { branchId: true } for the 100% rule.
 */
function validate(model, opts = {}) {
  const o = outline(model);
  const mapping = K.MAPPINGS[model.options.mapping] || K.MAPPINGS.A;
  const limit = num(model.options.sizeLimit);
  const confirmed = opts.confirmed || {};
  const template = K.TEMPLATES.find(t => t.key === model.project.template);
  const where = r => `${r.code} ${clean(r.node.title) || '(unnamed)'}`;
  const out = [];
  const push = (id, items, passDetail, failDetail) => {
    const rule = K.RULES[id];
    out.push({ id, level: rule.level, title: rule.title, basis: rule.basis, provenance: rule.provenance,
      state: items.length ? 'fail' : 'pass', detail: items.length ? failDetail : passDetail, items,
      sig: `${id}:${items.length}:${items.join('|').length}` });
  };

  // Blockers
  const unnamed = o.rows.filter(r => !clean(r.node.title)).map(r => `${r.code} has no name`);
  if (!clean(model.project.name)) unnamed.unshift('The project has no name');
  push('B1', unnamed, 'Everything has a name.', 'Give these a name:');

  const loop = findCycle(model.deps);
  push('B2', loop ? [loop.map(id => (o.byId.get(id) ? where(o.byId.get(id)) : '(removed)')).join(' → ')] : [],
    'No work package ends up waiting on itself.', 'These wait on each other in a circle:');

  const badDeps = model.deps.filter(d => {
    const a = o.byId.get(d.from), b = o.byId.get(d.to);
    return !a || !b || !a.isLeaf || !b.isLeaf || d.from === d.to;
  }).map(d => `${o.byId.get(d.from) ? where(o.byId.get(d.from)) : '(removed)'} → ${o.byId.get(d.to) ? where(o.byId.get(d.to)) : '(removed)'}`);
  push('B3', badDeps, 'Every dependency joins two work packages.', 'These no longer join two work packages. Remove them:');

  const tooDeep = o.rows.filter(r => r.depth > mapping.maxDepth).map(where);
  push('B4', tooDeep, `Nothing is deeper than "${mapping.label}" can hold.`,
    `"${mapping.label}" holds ${mapping.maxDepth + 2} levels. These are deeper:`);

  push('B5', o.leaves.length ? [] : ['The structure is empty'], `${o.leaves.length} work packages.`, 'Add at least one work package.');

  // Warnings
  const present = new Set(o.rows.filter(r => r.depth === 0).map(r => r.node.tkey).filter(Boolean));
  const missing = template
    ? template.branches.filter(b => b.expected && !present.has(b.key)).map(b => `${b.title} — ${b.why}`)
    : (o.rows.some(r => r.depth === 0 && /project management|programme management|governance/i.test(r.node.title)) ? []
      : ['Project management — every WBS carries project management as its own branch.']);
  push('W1', missing, 'The branches a project of this kind normally has are all present.', 'Not in your structure. Leave them out only if they are truly out of scope:');

  push('W2', o.rows.length && o.maxDepth < 1 ? [`The deepest level is ${o.maxDepth + 2}`] : [],
    `${o.maxDepth + 2} levels, counting the project as level 1.`, 'Break the branches down at least one more level.');

  push('W3', o.rows.filter(r => r.children.length === 1).map(where),
    'No branch has just one child.', 'These have a single child. Merge the two, or add what is missing:');

  push('W4', o.leaves.filter(r => !clean(r.node.role)).map(where),
    'Every work package names the role that does it.', 'No role yet:');

  const noEst = o.leaves.filter(r => !(num(r.node.hours) > 0)).map(r => `${where(r)} — no estimate`);
  const sample = o.leaves.filter(r => num(r.node.hours) > 0 && r.node.sample).map(r => `${where(r)} — still the sample ${fmtH(r.node.hours)}`);
  push('W5', noEst.concat(sample), 'Every estimate is one you entered or changed.', 'These are not yet your estimates:');

  push('W6', limit > 0 ? o.leaves.filter(r => num(r.node.hours) > limit).map(r => `${where(r)} — ${fmtH(r.node.hours)}`) : [],
    limit > 0 ? `No work package is above your limit of ${fmtH(limit)}.` : 'You have not set a size limit, so nothing is checked here.',
    `Above your limit of ${fmtH(limit)}. Split them, or accept them as they are:`);

  const catchAll = o.rows.filter(r => {
    if (!CATCH_ALL.test(clean(r.node.title))) return false;
    const sibs = o.rows.filter(x => x.parentId === r.parentId);
    const total = sibs.reduce((a, x) => a + x.hours, 0);
    return total > 0 && r.hours / total > 0.1;
  }).map(r => `${where(r)} — ${fmtH(r.hours)}`);
  push('W7', catchAll, 'No catch-all element is carrying more than a tenth of its level.', 'These catch-alls hold more than 10% of their level. Name what is in them:');

  push('W8', o.leaves.filter(r => !clean(r.node.done)).map(where),
    'Every work package says what "done" means.', 'No "done means" line yet:');

  // Confirmed by a person
  push('C1', o.rows.filter(r => r.depth === 0 && !confirmed[r.id]).map(where),
    'You have confirmed every branch.', 'Not yet confirmed by you:');

  return out;
}

/** Can the structure be created? acks: { ruleId: sig } the user acknowledged. */
function readiness(model, opts = {}) {
  const results = validate(model, opts);
  const acks = opts.acks || {};
  const failing = lvl => results.filter(r => r.level === lvl && r.state === 'fail');
  const blockers = failing('blocker');
  const unacked = failing('warning').filter(r => acks[r.id] !== r.sig);
  const unconfirmed = failing('confirm');
  return { results, blockers, unacked, unconfirmed,
    ready: !blockers.length && !unacked.length && !unconfirmed.length };
}

/* --- Zoho Projects: what gets created ---------------------------------------- */

function hhmm(hours) {
  const m = Math.round(num(hours) * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * The structure as an ordered creation plan. Nothing on the page sends it; it
 * is the specification the skill (or a person) follows.
 *
 * Containers come first by depth (phase, then task list). A work package that
 * sits at a container level still needs somewhere to hold its hours, so it gets
 * a task of the same name inside its container.
 */
function buildZohoPlan(model) {
  const o = outline(model);
  const mapping = K.MAPPINGS[model.options.mapping] || K.MAPPINGS.A;
  const levels = mapping.containers;                       // e.g. ['phase', 'tasklist']
  const prefix = !!model.options.prefixCodes;
  const label = r => `${prefix ? r.code + ' ' : ''}${clean(r.node.title)}`;
  const phases = [], tasklists = [], tasks = [];
  const phaseOf = new Map(), listOf = new Map();           // node id -> ref of the container it lives in

  const describe = r => {
    const n = r.node, lines = [`WBS code: ${r.code}`];
    if (clean(n.role)) lines.push(`Role: ${clean(n.role)}`);
    const person = clean(model.people[clean(n.role)]);
    if (person) lines.push(`Intended owner: ${person}`);
    if (r.isLeaf && num(n.hours) > 0) lines.push(`Estimate: ${fmtH(n.hours)}${n.sample ? ' (sample figure, not yet reviewed)' : ''}`);
    if (clean(n.done)) lines.push(`Done means: ${clean(n.done)}`);
    return lines.join('\n');
  };
  const addTask = (r, listRef, parentRef, ref) => {
    const n = r.node, isPkg = r.isLeaf;
    tasks.push({ ref: ref || r.id, name: label(r), tasklist: listRef, parent: parentRef || null, depth: parentRef ? undefined : 0,
      work: isPkg && num(n.hours) > 0 ? hhmm(n.hours) : null, hours: isPkg ? num(n.hours) : null,
      role: clean(n.role), owner: isPkg ? clean(model.people[clean(n.role)]) : '', description: describe(r) });
  };

  for (const r of o.rows) {
    const kind = levels[r.depth];                           // undefined once we are below the containers
    if (kind === 'phase') {
      phases.push({ ref: r.id, name: label(r) });
      phaseOf.set(r.id, r.id);
      if (r.isLeaf) {                                       // a work package at phase level
        tasklists.push({ ref: `${r.id}:list`, name: label(r), phase: r.id });
        addTask(r, `${r.id}:list`, null, `${r.id}:task`);
      }
    } else if (kind === 'tasklist') {
      const phase = levels.length === 2 ? phaseOf.get(r.parentId) : null;
      tasklists.push({ ref: r.id, name: label(r), phase: phase || null });
      listOf.set(r.id, r.id);
      if (phase) phaseOf.set(r.id, phase);
      if (r.isLeaf) addTask(r, r.id, null, `${r.id}:task`);
    } else {
      const parent = o.byId.get(r.parentId);
      const top = r.depth === levels.length;                // first level below the containers = a task
      const listRef = top ? listOf.get(r.parentId) : listOf.get(r.id) || listOf.get(r.parentId);
      listOf.set(r.id, listRef);
      addTask(r, listRef, top ? null : parent.id);
    }
  }
  // depth of each task below its top task, for the six-level limit
  const taskByRef = new Map(tasks.map(t => [t.ref, t]));
  for (const t of tasks) { let d = 0; for (let p = t.parent; p; p = (taskByRef.get(p) || {}).parent) d++; t.depth = d; }

  const taskRef = id => (taskByRef.has(id) ? id : `${id}:task`);
  const dependencies = model.deps
    .filter(d => o.byId.get(d.from) && o.byId.get(d.to))
    .map(d => ({ predecessor: taskRef(d.from), successor: taskRef(d.to), type: 'FS' }));

  return {
    project: { name: clean(model.project.name), is_rollup_project: !!model.options.rollup },
    mapping: mapping.key, mapping_label: mapping.label,
    phases, tasklists, tasks, dependencies,
    counts: { phases: phases.length, tasklists: tasklists.length,
      tasks: tasks.filter(t => !t.parent).length, subtasks: tasks.filter(t => t.parent).length,
      dependencies: dependencies.length, work_packages: o.leaves.length, hours: o.total,
      deepest_subtask_level: tasks.reduce((m, t) => Math.max(m, t.depth), 0) },
    notes: [mapping.note].concat(model.options.rollup
      ? ['Roll-up is switched on for this project. It needs the Premium plan or above and cannot be switched off afterwards.'] : []),
  };
}

/** A hand-off for the installed skill: create the structure through the user's own Zoho connection. */
function buildAgentPrompt(model) {
  const plan = buildZohoPlan(model);
  const c = plan.counts;
  return [
    'Use the wbs-builder skill (with the zoho-projects-api layer) to create this work breakdown structure in my Zoho Projects portal as a NEW project.',
    '',
    `It was built in the PM Skills WBS builder and I have checked it there: ${c.work_packages} work packages, ${fmtH(c.hours)} in total.`,
    `It maps to ${c.phases ? c.phases + ' phases, ' : ''}${c.tasklists} task lists, ${c.tasks} tasks and ${c.subtasks} subtasks, with ${c.dependencies} dependencies.`,
    '',
    'Before creating anything:',
    '1. Check you can reach my portal. If you cannot, stop and help me connect it.',
    '2. Show me a short summary of what you are about to create and wait for my yes. One yes covers the whole structure.',
    '3. Roles are not people. Where the data names an intended owner, check that person is a confirmed user of my portal and assign them; otherwise leave the task unassigned. Never invite anyone.',
    '',
    'Then create it in this order: the project, phases, task lists, tasks, subtasks, dependencies. Stop at the first failure, tell me exactly what exists, and ask me what to do.',
    'When you finish, read the project back and tell me what was created and anything you skipped.',
    '',
    'Structure follows as JSON.',
    '',
    JSON.stringify(plan, null, 2),
  ].join('\n');
}

/* --- report ------------------------------------------------------------------ */

function renderReport(model, opts = {}) {
  const o = outline(model);
  const plan = buildZohoPlan(model);
  const L = [`# Work breakdown structure — ${clean(model.project.name) || 'untitled project'}`, '',
    `${o.leaves.length} work packages, ${fmtH(o.total)} in total, ${o.maxDepth + 2} levels.`, '',
    'Hours are estimates. Any figure marked "sample" came with the template and has not been reviewed.', '',
    '## Structure', '', '| Code | Element | Role | Hours |', '|---|---|---|---|'];
  for (const r of o.rows) {
    const pad = '  '.repeat(r.depth);
    L.push(`| ${r.code} | ${pad}${clean(r.node.title)} | ${r.isLeaf ? clean(r.node.role) : ''} | ${fmtH(r.hours)}${r.isLeaf && r.node.sample ? ' (sample)' : ''} |`);
  }
  if (model.deps.length) {
    L.push('', '## Dependencies', '');
    for (const d of model.deps) {
      const a = o.byId.get(d.from), b = o.byId.get(d.to);
      if (a && b) L.push(`- ${a.code} ${clean(a.node.title)} must finish before ${b.code} ${clean(b.node.title)} starts`);
    }
  }
  L.push('', '## Checks', '');
  for (const v of validate(model, opts)) {
    L.push(`- **${v.state === 'pass' ? 'PASS' : v.level.toUpperCase()}** — ${v.title}. ${v.detail}${v.items.length ? ' ' + v.items.slice(0, 8).join('; ') + (v.items.length > 8 ? `; and ${v.items.length - 8} more` : '') + '.' : ''}`);
  }
  const c = plan.counts;
  L.push('', '## In Zoho Projects', '',
    `Mapping: ${plan.mapping_label}. This creates one project, ${c.phases ? c.phases + ' phases, ' : ''}${c.tasklists} task lists, ${c.tasks} tasks, ${c.subtasks} subtasks and ${c.dependencies} dependencies.`, '');
  for (const n of plan.notes) L.push(`- ${n}`);
  return L.join('\n');
}

module.exports = {
  instantiate, blank, outline, pathOf, addChild, addSibling, remove, move, reorder,
  findCycle, whyNotDep, validate, readiness, buildZohoPlan, buildAgentPrompt, renderReport, hhmm,
};
