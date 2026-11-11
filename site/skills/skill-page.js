/* ============================================================================
 * Shared behaviour for every skill's page: the agent tabs, and the three parts
 * of the page that change with the agent (what you need, adding the skills,
 * connecting Zoho Projects). The page sets window.SKILL before loading this:
 *
 *   window.SKILL = { pair: 'html sentence on why two skills travel together',
 *                    zips: ['wbs-builder', 'zoho-projects-api'], planNote: 'html' };
 * ========================================================================== */
(function () {
  'use strict';

  var A = window.PMAgents, S = window.SKILL;
  var agent = A.chosen() || A.list[0];
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var ZIPS = '<div class="dl">' + S.zips.map(function (z) {
    return '<a class="btn" href="../downloads/' + z + '.zip" download>' + z + '.zip</a>';
  }).join('') + '</div>';

  function render() {
    $('agent-tabs').innerHTML = A.tabs(agent.id);
    $('agent-name').textContent = agent.name;

    $('need').innerHTML = '<ul>' +
      '<li><b>' + agent.name + '</b>, on a plan that allows custom skills and connectors.' + (agent.uploadNote ? ' ' + esc(agent.uploadNote) : '') + '</li>' +
      '<li><b>A Zoho Projects portal</b> where you can change settings. <a href="' + A.signup + '" target="_blank" rel="noopener">Create one</a> if you are new.</li>' +
      '<li>' + S.planNote + '</li></ul>';

    $('step-add').innerHTML = '<p>' + S.pair + '</p>' +
      (agent.plugin
        ? '<h3>' + agent.pluginWhere + '</h3><p>Type these two lines at the Claude Code prompt, not in a terminal. One plugin carries every skill.</p><pre>' + esc(agent.plugin) + '</pre>' +
          '<div class="dl"><button class="btn" data-copy="' + esc(agent.plugin) + '">Copy both lines</button></div><h3>Claude app</h3>'
        : '') +
      '<p>Download both packages.</p>' + ZIPS + '<p>' + esc(agent.upload) + '</p>' +
      '<div class="check"><b>Check</b><span>Both skills appear in ' + agent.name + '\'s list of skills.</span></div>';

    $('step-connect').innerHTML =
      '<p>The skill works through your own Zoho Projects sign-in. Nothing passes through this site.</p>' +
      '<ol><li><b>Sign in to Zoho Projects</b> as someone who can change portal settings.</li>' +
      '<li><b>Turn on MCP Access:</b> Portal Configuration → AI Hub → MCP Access.</li>' +
      '<li><b>Turn on API Access:</b> Developer Space → API Access &amp; Mobile Access → enable → Update.</li>' +
      '<li><b>Add the connector in ' + agent.name + ':</b></li></ol>' +
      '<div class="path">' + esc(agent.connect) + '</div>' +
      (agent.connectNote ? '<p class="fine">' + esc(agent.connectNote) + '</p>' : '') +
      '<p>Approve the Zoho sign-in when it asks, then start a new chat with the connector switched on.</p>' +
      '<div class="check"><b>Check</b><span>Ask “List my Zoho Projects projects.” It should name your real projects.</span></div>' +
      '<p class="fine">Menu names change between versions. If a step does not match what you see, follow <a href="' + A.zohoGuide + '" target="_blank" rel="noopener">Zoho\'s connection guide</a>.</p>';
  }

  document.addEventListener('click', function (ev) {
    var tab = ev.target.closest('[data-agent]');
    if (tab) { agent = A.choose(tab.getAttribute('data-agent')) || agent; render(); return; }
    var c = ev.target.closest('[data-copy]');
    if (c) window.PMUI.copy(c.getAttribute('data-copy')).then(function () { window.PMUI.copied(c); }, function () {});
  });

  $('theme-slot').innerHTML = window.PMUI.themeToggle();
  render();
})();
