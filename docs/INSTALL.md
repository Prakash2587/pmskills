# Installing the skills

Each skill travels with one shared layer:

- `cost-capacity-optimization` — who is over capacity, what the week costs, what to change.
- `wbs-builder` — breaks a project into its work and creates it in Zoho Projects as a new project.
- `zoho-projects-api` — the layer both act through: how to read and write Zoho Projects.

Install the skill you want plus `zoho-projects-api`. The Claude Code plugin brings all three.

Each is a folder holding one `SKILL.md` (the open Agent Skills format), so any agent that reads that
format can load them. Setup is the same three steps everywhere: **add the skills, connect Zoho
Projects, ask.**

> Status: the Claude Code plugin path is the one these skills were built around. The upload paths
> below follow each vendor's documentation and have not all been run end to end — if a menu name does
> not match, trust the vendor's current help page over this file.

## 1. Add the skills

### Claude Code

```bash
/plugin marketplace add Prakash2587/pmskills
/plugin install pmskills@pmskills
```

One plugin carries every skill. Type the two lines at the Claude Code prompt, not in a terminal.

### Claude app (web or desktop)

Download both packages and upload each one under **Customize → Skills**:

- [`cost-capacity-optimization.zip`](../site/downloads/cost-capacity-optimization.zip)
- [`wbs-builder.zip`](../site/downloads/wbs-builder.zip)
- [`zoho-projects-api.zip`](../site/downloads/zoho-projects-api.zip)

Each zip holds a folder named after the skill with `SKILL.md` inside, which is the layout the upload
expects. Custom skills need a paid Claude plan with code execution switched on.

### ChatGPT

Upload both packages under **Skills → Create → Upload from your computer**. Skills are offered on
ChatGPT workspace plans, and an admin may need to allow uploads.

### Gemini CLI, Cursor, GitHub Copilot and other agents

Unzip both packages into the skills folder that agent reads. The folder name differs by agent; its
documentation has the current path.

## 2. Connect Zoho Projects

The skills read and write through **your own** Zoho Projects sign-in. Nothing routes through a third
party, and no token is ever shown to the agent.

1. In Zoho Projects: **Portal Configuration → AI Hub → MCP Access** — turn it on.
2. In Zoho Projects: **Developer Space → API Access & Mobile Access** — enable, then Update.
3. In your agent, add the Zoho Projects connector:
   - **Claude:** Settings → Customize → Connectors → Discover → Zoho Projects → Connect.
   - **Gemini:** Customize → Connectors → Zoho Projects.
   - **ChatGPT, Cursor, VS Code (Copilot):** add a custom MCP server with your portal's MCP URL.
4. Start a new chat with the connector switched on, and approve the Zoho sign-in.

Zoho's own guide is the reference for these steps:
[Zoho Projects MCP Server](https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/developer-space/developer-space-folder/articles/zoho-projects-mcp).

If the agent cannot reach the portal, the skill stops and walks you through connecting it.

## 3. Ask

Ask in your own words — "who on my team is over capacity this month?" — or build a plan in the
[planner](../site/tools/cost-capacity.html) and paste its hand-off prompt. The agent then:

- checks what your portal already holds;
- if your people and work are there, reads the measured numbers and shows where they differ from what
  you entered, then proposes each change;
- if the portal is new, sets the plan up as projects and tasks;
- asks which real person each generic name ("Consultant #2") refers to.

Every write — creating a task, reassigning one, revising a budget — is **previewed and confirmed
before it happens**. The skill never writes a cost or billing rate and never invites people; it tells
you what to enter yourself.

## Which plan you need

Budget figures and the workload report require Zoho Projects **Premium**; cross-project workload and
baselines require **Enterprise**. On a lower plan the skill still gives qualitative guidance, but will
tell you plainly which measured findings it cannot produce.
