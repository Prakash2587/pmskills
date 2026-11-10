/* ============================================================================
 * The AI agents these skills run on: how each one takes a skill and how it
 * connects to Zoho Projects. One list, used by the gallery and every skill page.
 * The visitor's choice is remembered so both pages open on the same agent.
 *
 * Connection paths follow Zoho's "Zoho Projects MCP Server" help article;
 * skill-upload paths follow each vendor's own documentation.
 * ========================================================================== */
(function (global) {
  'use strict';

  var KEY = 'pmskills.agent';
  var MCP_URL = 'paste your portal\'s Zoho Projects MCP URL';

  var AGENTS = [
    { id: 'claude', name: 'Claude',
      plugin: '/plugin marketplace add Prakash2587/pmskills\n/plugin install pmskills@pmskills',
      pluginWhere: 'Claude Code',
      upload: 'In the Claude app, upload each package under Customize → Skills.',
      uploadNote: 'Custom skills need a paid Claude plan with code execution switched on.',
      connect: 'Settings → Customize → Connectors → Discover → Zoho Projects → Connect',
      connectNote: 'On a team plan, an organisation admin adds the connector.' },
    { id: 'chatgpt', name: 'ChatGPT',
      upload: 'Upload each package under Skills → Create → Upload from your computer.',
      uploadNote: 'Skills are offered on ChatGPT workspace plans, and an admin may need to allow uploads.',
      connect: 'Plugins → Add → Add custom MCP server → ' + MCP_URL },
    { id: 'gemini', name: 'Gemini',
      upload: 'Unzip each package into the skills folder your Gemini CLI reads.',
      connect: 'Customize → Connectors → Zoho Projects → authorise' },
    { id: 'cursor', name: 'Cursor',
      upload: 'Unzip each package into your project\'s skills folder.',
      connect: 'Customize → MCPs → New → ' + MCP_URL },
    { id: 'copilot', name: 'Copilot',
      upload: 'Unzip each package into your repository\'s skills folder, and use Copilot in Agent mode in VS Code.',
      connect: 'Command Palette → MCP: Add Server → HTTP → ' + MCP_URL }
  ];

  function get(id) { return AGENTS.filter(function (a) { return a.id === id; })[0] || null; }

  global.PMAgents = {
    list: AGENTS,
    get: get,
    repo: 'https://github.com/Prakash2587/pmskills',
    zohoGuide: 'https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/developer-space/developer-space-folder/articles/zoho-projects-mcp',
    signup: 'https://www.zoho.com/projects/signup.html?servicename=ZohoProjects',
    /** The agent the visitor picked earlier, or null if they have not picked one. */
    chosen: function () { try { return get(global.localStorage.getItem(KEY)); } catch (e) { return null; } },
    choose: function (id) { try { global.localStorage.setItem(KEY, id); } catch (e) { /* the choice lasts for this page only */ } return get(id); },
    /** Segmented buttons for switching agent; the page handles clicks on [data-agent]. */
    tabs: function (currentId) {
      return AGENTS.map(function (a) {
        return '<button type="button" class="' + (a.id === currentId ? 'on' : '') + '" data-agent="' + a.id + '">' + a.name + '</button>';
      }).join('');
    }
  };
})(window);
