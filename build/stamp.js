'use strict';
/* Stamps each page's script and stylesheet URLs with a hash of their
 * contents (?v=abc123), so a browser that cached last week's wizard shell
 * cannot run it against this week's steps. Run: node build/stamp.js
 * Order matters: bundle.js first (it writes engine.bundle.js), then this. */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const site = path.join(__dirname, '..', 'site');
const pages = [path.join(site, 'index.html')]
  .concat(fs.readdirSync(path.join(site, 'tools')).filter(f => f.endsWith('.html')).map(f => path.join(site, 'tools', f)));

for (const file of pages) {
  let count = 0;
  const html = fs.readFileSync(file, 'utf8').replace(/((?:src|href)=")([^"?#]+\.(?:js|css))(?:\?v=[0-9a-f]+)?(")/g, (all, pre, url, post) => {
    const target = path.join(path.dirname(file), url);
    if (/^[a-z]+:/i.test(url) || !fs.existsSync(target)) return all;
    count++;
    const hash = crypto.createHash('sha1').update(fs.readFileSync(target)).digest('hex').slice(0, 8);
    return `${pre}${url}?v=${hash}${post}`;
  });
  fs.writeFileSync(file, html);
  console.log(`stamped ${path.relative(path.join(site, '..'), file)} (${count} assets)`);
}
