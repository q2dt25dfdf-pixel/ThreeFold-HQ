# Lumadent MCP Access Audit
**Prepared:** 2026-05-31  
**Purpose:** Document actual tool/MCP availability for Lumadent Jarvis integration. Read-only audit — no code written, no records created, no production modifications.

---

## Tool Availability Summary

| Tool / MCP | Expected | Status | Notes |
|---|---|---|---|
| Odoo MCP | Yes (user added) | **NOT ACTIVE** | No tools found via ToolSearch or config |
| Gmail MCP | Yes (user added) | **NOT ACTIVE** | No tools found via ToolSearch or config |
| Quo (OpenPhone) MCP | Yes (user added) | **NOT ACTIVE** | No tools found via ToolSearch or config |
| Shop app MCP | Yes (user added) | **NOT ACTIVE** | No tools found via ToolSearch or config |
| Google Drive MCP | Pre-existing | **ACTIVE** | `mcp__claude_ai_Google_Drive__*` (8 tools) |
| Browser / Playwright | No | Not available | No browser automation tools |
| Standard Claude Code tools | Yes | **ACTIVE** | Read, Edit, Write, Bash, WebFetch, WebSearch, etc. |

---

## Audit Method

Seven ToolSearch queries were run against the deferred tool registry:
1. `"odoo crm lead opportunity"` — no Odoo tools returned
2. `"gmail email message thread label"` — only Google Drive tools returned
3. `"quo openphone sms text call message"` — no Quo tools returned
4. `"shop shopify ecommerce order product"` — no Shop tools returned
5. `"mcp server execute query fetch api"` — no relevant new tools returned
6. `"mcp lumadent odoo jsonrpc execute_kw search_read"` — only WebFetch returned
7. `"mcp google gmail send read list threads"` — only Google Drive tools returned

Configuration files were also inspected directly:

```bash
# ~/.claude.json
cat ~/.claude.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('mcpServers' in d)"
# → False (no mcpServers key)

# ~/.claude/settings.json
cat ~/.claude/settings.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('mcpServers' in d)"
# → False (no mcpServers key)
```

**Conclusion:** Neither configuration file contains an `mcpServers` block. The four MCPs the user intended to add (Odoo, Quo, Gmail, Shop) are not present in any Claude configuration file that was inspected.

---

## Why the MCPs Are Not Loading

Most likely causes, in order of probability:

### 1. MCPs were added to the wrong config file
Claude Code reads `mcpServers` from `~/.claude.json` (global config). If the MCPs were added to a different location (e.g., a workspace-level file, a `.mcp.json`, or a Claude Desktop config rather than the CLI config), they would not load in Claude Code sessions.

**Check:** Open `~/.claude.json` in a text editor and look for an `mcpServers` object. If it is absent, the MCPs were not saved to the right location.

### 2. Session was started before MCPs were added
MCP server connections are established when the Claude Code session starts. If you added the MCPs during an active session, they will only take effect after restarting Claude Code.

**Fix:** Quit and relaunch Claude Code after confirming the config file is correct.

### 3. MCP servers failed to start silently
Even if properly configured, an MCP server can fail to start (wrong path, missing dependency, port conflict) without surfacing an obvious error. Claude Code would show a startup warning but the session would continue without those tools.

**Check:** Launch Claude Code from a terminal (`claude`) and watch for any MCP startup errors or warnings printed to stderr before the session begins.

### 4. Wrong Claude product
Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`) and Claude Code CLI (`~/.claude.json`) use separate MCP configurations. MCPs added in Claude Desktop do not appear in Claude Code sessions.

---

## Troubleshooting Steps

Run through these in order:

**Step 1 — Verify the config file**
```bash
cat ~/.claude.json | python3 -m json.tool | grep -A 20 "mcpServers"
```
If this returns nothing, `mcpServers` is absent from the global config.

**Step 2 — Check what Claude Code expects**
The global config for Claude Code CLI is `~/.claude.json`. The format should be:
```json
{
  "mcpServers": {
    "odoo": {
      "command": "...",
      "args": [...],
      "env": { "ODOO_URL": "...", "ODOO_API_KEY": "..." }
    },
    "quo": { ... },
    "gmail": { ... },
    "shopify": { ... }
  }
}
```

**Step 3 — Restart Claude Code**
After confirming or fixing the config, fully quit Claude Code and relaunch. Watch for MCP connection messages:
```
✓ Connected to MCP server: odoo
✓ Connected to MCP server: quo
```
If you see errors instead, the MCP server binary or command path is wrong.

**Step 4 — Test with a simple ToolSearch**
Once restarted, type a message asking Claude to run ToolSearch for `"odoo"`. If the Odoo MCP is active, Odoo-specific tools will appear.

---

## Odoo Findings (via WebFetch — no MCP)

Without the Odoo MCP, a direct API audit was not possible this session. Based on the Lumadent Odoo architecture documented in `JARVIS_NEXT_STEPS.md`:

| Item | Known |
|---|---|
| Protocol | JSON-RPC over HTTPS |
| Auth method | API key (bearer or `password` field in authenticate call) |
| Primary model | `crm.lead` (type=opportunity) |
| Activities model | `mail.activity` (linked to crm.lead via res_id) |
| API tier requirement | Odoo Custom plan (not Free or Standard) |
| Env vars needed | `ODOO_URL`, `ODOO_DB`, `ODOO_UID`, `ODOO_API_KEY` |

**Blocker:** Cannot confirm API tier or generate an API key without logging into Lumadent's Odoo account. This step requires Alliyah to complete manually (see `JARVIS_NEXT_STEPS.md` Action 1).

---

## Gmail Findings

No Gmail MCP available. Without MCP access, Gmail can be reached via:
- **Google Gmail REST API** using OAuth 2.0 (read-only `gmail.readonly` scope)
- Scopes needed: `https://www.googleapis.com/auth/gmail.readonly`
- Not recommended until Odoo integration is stable (per `JARVIS_FULL_EXECUTIVE_ASSISTANT_PLAN.md` sequencing)

