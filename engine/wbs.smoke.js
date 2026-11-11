'use strict';
/* Smoke test for the WBS engine. Run: node engine/wbs.smoke.js */

const W = require('./wbs');
const K = require('../knowledge/wbs');

let failures = 0;
function check(label, cond, extra) {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra !== undefined && !ok ? `\n      ${extra}` : ''}`);
}
const rule = (model, id, opts) => W.validate(model, opts).find(r => r.id === id);
const named = key => { const m = W.instantiate(key); m.project.name = 'Test project'; return m; };

console.log('\n--- templates ---');
for (const t of K.TEMPLATES) {
  const m = named(t.key), o = W.outline(m);
  check(`${t.key}: builds three levels below the project`, o.maxDepth === 2, o.maxDepth);
  check(`${t.key}: every work package has sample hours and a role`, o.leaves.every(r => r.node.hours > 0 && r.node.role && r.node.sample));
  check(`${t.key}: branches switched off by default are left out`,
    t.branches.filter(b => b.off).every(b => !o.rows.some(r => r.node.tkey === b.key)));
  check(`${t.key}: every branch states its basis`, t.branches.every(b => b.basis));
  check(`${t.key}: expected branches say why they matter`, t.branches.filter(b => b.expected).every(b => b.why));
}
check('an optional branch can be switched on',
  W.outline(W.instantiate('construction', { special: true })).rows.some(r => r.node.tkey === 'special'));
check('the knowledge base never attributes anything to PMI or ISO as "checked against"',
  !K.CHECKED_AGAINST.some(b => /PMI|ISO/.test(b)));
check('no rule enforces 8/80', !Object.values(K.RULES).some(r => /8\s*(to|-|\/)\s*80/.test(r.title)));

console.log('\n--- numbering and roll-up ---');
{
  const m = named('software'), o = W.outline(m);
  check('codes are outline numbers', o.rows[0].code === '1' && o.rows[1].code === '1.1' && o.rows[2].code === '1.1.1');
  const branch = o.rows[0];
  const sum = o.rows.filter(r => r.isLeaf && r.code.startsWith('1.')).reduce((a, r) => a + r.hours, 0);
  check('a parent shows the sum of its work packages', branch.hours === sum, `${branch.hours} vs ${sum}`);
  check('the total is the sum of every work package', o.total === o.leaves.reduce((a, r) => a + r.hours, 0));
  W.move(m, o.rows[0].id, 1);
  const o2 = W.outline(m);
  check('moving a branch renumbers it and everything under it', o2.rows.find(r => r.id === branch.id).code === '2'
    && o2.rows.find(r => r.id === o.rows[1].id).code === '2.1');
  const first = o2.rows[0].id;
  const kid = W.addChild(m, first, { title: 'New package', hours: 5, role: 'Developer' });
  check('a new child lands at the end of its parent', W.outline(m).byId.get(kid).code === `1.${W.outline(m).byId.get(first).children.length}`);
  const sib = W.addSibling(m, first, { title: 'New branch' });
  check('a new sibling lands directly after', W.outline(m).byId.get(sib).code === '2');
  const before = m.nodes.length, gone = W.remove(m, first);
  check('removing a branch removes everything under it', m.nodes.length === before - gone && gone > 3);
  check('dragging onto a node with another parent does nothing', W.reorder(m, m.nodes[0].id, m.nodes[1].id) === false);
}

console.log('\n--- blockers ---');
{
  const m = named('software');
  check('a clean template has no blockers', W.readiness(m).blockers.length === 0, W.readiness(m).blockers.map(b => b.id).join());
  m.project.name = ' ';
  check('B1 catches a project with no name', rule(m, 'B1').state === 'fail');
  m.project.name = 'X'; m.nodes[3].title = '';
  check('B1 catches an unnamed element and says where', rule(m, 'B1').items[0].includes('has no name'));
  m.nodes[3].title = 'ok';
  const [a, b, c] = W.outline(m).leaves.map(r => r.id);
  check('a valid dependency is accepted', W.whyNotDep(m, a, b) === '');
  m.deps.push({ from: a, to: b }, { from: b, to: c });
  check('a dependency that closes a loop is refused before it is added', /loop/.test(W.whyNotDep(m, c, a)));
  check('a duplicate dependency is refused', /already/.test(W.whyNotDep(m, a, b)));
  m.deps.push({ from: c, to: a });
  check('B2 catches an indirect loop and names the chain', rule(m, 'B2').state === 'fail' && rule(m, 'B2').items[0].split('→').length === 4);
  m.deps.pop();
  const parent = W.outline(m).rows[0].id;
  check('a dependency on a branch is refused', /work packages/.test(W.whyNotDep(m, a, parent)));
  W.addChild(m, a, { title: 'Now a parent', hours: 1 });
  check('B3 catches a dependency whose end stopped being a work package', rule(m, 'B3').state === 'fail');
  check('removing a node removes its dependencies', (W.remove(m, b), m.deps.every(d => d.from !== b && d.to !== b)));

  const deep = W.blank('Deep'); let p = null;
  for (let i = 0; i < 9; i++) p = W.addChild(deep, p, { title: `Level ${i + 2}`, hours: i === 8 ? 4 : null, role: 'x' });
  deep.options.mapping = 'A';
  check('nine levels below the project fit mapping A', rule(deep, 'B4').state === 'pass');
  deep.options.mapping = 'B';
  check('...and are one too many for mapping B', rule(deep, 'B4').state === 'fail' && rule(deep, 'B4').items.length === 1);
  check('B5 fails an empty structure', rule(W.blank('Empty'), 'B5').state === 'fail');
}

console.log('\n--- warnings and confirmation ---');
{
  const m = named('construction');
  check('W5 flags every untouched sample estimate', rule(m, 'W5').items.length === W.outline(m).leaves.length);
  const leaf = W.outline(m).leaves[0].node; leaf.hours = 30; leaf.sample = false;
  check('...and stops flagging one the user has changed', rule(m, 'W5').items.length === W.outline(m).leaves.length - 1);
  check('W6 checks nothing until a size limit is set', rule(m, 'W6').state === 'pass' && /not set/.test(rule(m, 'W6').detail));
  m.options.sizeLimit = 150;
  check('W6 flags packages above the user\'s own limit', rule(m, 'W6').items.length > 0 && rule(m, 'W6').items.every(i => parseFloat(i.split('— ')[1]) > 150));
  check('W6 cites that no standard fixes a size', /ANSI\/EIA-748/.test(rule(m, 'W6').basis));
  check('W8 flags packages with no "done means" line', rule(m, 'W8').items.length === W.outline(m).leaves.length);
  check('W1 passes while the expected branches are present', rule(m, 'W1').state === 'pass');
  W.remove(m, m.nodes.find(n => n.tkey === 'pm').id);
  check('W1 names a removed expected branch and why it matters', rule(m, 'W1').items.some(i => i.startsWith('Project management — ')));
  check('W3 flags a parent with one child', rule(m, 'W3').items.some(i => /Snagging|Conveying|Fire protection/.test(i)));
  const flat = W.blank('Flat'); W.addChild(flat, null, { title: 'Only level two', hours: 8, role: 'x' });
  check('W2 warns below three levels', rule(flat, 'W2').state === 'fail');
  const other = W.blank('O'); const top = W.addChild(other, null, { title: 'Branch' });
  W.addChild(other, top, { title: 'Real work', hours: 20, role: 'x' }); W.addChild(other, top, { title: 'Other items', hours: 30, role: 'x' });
  check('W7 flags a catch-all above 10% of its level', rule(other, 'W7').state === 'fail');

  const branches = W.outline(m).rows.filter(r => r.depth === 0);
  check('the 100% rule is a confirmation per branch, not a calculation', rule(m, 'C1').level === 'confirm' && rule(m, 'C1').items.length === branches.length);
  const confirmed = Object.fromEntries(branches.map(r => [r.id, true]));
  check('...and passes once every branch is confirmed', rule(m, 'C1', { confirmed }).state === 'pass');

  const r0 = W.readiness(m, { confirmed });
  check('unacknowledged warnings keep the structure from being created', !r0.ready && r0.unacked.length > 0 && r0.blockers.length === 0);
  const acks = Object.fromEntries(r0.unacked.map(w => [w.id, w.sig]));
  check('acknowledging every warning makes it ready', W.readiness(m, { confirmed, acks }).ready);
  W.outline(m).leaves[1].node.role = '';
  check('an acknowledgement does not cover a warning that has since changed', !W.readiness(m, { confirmed, acks }).ready);
  check('every rule states its basis and provenance', W.validate(m).every(r => r.basis && r.provenance));
}

console.log('\n--- Zoho Projects plan ---');
{
  const m = named('software');
  m.people = { 'Developer': 'Sample Person' };
  const leaves = W.outline(m).leaves;
  m.deps.push({ from: leaves[0].id, to: leaves[1].id });
  const A = W.buildZohoPlan(m), o = W.outline(m);
  check('mapping A: branches become phases', A.phases.length === o.rows.filter(r => r.depth === 0).length);
  check('mapping A: areas become task lists, each under its phase', A.tasklists.length === o.rows.filter(r => r.depth === 1).length && A.tasklists.every(l => l.phase));
  check('mapping A: work packages become tasks, no subtasks', A.counts.tasks === o.leaves.length && A.counts.subtasks === 0);
  check('hours are carried in HH:MM', A.tasks[0].work === W.hhmm(leaves[0].node.hours) && /^\d\d:\d\d$/.test(A.tasks[0].work));
  check('a task is given an owner only where a person is named for its role',
    A.tasks.every(t => (t.role === 'Developer') === (t.owner === 'Sample Person')));
  check('the role and the sample flag travel in the description',
    /Role: /.test(A.tasks[0].description) && /sample figure/.test(A.tasks[0].description));
  check('names carry the WBS code when asked', /^1\.1\.1 /.test(A.tasks[0].name) && /^1 /.test(A.phases[0].name));
  m.options.prefixCodes = false;
  check('...and do not when not asked', !/^\d/.test(W.buildZohoPlan(m).tasks[0].name));
  check('dependencies point at tasks that are in the plan', A.dependencies.length === 1
    && A.tasks.some(t => t.ref === A.dependencies[0].predecessor) && A.dependencies[0].type === 'FS');
  check('the phase mapping warns about the date Zoho stamps on a phase', A.notes.some(n => /day it is created/.test(n)));

  m.options.mapping = 'B';
  const B = W.buildZohoPlan(m);
  check('mapping B: no phases; branches become task lists', B.phases.length === 0 && B.tasklists.length === o.rows.filter(r => r.depth === 0).length);
  check('mapping B: areas become tasks and work packages become subtasks',
    B.counts.tasks === o.rows.filter(r => r.depth === 1).length && B.counts.subtasks === o.leaves.length);
  check('mapping B: parent tasks carry no hours of their own', B.tasks.filter(t => !t.parent).every(t => t.work === null));
  check('every subtask names a parent that is in the plan', B.tasks.filter(t => t.parent).every(t => B.tasks.some(p => p.ref === t.parent)));
  check('every task names a task list that is in the plan', B.tasks.every(t => B.tasklists.some(l => l.ref === t.tasklist)));
  check('plan hours equal the tree total', B.counts.hours === o.total);

  const lone = W.blank('Lone'); W.addChild(lone, null, { title: 'A package at level two', hours: 6, role: 'x' });
  const P = W.buildZohoPlan(lone);
  check('a work package at phase level still gets a task to hold its hours',
    P.phases.length === 1 && P.tasklists.length === 1 && P.tasks.length === 1 && P.tasks[0].work === '06:00');
  m.options.rollup = true;
  check('roll-up is passed to the project and its conditions are stated',
    W.buildZohoPlan(m).project.is_rollup_project === true && W.buildZohoPlan(m).notes.some(n => /cannot be switched off/.test(n)));

  const prompt = W.buildAgentPrompt(m);
  check('hand-off asks for one approval of the whole structure', /One yes covers the whole structure/.test(prompt));
  check('hand-off forbids inviting people and assigning to roles', /Never invite anyone/.test(prompt) && /Roles are not people/.test(prompt));
  check('hand-off stops at the first failure', /Stop at the first failure/.test(prompt));
  check('hand-off always creates a new project', /NEW project/.test(prompt));
  const md = W.renderReport(m);
  check('report lists the structure, the checks and the mapping', /## Structure/.test(md) && /## Checks/.test(md) && /## In Zoho Projects/.test(md));
  check('report never calls sample hours anything but samples', /\(sample\)/.test(md));
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}\n`);
process.exit(failures === 0 ? 0 : 1);
