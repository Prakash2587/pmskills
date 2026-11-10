'use strict';
/* ============================================================================
 * Work-email rule for the report gate.
 * ----------------------------------------------------------------------------
 * The gate asks for a company address, so free and throwaway mailboxes are
 * refused by domain. This is a blocklist, not verification: it cannot tell
 * whether a company domain or a mailbox really exists.
 * ========================================================================== */

const FREE_DOMAINS = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'yahoo.in', 'ymail.com', 'rocketmail.com',
  'outlook.com', 'outlook.in', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'live.in', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'tutanota.com', 'tuta.io',
  'zoho.com', 'zohomail.com', 'zohomail.in', 'gmx.com', 'gmx.net', 'gmx.de', 'web.de', 'mail.com', 'email.com',
  'yandex.com', 'yandex.ru', 'mail.ru', 'rediffmail.com', 'fastmail.com', 'hey.com', 'duck.com',
  'qq.com', '163.com', '126.com', 'sina.com', 'naver.com', 'hanmail.net', 'daum.net',
  'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'btinternet.com', 'orange.fr', 'wanadoo.fr', 'free.fr',
  't-online.de', 'libero.it', 'uol.com.br', 'bol.com.br',
];

const DISPOSABLE_DOMAINS = [
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com',
  'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com',
];

const PLACEHOLDER_DOMAINS = ['example.com', 'example.org', 'example.net', 'test.com', 'email.com', 'domain.com'];

const SHAPE = /^[^\s@]+@([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)$/i;

/** Returns { ok, email, domain, reason }. `reason` is ready to show to a person. */
function checkWorkEmail(raw) {
  const email = String(raw == null ? '' : raw).trim().toLowerCase();
  if (!email) return { ok: false, email, domain: '', reason: 'Enter your work email to unlock the report.' };
  const m = email.match(SHAPE);
  if (!m) return { ok: false, email, domain: '', reason: 'That does not look like an email address.' };
  const domain = m[1];
  if (FREE_DOMAINS.includes(domain)) {
    return { ok: false, email, domain, reason: `${domain} is a personal mailbox. Please use your company email.` };
  }
  if (DISPOSABLE_DOMAINS.includes(domain) || PLACEHOLDER_DOMAINS.includes(domain)) {
    return { ok: false, email, domain, reason: `${domain} is not a company mailbox. Please use your company email.` };
  }
  return { ok: true, email, domain, reason: '' };
}

module.exports = { checkWorkEmail, FREE_DOMAINS, DISPOSABLE_DOMAINS };
