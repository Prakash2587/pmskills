'use strict';
/* Packages the skills for agents that install by upload rather than by plugin.
 * Run: node build/package.js
 *
 *   skills/<name>/SKILL.md  ->  site/skills/<name>/SKILL.md      (readable on the site)
 *                           ->  site/downloads/<name>.zip        (a <name>/ folder holding SKILL.md)
 *
 * The site copies are generated here so they cannot drift from the skills that
 * actually ship. It also refuses to package a skill that names a sample person,
 * project or currency: a skill must stay generic, and an example name in it is
 * one an agent may repeat back to a real user as if it were their data. */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const C = require('../knowledge/catalog');

const root = path.join(__dirname, '..');
const skillsDir = path.join(root, 'skills');
const outSkills = path.join(root, 'site', 'skills');
const outZips = path.join(root, 'site', 'downloads');

const sampleNames = new Set();
for (const sc of C.SCENARIOS) {
  for (const p of sc.people) { sampleNames.add(p.name); sampleNames.add(p.name.split(' ')[1]); }
  for (const w of sc.work) if (!/^(Internal|All clients)$/.test(w.project)) sampleNames.add(w.project);
}
const PERSON_LIKE = /\b[A-Z]\. [A-Z][a-z]{2,}\b/g;          // "A. Kumar"
const CURRENCY = /[₹€£¥]|(?:A|C|S)?\$\d/g;

function lint(name, text) {
  const hits = [...sampleNames].filter(n => n && text.includes(n))
    .concat(text.match(PERSON_LIKE) || [], text.match(CURRENCY) || []);
  if (hits.length) {
    console.error(`skills/${name}/SKILL.md is not generic — found: ${[...new Set(hits)].join(', ')}`);
    process.exit(1);
  }
}

fs.mkdirSync(outZips, { recursive: true });

for (const name of fs.readdirSync(skillsDir).filter(d => fs.existsSync(path.join(skillsDir, d, 'SKILL.md')))) {
  const text = fs.readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8');
  lint(name, text);

  // Only this skill's generated folder is replaced; the hand-written skill pages beside it stay.
  fs.rmSync(path.join(outSkills, name), { recursive: true, force: true });
  fs.mkdirSync(path.join(outSkills, name), { recursive: true });
  fs.writeFileSync(path.join(outSkills, name, 'SKILL.md'), text);

  const zip = path.join(outZips, `${name}.zip`);
  fs.rmSync(zip, { force: true });
  // -X drops extra file attributes; run from skills/ so the archive holds "<name>/SKILL.md".
  execFileSync('zip', ['-q', '-X', '-r', zip, name, '-x', '*.DS_Store'], { cwd: skillsDir });
  console.log(`packaged ${name}: site/skills/${name}/SKILL.md, site/downloads/${name}.zip (${fs.statSync(zip).size} bytes)`);
}
