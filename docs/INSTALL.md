# Installing the skills

Each skill is a single `SKILL.md` — portable markdown with YAML frontmatter. How you load it depends
on the agent.

## Claude Code (and Gemini CLI)

```bash
# Add this repo as a plugin marketplace
/plugin marketplace add Prakash2587/pmskills

# Install the skill pack (one plugin, both skills)
/plugin install pmskills@pmskills
```

The `pmskills` plugin bundles both skills, so `cost-capacity-optimization` always has the
`zoho-projects-api` reference layer available — you never install it separately.

## Claude.ai / Claude Desktop

1. Open **Settings → Capabilities → Skills**.
2. Click **Add skill** and upload `skills/cost-capacity-optimization/SKILL.md`.
3. Also upload `skills/zoho-projects-api/SKILL.md` so the execution layer is available.
4. Ask a PM question — the skill activates on its own.

## ChatGPT

Paste the contents of `SKILL.md` into a Custom GPT's instructions (strip the YAML frontmatter). For
live Zoho Projects access, connect Zoho's MCP via the Apps SDK.

## Gemini

Add the skill as a Gem instruction, or load it through the Gemini CLI as above. Without MCP, Zoho
access falls back to REST function calls.

## Acting on your Zoho Projects data

The skill reads and writes through **your own** Zoho Projects connection — either:

- **The Zoho Projects MCP** connected in your agent (preferred — you authorise it, nothing routes
  through a third party), or
- **REST with OAuth** for a server-side integration.

Every write — reassigning a task, revising a budget, posting a comment — is **previewed and confirmed
before it happens**. Reads never need confirmation.

## Which plan you need

Budget figures and the workload report require Zoho Projects **Premium**; cross-project workload and
baselines require **Enterprise**. On a lower plan the skill still gives qualitative guidance, but will
tell you plainly which measured findings it cannot produce.