**Blocker:** Google Cloud OAuth consent screen + credentials required. Deferred to Phase 2.

---

## Quo (OpenPhone) Findings

No Quo MCP available. Without MCP access, Quo can be reached via:
- **Quo REST API** at `https://api.openphone.com/v1/`
- Auth: `Authorization: {apiKey}` header (not Bearer — no prefix)
- Key endpoints for Lumadent:
  - `GET /v1/phone-numbers` — list numbers (to get `phoneNumberId`)
  - `GET /v1/messages?phoneNumberId=...&participants[]=+1...` — conversation history
- Rate limit: 100 req/min per API key
- Fields useful for demo briefing: `direction`, `createdAt`, `body` (for recency check only — do not return raw body to Jarvis)

**Blocker:** Quo API key required. This is a low-effort unlock (Action 7 in `JARVIS_NEXT_STEPS.md`); can be done after Odoo integration is working.

---

## Shop App Findings

No Shop app MCP available. "Shop app" in this context likely refers to either:
- **Shopify Admin API** — for product catalog and order management
- **Shopify Storefront API** — for customer-facing reads

Neither is relevant to the Lumadent CRM pipeline work. Shop app integration is not part of the current Lumadent Jarvis roadmap.

---

## Can the Lumadent Demo Briefing Be Built Next?

**Short answer:** Yes, but via direct API integration, not MCP.

The Lumadent Jarvis endpoints (`/api/lumadent/pipeline`, `/api/lumadent/follow-ups`, `/api/lumadent/demo-briefing`, etc.) are a **new Next.js project** (separate from Threefold HQ, per design constraint in `JARVIS_NEXT_STEPS.md`). They call the Odoo JSON-RPC API directly using environment variables — no MCP required.

| Integration path | Status |
|---|---|
| MCP-based (Odoo MCP → Claude reads directly) | Blocked — MCPs not loading |
| Direct API (Next.js route → Odoo JSON-RPC) | **Available** — this is the intended architecture |

The MCP tools would only be needed if the intent were to have Claude browse Odoo interactively during a session. For the production Jarvis endpoints, the Odoo connection is coded directly into the API routes using `ODOO_URL` / `ODOO_API_KEY` env vars.

**What's actually blocking the build:**
- Alliyah needs to confirm Lumadent's Odoo plan supports external API access (Action 1)
- Alliyah needs to generate a read-only API key for a dedicated Jarvis user
- Once those two items are done, the implementation prompt in `JARVIS_NEXT_STEPS.md` (section "Recommended First Implementation Prompt") can be handed to Claude to start building

---

## Safest Integration Path

Given current access:

1. **Alliyah completes Action 1 manually** — Log into Lumadent Odoo, confirm plan tier, generate read-only API key for a new "Jarvis" user account. (~30 min)

2. **Start new Next.js project for Lumadent Jarvis** — Separate repo from Threefold HQ. Copy `aiAuth.ts`, `aiResponse.ts` patterns from Threefold.

3. **Build `GET /api/lumadent/health`** — Public endpoint, no auth. Validates Odoo connectivity. This is the smoke test before building anything else.

4. **Build `GET /api/lumadent/pipeline`** — Authenticated. Returns active opportunities with stage, days stale, probability, revenue. No doctor names, no email addresses.

5. **Build `GET /api/lumadent/follow-ups`** — Authenticated. Returns `mail.activity` records due today + overdue, grouped red/amber/blue.

6. **Build `GET /api/lumadent/demo-briefing?leadId=...`** — Authenticated. Stage history, activity types, product keywords from notes. No raw `description` content.

7. **Create Lumadent GPT in ChatGPT** — Connect OpenAPI schema. Write system prompt enforcing no PII return.

MCP tools are a convenience for interactive exploration; they are not required for any of these build steps.

---

## Recommended First Session Prompt

Once Alliyah has the Odoo API key, hand the following to Claude to begin the build:

> Use the implementation brief in `JARVIS_NEXT_STEPS.md` (section "Recommended First Implementation Prompt") to scaffold the Lumadent Jarvis API project. Environment variables available: `ODOO_URL`, `ODOO_DB`, `ODOO_UID`, `ODOO_API_KEY`. Start with the health endpoint and pipeline endpoint only. Do not build write actions. TypeScript strict. Deploy to Vercel.

---

## Blockers Summary

| Blocker | Owner | Effort | Unblocks |
|---|---|---|---|
| Fix MCP config so tools load in Claude Code | Alliyah | ~15 min | Interactive Odoo exploration via Claude |
| Confirm Lumadent Odoo plan tier | Alliyah | ~10 min | Everything Lumadent |
| Generate read-only Odoo API key (Jarvis user) | Alliyah | ~20 min | All Lumadent API endpoints |
| Quo API key | Alliyah | ~15 min | Demo briefing text enrichment |

**Total human time to unblock full Lumadent build:** ~60 minutes of account setup.

---

*Audit completed 2026-05-31. No code written. No records created. No production modifications made.*
