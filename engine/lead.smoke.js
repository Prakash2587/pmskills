'use strict';
/* Smoke test for the work-email rule. Run: node engine/lead.smoke.js */

const { checkWorkEmail } = require('./lead');

let failures = 0;
function check(label, cond, extra) {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra !== undefined && !ok ? `\n      ${extra}` : ''}`);
}

check('accepts a company address', checkWorkEmail('maya@apexstudio.com').ok);
check('accepts a subdomain and a plus tag', checkWorkEmail('maya+pm@mail.apex-studio.co.uk').ok);
check('normalises case and whitespace', checkWorkEmail('  Maya@ApexStudio.COM ').email === 'maya@apexstudio.com');
check('reports the domain', checkWorkEmail('maya@apexstudio.com').domain === 'apexstudio.com');

for (const free of ['a@gmail.com', 'a@yahoo.co.in', 'a@outlook.com', 'a@hotmail.com', 'a@icloud.com',
  'a@proton.me', 'a@zoho.com', 'a@rediffmail.com', 'A@GMAIL.COM']) {
  const r = checkWorkEmail(free);
  check(`refuses a personal mailbox: ${free}`, !r.ok && /company email/.test(r.reason), r.reason);
}
check('refuses a throwaway mailbox', !checkWorkEmail('a@mailinator.com').ok);
check('refuses a placeholder domain', !checkWorkEmail('a@example.com').ok);
check('a company that merely contains "gmail" is not refused', checkWorkEmail('a@gmail-partners.com').ok);

for (const bad of ['', '   ', 'maya', 'maya@', '@apex.com', 'maya@apex', 'maya apex@x.com', 'maya@@apex.com', 'maya@apex..com']) {
  check(`refuses a malformed address: "${bad}"`, !checkWorkEmail(bad).ok);
}
check('an empty field asks for the email rather than calling it invalid',
  /Enter your work email/.test(checkWorkEmail('').reason));
check('null and undefined do not throw', !checkWorkEmail(null).ok && !checkWorkEmail(undefined).ok);

console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
