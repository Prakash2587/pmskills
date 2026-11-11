/* ============================================================================
 * PM Skills — the shared Land step.
 *
 * Every tool ends the same way: hand the result to the user's AI agent (sign up
 * if new, install the skill, connect Zoho Projects, paste the prompt), with the
 * report download and the technical detail kept below it. A tool supplies its
 * own prompt and report; this file supplies the route, the email gate, the
 * install and connect pop-ups and the print-ready report view.
 *
 *   PMLand.route(state, { title, text })        -> html of the guided route
 *   PMLand.downloads(state, [{act, label}])     -> html of the gated download buttons
 *   PMLand.actions({ prompt(state), skillPage, zips, disabled(state) })  -> actions to merge into the tool's
 *   PMLand.openReport(html)                     -> shows a report on white paper with Save as PDF
 *
 * State it reads and writes: landPath, landDone, lead.
 * ========================================================================== */
(function (global) {
  'use strict';

  var esc = global.PMWizard.esc;
  var A = global.PMAgents || {};
  var SIGNUP = A.signup || 'https://www.zoho.com/projects/signup.html?servicename=ZohoProjects';
  var GUIDE = A.zohoGuide || 'https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/developer-space/developer-space-folder/articles/zoho-projects-mcp';
  var CMDS = '/plugin marketplace add Prakash2587/pmskills\n/plugin install pmskills@pmskills';

  function steps(s) {
    var out = [];
    if (s.landPath !== 'existing') out.push({ key: 'signup', act: 'try-zoho', btn: 'Try on Zoho Projects', title: 'Create your Zoho Projects portal', note: 'Your work stays saved here while you sign up.' });
    out.push({ key: 'install', act: 'install', btn: 'Install the skill', title: 'Add the skill to your AI agent', note: 'Claude, ChatGPT, Gemini and others. Type two lines inside Claude Code, or upload two small files.' });
    out.push({ key: 'connect', act: 'connect', btn: 'Connect Zoho Projects', title: 'Let the agent reach your portal', note: 'Switch on MCP access in Zoho Projects, then add its connector in your agent.' });
    out.push({ key: 'prompt', act: 'copy-prompt', btn: 'Copy the hand-off prompt', title: 'Paste it into the agent', note: 'It shows you what it will create and waits for your yes.' });
    return out;
  }

  function route(s, cfg) {
    var done = s.landDone || {}, list = steps(s);
    var nextUp = list.filter(function (r) { return !done[r.key]; })[0];
    return '<section class="handoff"><span class="eyebrow">The quickest way</span><h3>' + esc(cfg.title || 'Hand it to your AI agent') + '</h3>' +
      '<p>' + esc(cfg.text) + '</p>' +
      '<div class="seg"><button type="button" class="' + (s.landPath !== 'existing' ? 'on' : '') + '" data-act="land-path" data-k="new">I am new to Zoho Projects</button>' +
      '<button type="button" class="' + (s.landPath === 'existing' ? 'on' : '') + '" data-act="land-path" data-k="existing">I already use it</button></div>' +
      '<ol class="route">' + list.map(function (r, i) {
        var locked = r.key === 'prompt' && cfg.blocked;
        return '<li class="' + (done[r.key] ? 'done' : '') + '"><span class="route-n">' + (done[r.key] ? global.PMUI.tick : i + 1) + '</span>' +
          '<div><b>' + esc(r.title) + '</b><span class="note">' + esc(locked ? cfg.blocked : r.note) + '</span></div>' +
          '<button class="btn big' + (nextUp && nextUp.key === r.key && !locked ? ' primary' : '') + '" data-act="' + r.act + '"' + (locked ? ' disabled' : '') + '>' + esc(r.btn) + '</button></li>';
      }).join('') + '</ol></section>';
  }

  function downloads(s, formats) {
    return s.lead
      ? '<div class="more-acts">' + formats.map(function (f) { return '<button class="btn small" data-act="' + f.act + '">' + esc(f.label) + '</button>'; }).join('') +
          '<div class="gate-msg">Unlocked for ' + esc(s.lead.email) + ' · <a data-act="lead-change">change</a></div></div>'
      : '<div class="gate-form"><input type="email" id="lead-email" placeholder="you@yourcompany.com" autocomplete="email" aria-label="Work email" data-enter="unlock">' +
          '<button class="btn small" data-act="unlock">Unlock</button>' +
          '<div class="gate-msg" id="lead-err">' + formats.map(function (f) { return f.label; }).join(', ') + '. Company email only.</div></div>';
  }

  function mark(api, key) { api.set(function (s) { s.landDone = s.landDone || {}; s.landDone[key] = true; }); }

  function actions(cfg) {
    return {
      'land-path': function (el, api) { api.set(function (s) { s.landPath = el.getAttribute('data-k'); }); },
      'try-zoho': function (el, api) {
        global.open(SIGNUP, '_blank', 'noopener');
        mark(api, 'signup');
        api.toast('Sign-up opened in a new tab. Your work is saved here.');
      },
      install: function (el, api) {
        mark(api, 'install');
        api.modal('<h3>Install the skill</h3>' +
          '<p>It runs inside your own AI subscription. Each skill travels with the Zoho Projects layer it acts through.</p>' +
          '<h4>Claude Code</h4><p style="margin-top:8px">Type these two lines at the Claude Code prompt — not in a terminal.</p>' +
          '<div class="code">' + esc(CMDS) + '</div>' +
          '<div class="btn-row"><button class="btn primary" data-act="copy-text" data-text="' + esc(CMDS) + '">Copy both lines</button></div>' +
          '<h4>Claude app · ChatGPT · Gemini · others</h4>' +
          '<p style="margin-top:10px">Download both packages and upload each where your agent manages skills.</p>' +
          '<div class="btn-row" style="margin-top:0">' + cfg.zips.map(function (z) {
            return '<a class="btn" href="' + esc(z.href) + '" download>' + esc(z.label) + '</a>';
          }).join('') + '</div>' +
          '<div class="btn-row"><a class="btn ghost" href="' + esc(cfg.skillPage) + '#install" target="_blank" rel="noopener">Detailed steps for each agent →</a></div>');
      },
      connect: function (el, api) {
        mark(api, 'connect');
        api.modal('<h3>Connect Zoho Projects to your agent</h3>' +
          '<p>The agent works through your own Zoho Projects sign-in. Nothing passes through this page.</p>' +
          '<ol class="setup">' +
            '<li><b>Turn on MCP Access in Zoho Projects</b>Portal Configuration → AI Hub → MCP Access.</li>' +
            '<li><b>Turn on API Access</b>Developer Space → API Access &amp; Mobile Access → enable → Update.</li>' +
            '<li><b>Add the Zoho Projects connector in your agent</b>Claude and Gemini list it under Connectors. ChatGPT, Cursor and VS Code take your portal\'s MCP server URL.</li>' +
            '<li><b>Start a new chat with the connector switched on</b>Approve the Zoho sign-in when it asks.</li>' +
          '</ol>' +
          '<div class="btn-row" style="margin-top:0"><a class="btn primary" href="' + GUIDE + '" target="_blank" rel="noopener">Open Zoho\'s connection guide</a></div>' +
          '<p style="margin-top:16px">If the agent cannot reach your portal, the skill walks you through these same steps before it does anything else.</p>');
      },
      'copy-text': function (el, api) {
        global.PMUI.copy(el.getAttribute('data-text')).then(function () { global.PMUI.copied(el); },
          function () { api.toast('Your browser blocked the copy — select the text and copy it by hand.'); });
      },
      'copy-prompt': function (el, api) {
        var text = cfg.prompt(api.state);
        global.PMUI.copy(text).then(function () {
          global.PMUI.copied(el);
          // No re-render: it would replace the button before it can show the tick.
          api.patch(function (s) { s.landDone = s.landDone || {}; s.landDone.prompt = true; });
          var li = el.closest('li');
          if (li) { li.classList.add('done'); li.querySelector('.route-n').innerHTML = global.PMUI.tick; }
        }, function () {
          api.modal('<h3>Copy the hand-off prompt</h3><p>Your browser blocked the automatic copy. Select everything below and copy it.</p>' +
            '<div class="payload-preview">' + esc(text) + '</div>');
        });
      },
      unlock: function (el, api) {
        var box = document.getElementById('lead-email'), msg = document.getElementById('lead-err');
        var res = global.PMEngine.lead.checkWorkEmail(box ? box.value : '');
        if (!res.ok) {
          if (msg) { msg.textContent = res.reason; msg.classList.add('err'); }
          if (box) box.focus();
          return;
        }
        api.set(function (s) { s.lead = { email: res.email, domain: res.domain, at: new Date().toISOString() }; });
      },
      'lead-change': function (el, api) {
        api.set(function (s) { s.lead = null; });
        var box = document.getElementById('lead-email');
        if (box) box.focus();
      }
    };
  }

  /* The report as a designed page. The browser's own "Save as PDF" makes the file. */
  function openReport(html) {
    var view = document.getElementById('report-view');
    if (!view) {
      view = document.createElement('div');
      view.id = 'report-view'; view.className = 'report-view';
      document.body.appendChild(view);
      view.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-report="print"]')) global.print();
        else if (ev.target.closest('[data-report="close"]')) document.body.classList.remove('report-open');
      });
      document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') document.body.classList.remove('report-open'); });
    }
    view.innerHTML = '<div class="report-bar"><span>In the print window, choose <b style="color:#fff">Save as PDF</b> as the destination.</span>' +
      '<div><button class="btn primary" data-report="print">Save as PDF</button><button class="btn" data-report="close">Close</button></div></div>' +
      '<div class="report-sheet">' + html + '</div>';
    document.body.classList.add('report-open');
    view.scrollTop = 0;
  }

  global.PMLand = { route: route, downloads: downloads, actions: actions, openReport: openReport };
})(window);
