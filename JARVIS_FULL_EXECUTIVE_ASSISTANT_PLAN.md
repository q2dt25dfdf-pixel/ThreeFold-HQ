# Jarvis Full Executive Assistant Plan
**Prepared:** 2026-05-31  
**Scope:** Architecture vision for Alliyah's unified AI executive assistant across Threefold, Lumadent, and personal life  
**Status:** Research & planning document — no code changes

---

## 1. Executive Summary

Jarvis V1 is complete for Threefold Supply Co. It is a production-proven, ChatGPT-powered operational assistant covering the full quote-to-final-invoice workflow. The next mission is to expand Jarvis into a true **executive assistant for Alliyah** — a system that reduces cognitive overhead across all three domains of her life:

- **Threefold Supply Co.** — already covered (V1)
- **Lumadent** — dental supply sales, Odoo-based CRM, Gmail, and Quo texting
- **Personal** — calendar, health, bills, and content creation

The desired future state is simple: Alliyah wakes up and asks *"Jarvis, what's going on today?"* and receives a prioritized, cross-domain briefing that covers everything she would otherwise have to check manually across 5–8 different applications.

**Core principle:** Jarvis is not another AI tool. Jarvis is an external brain. Its job is not to be impressive — it is to eliminate forgotten follow-ups, missed demos, skipped workouts, overdue bills, and opportunities falling through cracks.

**Recommendation:** Build the Lumadent read-only assistant next. It has the highest concentration of cognitive load (active pipeline, demo prep, follow-ups) and the clearest API path (Odoo + Quo). Threefold V1 patterns are directly reusable.

---

## 2. Recommended Architecture

### 2.1 The Core Problem: ChatGPT Actions Has a 30-Operation Limit

Each Custom GPT Action schema can expose at most **30 operations**. Threefold V1 already uses all 30. A single GPT cannot host both Threefold and Lumadent.

### 2.2 Architecture Options Evaluated

#### Option A: Single Unified GPT
- All domains (Threefold + Lumadent + Personal) in one GPT
- **Hard constraint:** 30 operations is insufficient for 3 domains × ~15 ops each = 45+ needed
- **Verdict:** Not viable without hiding critical functionality

#### Option B: Multiple Specialized GPTs (Recommended for Now)
- **Jarvis / Threefold** — V1 complete, 30 operations
- **Jarvis / Lumadent** — read-only Odoo + Quo + Gmail, up to 30 operations
- **Jarvis / Unified** — master daily briefing, cross-domain aggregation
- User names the GPT at the start: "Jarvis, Lumadent mode" or "Jarvis, daily briefing"
- **Verdict:** Practical, buildable now, each GPT can be purpose-built

#### Option C: Orchestrator Pattern (Future State)
- One master "Jarvis" GPT with a single `getUnifiedDailyBriefing` operation
- Backend aggregates Threefold + Lumadent + Personal data in one API call
- The unified GPT has 30 ops, but most are routing/aggregation ops
- **Verdict:** Best long-term UX, requires backend infrastructure investment

### 2.3 Recommended Architecture: Two GPTs → One Unified Backend

```
┌─────────────────────────────────────────────────────────────┐
│                    ALLIYAH (USER)                           │
│          "Jarvis, what's going on today?"                   │
└───────────────────┬──────────────────────────────────────────┘
                    │
         ┌──────────┴──────────┐
         │   ChatGPT Custom    │
         │   GPT (Jarvis V2)   │
         │   Unified Briefing  │
         └──────────┬──────────┘
                    │ Actions (OpenAPI)
         ┌──────────┴──────────┐
         │  Jarvis Backend API  │
         │  (Next.js / Vercel)  │
         └──┬──────┬──────┬────┘
            │      │      │
    ┌───────┴┐ ┌───┴──┐ ┌─┴──────┐
    │Three-  │ │Odoo  │ │Google  │
    │fold HQ │ │(CRM) │ │APIs    │
    │Supabase│ │      │ │Calendar│
    └────────┘ └──────┘ └────────┘
                    │
                ┌───┴───┐
                │ Quo   │
                │ API   │
                └───────┘
```

**Phase 1 (Lumadent only):**
- New GPT: Jarvis / Lumadent
- New backend: `jarvis-lumadent` API routes (or new Next.js project)
- Read-only endpoints pulling from Odoo CRM
- Optional: Quo message history for call context

**Phase 2 (Unified briefing):**
- New backend endpoint: `GET /api/jarvis/unified-briefing`
- Aggregates: Threefold command center + Lumadent pipeline + Google Calendar
- New GPT: Jarvis / Daily (or upgrade existing Threefold GPT)

**Phase 3 (Personal + Health + Content):**
- Google Calendar personal read
- Health data (Apple Health export or manual input)
- Content schedule (Google Sheet or Notion)

### 2.4 Backend Hosting Recommendation

**Keep the Threefold HQ Next.js app as-is.** Do not add Lumadent code there — that would couple unrelated business systems.

**Options for Lumadent backend:**
1. **New Vercel project** — `lumadent-jarvis.vercel.app` — clean separation, independent deploys
2. **New subdirectory in a shared monorepo** — easier to share auth libraries
3. **Extend threefold-hq with a `/lumadent` API namespace** — simplest to deploy but creates coupling

**Recommendation:** New Vercel project for Lumadent, sharing the same auth pattern (Bearer token via `AI_API_SECRET`). Keep separation clean.

---

## 3. Threefold Assessment

### 3.1 What V1 Covers (Complete)
| Capability | Endpoint | Status |
|---|---|---|
| Command Center | `GET /api/ai/command-center` | ✅ Production |
| Morning Briefing | `GET /api/ai/morning-briefing` | ✅ Production |
| End of Day Summary | `GET /api/ai/end-of-day-summary` | ✅ Production |
| Financial Watchlist | `GET /api/ai/financial-watchlist` | ✅ Production |
| Follow-Up Watchlist | `GET /api/ai/follow-up-watchlist` | ✅ Production |
| Quote Preview | `GET /api/ai/quote-preview` | ✅ Production |
| Quote Create | `POST /api/ai/quote-create` | ✅ Production |
| Quote Send | `POST /api/ai/quote-send` | ✅ Production |
| Deposit Preview | `GET /api/ai/deposit-preview` | ✅ Production |
| Deposit Send | `POST /api/ai/deposit-send` | ✅ Production |
| Invoice Preview | `GET /api/ai/invoice-preview` | ✅ Production |
| Final Invoice Handoff | `POST /api/ai/invoice-action/prepare-final-send` | ✅ Production |
| Client Activity | `POST /api/ai/activity` | ✅ Production |
| Lead Activity | `POST /api/ai/lead-activity` | ✅ Production |
| Task Create | `POST /api/ai/task` | ✅ Production |
| Pipeline Stage | `POST /api/ai/pipeline-stage` | ✅ Production |
| Calendar | `GET /api/ai/calendar` | ✅ Production |
| Search | `GET /api/ai/search` | ✅ Production |
| Detail Lookups | `GET /api/ai/client/{id}` etc. | ✅ Production |

### 3.2 What Worked Well (Reusable Patterns)
1. **Timing-safe auth** (`timingSafeEqual`) — prevents token-oracle attacks
2. **Fail-closed on missing config** — 403 when `AI_API_SECRET` is unset
3. **`{ ok, data, meta: { as_of } }` envelope** — single source of truth for success/failure
4. **`no-cache` on all responses** — prevents stale AI briefing data
5. **`confirm: true` gate on write endpoints** — prevents accidental mutations
6. **Ambiguity protection** — never guesses when multiple matches exist; returns choice list
7. **Parallel table fetches with graceful degradation** — `Promise.all()` + empty-on-error
8. **Red/Amber/Blue priority tiering** — critical items always surface first
9. **Human-readable `reason` strings** on every item — Jarvis can quote these verbatim
10. **`warnLongDescriptions()`** — validates all OpenAPI descriptions ≤ 300 chars at deploy time

### 3.3 What Didn't Work / Required Workarounds
1. **Quote selection complexity** — multiple timestamps + statuses required a dedicated `selectBestQuote()` helper after the "DSF7 incident" (draft $43.75/qty-1 nearly beat sent $4,375/qty-100). **Learning:** Whenever a record can have multiple versions, define a canonical selection algorithm upfront.
2. **Field name inconsistency** (`dueDate` vs `due_date`) — required `readField(camelKey, snakeKey)` dual-lookup helper. **Learning:** Normalize field names in the DB schema early; add a migration helper otherwise.
3. **PII filtering is manual per-endpoint** — each route independently excludes email, phone, payment links. **Learning:** A centralized `sanitizePII(record)` utility would reduce drift risk.
4. **30-operation ChatGPT limit** — required hiding `getSummary`, `getVendors`, `getReports` to add higher-value operations. **Learning:** Budget 30 ops carefully from the start; group read operations to preserve write-action slots.

### 3.4 What Could Be Added to Threefold V2 (Not Priority)
- **Order status update** — re-expose `updateOrderStatus` if operational pattern emerges
- **Client email thread context** — surface recent Gmail threads for a client during quote prep
- **Automated follow-up reminders** — "Quote sent 8 days ago with no response — send follow-up?"

---

## 4. Lumadent Assessment

### 4.1 Business Context
Lumadent is a dental supply company. Alliyah is in a sales/business development role. The workflow involves:
- Prospecting dental offices and dentists
- Scheduling and attending product demos
- Following up after demos
- Moving opportunities through a pipeline to close
- Managing ongoing customer relationships

The primary cognitive load is **follow-up management** — knowing when to reach out, what was discussed in the last interaction, and what the doctor's preferences are.

### 4.2 What Jarvis Can Do for Lumadent
**High Value:**
- "Who do I need to follow up with today?"
- "I have a demo with Dr. Smith tomorrow — what do I need to know?"
- "What's the status of my pipeline?"
- "Which opportunities have gone cold?"
- "What products has this doctor shown interest in before?"

**Medium Value:**
- "What texts have I exchanged with this office recently?"
- "Who has a demo this week?"
- "What's my win rate this month?"

**Lower Value (initial):**
- Automated follow-up sending (risky without review)
- CRM record creation (high error risk)
- Opportunity stage updates without founder review

### 4.3 Current Tool Stack
| Tool | Purpose | Integration Complexity |
|---|---|---|
| **Odoo** | Primary CRM — leads, pipeline, activities, notes | Medium (JSON-RPC API + API key) |
| **Gmail** | Customer email, demo scheduling | Medium (OAuth 2.0, refresh token) |
| **Quo (formerly OpenPhone)** | Customer texting + calls | Low (API key, REST) |

---

## 5. Odoo Assessment

### 5.1 Odoo CRM Data Model

**Primary model: `crm.lead`** — represents both leads and opportunities

| Field | Type | Purpose |
|---|---|---|
| `name` | Char | Lead/opportunity title |
| `contact_name` | Char | Doctor's name (**PII — never return**) |
| `email_from` | Char | Contact email (**PII — never return**) |
| `phone` | Char | Phone number (**PII — never return**) |
| `partner_id` | Many2one | Links to `res.partner` (contact/company) |
| `stage_id` | Many2one | Current pipeline stage |
| `type` | Selection | `lead` or `opportunity` |
| `expected_revenue` | Float | Projected deal value |
| `probability` | Float | Win probability % |
| `date_deadline` | Date | Expected closing date |
| `date_open` | Datetime | When first assigned |
| `date_closed` | Datetime | When won or lost |
| `description` | Text | Internal notes (**PII risk — sanitize**) |
| `activity_ids` | One2many → `mail.activity` | Scheduled follow-ups and calls |
| `user_id` | Many2one | Assigned salesperson (Alliyah) |

**Activities model: `mail.activity`**

| Field | Type | Purpose |
|---|---|---|
| `date_deadline` | Date | When activity is due |
| `summary` | Char | Short description of activity |
| `activity_type_id` | Many2one | Type (Call, Email, Meeting, Demo) |
| `user_id` | Many2one | Who is responsible |
| `res_model` | Char | Parent model (`crm.lead`) |
| `res_id` | Integer | Parent record ID |
| `state` | Selection | `overdue`, `today`, `planned` |

### 5.2 Odoo API Access Pattern

**Authentication:** JSON-RPC or XML-RPC with API key

```
POST {odoo_url}/jsonrpc
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "call",
  "params": {
    "service": "object",
    "method": "execute_kw",
    "args": [db, uid, api_key, "crm.lead", "search_read",
             [[["type","=","opportunity"],["user_id","=",uid]]],
             {"fields": ["name","stage_id","date_deadline","probability"]}]
  }
}
```

**Key search_read calls for Lumadent Jarvis:**

| Endpoint Purpose | Model | Domain Filter |
|---|---|---|
| My pipeline | `crm.lead` | `type=opportunity, user_id=me` |
| Overdue activities | `mail.activity` | `date_deadline<=today, user_id=me` |
| Activities due today | `mail.activity` | `date_deadline=today, user_id=me` |
| Won this month | `crm.lead` | `stage_id.won=true, date_closed>=month_start` |
| Stale opportunities | `crm.lead` | `type=opportunity, write_date<14_days_ago` |

**Important constraint:** Odoo external API requires a **Custom pricing plan** (not Free or Standard). Must verify Lumadent's Odoo subscription tier before building the integration.

### 5.3 Pipeline Stage Design for Lumadent

Typical Odoo CRM stages for dental supply sales:
1. **New Lead** — initial contact identified
2. **Contacted** — first outreach made
3. **Demo Scheduled** — demo appointment confirmed
4. **Demo Completed** — demo held, awaiting decision
5. **Proposal Sent** — pricing/terms shared
6. **Negotiation** — active discussion
7. **Won** — closed
8. **Lost** — closed (negative)

**Audit needed:** Actual stage names should be confirmed by browsing the live Odoo instance.

### 5.4 What Makes a Good Lumadent Daily Briefing

**High signal items for Jarvis:**
1. Activities due today or overdue (calls to make, demos to attend)
2. Opportunities with no activity in 7+ days
3. Demos scheduled in the next 48 hours (with context prep)
4. Opportunities stalled at "Demo Completed" for 5+ days without follow-up
5. Expected closes this week
6. Revenue this month vs. goal

**Lower signal (exclude initially):**
- Notes content (PII risk, too verbose for briefing)
- Historical win/loss breakdown
- Full contact details

---

## 6. Gmail Assessment

### 6.1 What Gmail Contains for Lumadent
- **Demo scheduling** — scheduling confirmation emails, calendar invites sent by customers
- **Pricing conversations** — quotes, product specs shared via email
- **Customer questions** — product inquiries, follow-up emails
- **Vendor/supplier communication** — not relevant for Jarvis assistant role
- **Internal team emails** — team coordination

### 6.2 Gmail API Capabilities
- **OAuth 2.0 required** — refresh token approach (one-time consent, auto-renew)
- **Read threads** by label, search query, or date range
- **Search query syntax:** `from:customer@dental.com newer_than:7d`
- **Key operation:** `messages.list` with query → `messages.get` for content
- **Useful labels:** Inbox, Sent, any custom labels Alliyah has created

### 6.3 What Jarvis Should Extract from Gmail
**For demo briefing:**
- Most recent email from/to the doctor's domain
- Subject lines from the last 5 email threads
- Whether any email is awaiting a reply (sent → no response in 5+ days)

**For daily briefing:**
- Count of unread emails in key folders
- Flagged/starred emails awaiting action
- Demo-related emails in the next 7 days

### 6.4 Gmail Integration Complexity
**Medium complexity.** Key challenges:
1. **OAuth token management** — refresh token must be stored securely server-side; access tokens expire hourly
2. **Email content is PII-dense** — names, addresses, pricing details all in message bodies. Jarvis should only surface subject lines and metadata, never raw body content.
3. **No Gmail-specific Odoo enrichment** — Gmail and Odoo are separate systems; linking them requires matching on email address or company domain (fuzzy matching)

**Recommendation for Phase 1:** Skip Gmail. Focus on Odoo first — it has structured follow-up data without PII complexity. Add Gmail enrichment in Phase 2 for demo briefing context.

---

## 7. Quo Assessment

### 7.1 What Quo Contains
Quo (formerly OpenPhone) is the business phone system for texting and calling customers. For Lumadent it contains:
- **Text message history** with dental offices and doctors
- **Call records** (with transcripts if enabled)
- **Outbound/inbound call logs**
- **Quick follow-up texts** that may not be logged in Odoo

### 7.2 Quo API Capabilities
**Authentication:** API key via `Authorization` header (simple)

**Key endpoints:**
- `GET /v1/messages` — list messages (requires `phoneNumberId` + `participants`)
- `GET /v1/calls` — list calls
- `GET /v1/phone-numbers` — list Quo phone numbers (to get `phoneNumberId`)
- Webhooks: `message.received`, `message.delivered`, `call.completed`

**Message object fields:** `id, to, from, text, direction (incoming/outgoing), status, createdAt`

### 7.3 Quo's Role in Jarvis
**Best use case:** Enriching the demo briefing with recent text context.

*"Dr. Smith demo tomorrow. Last text: 6 days ago — they asked about battery life on the AirLuxe. No reply was sent."*

This requires:
1. Finding the doctor's phone number in Odoo (`phone` or `mobile` field on the lead)
2. Querying Quo for messages with that number
3. Summarizing the last 3-5 messages (direction, date, very brief content)

**PII handling:** Text message content can contain PII. Jarvis should surface date, direction, and a very brief summary — not raw message content.

**Integration complexity:** Low. API key auth, simple REST, small dataset per doctor.

---

## 8. Personal Executive Assistant Assessment

### 8.1 The Cognitive Load Problem
The personal domain is where the highest non-work cognitive load lives. The typical pattern:
- Appointments forgotten or discovered at the last minute
- Bills paid late because they weren't top of mind
- Workouts skipped because the day got away
- Content deadlines missed because they weren't in a single visible place

Jarvis can address this if it has read access to the right sources.

### 8.2 Data Sources Available

| Source | Content | Integration Complexity |
|---|---|---|
| **Google Calendar** | Appointments, deadlines, events | Low (OAuth, Google Calendar API) |
| **Gmail (personal)** | Bills, subscription renewals, important notices | Medium (same OAuth as work Gmail) |
| **Apple Health** | Workouts, steps, sleep | High (no public API; requires app/export) |
| **Google Sheets** | Content schedule (if Alliyah uses one) | Low (Google Sheets API) |
| **Manual input** | Anything not in a digital system | Zero (user tells Jarvis directly) |

### 8.3 What a Personal Briefing Should Include
**APPOINTMENTS:** What is on my calendar today and tomorrow?
**BILLS:** Any bills due in the next 7 days? (Detect from Gmail or manual list)
**HEALTH:** Did I work out yesterday? Am I on track for my weekly goal?
**CONTENT:** Is any podcast/vlog deadline coming up this week?

### 8.4 Phase 1 Personal Approach (Pragmatic)
Skip Apple Health integration initially — it's technically complex and requires either the Apple Health Export app or a third-party health aggregator.

**Start with:**
1. **Google Calendar** — appointments, workouts (if tracked on calendar), content deadlines
2. **Manual health check-in** — "Jarvis, log my workout" as a Jarvis command (simple write endpoint)

**Later:**
3. Gmail for bill detection
4. Content schedule from Google Sheets or Notion

### 8.5 Google Calendar API
- **OAuth 2.0** — same flow as Gmail; one consent grants both
- **Events endpoint:** `GET /calendars/{calendarId}/events` with `timeMin` and `timeMax`
- **Useful fields:** `summary` (title), `start`, `end`, `description` (keep brief), `location`
- **Multiple calendars:** Can read from multiple calendars (work, personal, content)
- **Free/busy:** Can check if a time slot is free without reading event details (privacy-respecting)

---

## 9. Unified Daily Briefing Design

### 9.1 The Desired Interaction
```
Alliyah: "Jarvis, what's going on today?"

Jarvis:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GOOD MORNING — MONDAY, JUNE 2

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

THREEFOLD
• 2 overdue follow-ups: DSF7 (deposit unpaid 12 days), Vanguard (quote expiring today)
• 1 final invoice ready: Harrison Apparel ($4,200 balance)
• 3 orders in production, 1 due this week (Riley & Co.)

LUMADENT
• Demo today at 2pm: Dr. Martinez (Sunshine Dental)
  — Last contact: text 4 days ago ("confirming Tuesday")
  — Products of interest: AirLuxe Pro, ErgoMax
• 3 follow-ups overdue: Dr. Kim (8 days), Valley Ortho (6 days), Smith Dental (5 days)
• Pipeline: 4 active opportunities, $12K expected this quarter

PERSONAL
• Calendar: Demo at 2pm, Team sync at 4pm, nothing tonight
• This week: Podcast episode due Friday
• No bills detected due this week

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TOP 3 ACTIONS
1. Send follow-up to Vanguard — quote expires today
2. Prep for Dr. Martinez demo at 2pm (AirLuxe focus)
3. Send final invoice to Harrison Apparel

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 9.2 Unified Briefing Backend Design

**Single endpoint:** `GET /api/jarvis/unified-briefing`

Internally calls:
1. Threefold HQ API → `getCommandCenter` data
2. Lumadent Odoo API → activities due today + overdue + pipeline summary
3. Google Calendar API → today's events + next 2 days
4. Quo API → optional, surface last message dates for today's demo contacts

**Response structure:**
```json
{
  "date": "2026-06-02",
  "threefold": {
    "urgentItems": [...],
    "topActions": [...]
  },
  "lumadent": {
    "demosToday": [...],
    "overdueFollowUps": [...],
    "pipelineSummary": {...}
  },
  "personal": {
    "calendarToday": [...],
    "calendarTomorrow": [...],
    "contentDeadlines": [...],
    "billsAlerts": []
  },
  "topActions": ["...", "...", "..."],
  "executiveSummary": "...",
  "as_of": "2026-06-02T08:15:00-07:00"
}
```

### 9.3 Demo Briefing Design

**Trigger:** "Jarvis, brief me on my demo with Dr. Martinez"  
**Endpoint:** `GET /api/lumadent/demo-briefing?leadId=...`

**Response:**
```
Doctor: Dr. Martinez
Practice: Sunshine Dental
Demo: Today at 2:00 PM

Products of Interest:
- AirLuxe Pro (mentioned in notes, tested at trade show)
- ErgoMax (inquired about in email thread)

Previous Feedback:
- Prefers wireless devices
- Budget-conscious; asked about financing options

Open Questions:
- Warranty coverage duration
- Monthly payment options

Last Communication:
- Text: 4 days ago ("confirming Tuesday 2pm")
- Email: 11 days ago (product spec sheet sent)

Recommended Talking Points:
- AirLuxe battery life improvements (2026 model)
- 12-month interest-free financing option
- 2-year warranty standard
- ROI comparison: fewer patient chair adjustments

Opportunity Status: Demo Scheduled → Expected close: $3,400
```

---

## 10. Security & Privacy Risks

### 10.1 Data Classification

| Data Type | Sensitivity | Rule |
|---|---|---|
| Doctor names | High PII | Never return in responses |
| Email addresses | High PII | Never return in responses |
| Phone numbers | High PII | Never return in responses |
| Company/practice names | Low | Safe to return |
| Deal values | Business confidential | Return aggregated, not per-contact details to shared users |
| Note/description content | Variable PII | Never return raw; AI-summarized label only |
| Text message content | High PII | Return date + direction + brief summary, never raw text |
| Calendar event titles | Medium | Return event titles; skip descriptions unless specifically requested |
| Health data | Highly personal | Never store server-side; session-only |

### 10.2 API Key Management
- All third-party API keys (Odoo, Quo, Google) stored in environment variables only
- Never embedded in code, committed to git, or returned in API responses
- Separate `.env` per deployment environment (local, staging, production)
- `AI_API_SECRET` for Jarvis authentication remains the same pattern across all systems

### 10.3 OAuth Token Security
- Google OAuth refresh tokens stored server-side (Supabase or environment variable)
- Access tokens never stored — generated fresh per-request using refresh token
- Token scope must be read-only: `gmail.readonly`, `calendar.readonly`
- No domain-wide delegation unless required — prefer per-user consent

### 10.4 Odoo API Key Scope
- Create a dedicated Odoo user for Jarvis with read-only access
- Do not use an admin account's API key
- Restrict access to: `crm.lead`, `mail.activity`, `crm.stage`, `res.partner`
- Log all Jarvis API calls in Odoo audit log (if available on the plan)

### 10.5 Logging Rules
- Never log request bodies that contain PII
- Never log API keys, tokens, or secrets
- Response body logging: log status codes and shapes only, not content
- Follow the same rule as Threefold: `communicationHistory` summary content is never returned

### 10.6 ChatGPT Data Retention
- ChatGPT processes data for conversation context
- Do not include full notes, email bodies, or text message content in Jarvis responses
- Treat Jarvis responses as they might be stored in OpenAI's systems — only business-appropriate context
- No patient data, health data, or personally sensitive personal information

### 10.7 Multi-System Access Risk
As Jarvis spans more systems, a compromised `AI_API_SECRET` grants broader access. Mitigations:
- Use separate `AI_API_SECRET` values per GPT (Threefold GPT ≠ Lumadent GPT)
- Rotate secrets quarterly
- Monitor usage via Vercel function logs for unusual call volumes
- Consider rate limiting on write endpoints (already in place via 429 error code spec)

---

## 11. Phase 1 Roadmap: Lumadent Read-Only

**Goal:** "Jarvis, what's my Lumadent pipeline today?"  
**Timeline:** 2–3 weeks  
**Risk:** Low (read-only, no mutations)

### 11.1 Infrastructure
- [ ] Verify Lumadent's Odoo plan supports external API access
- [ ] Generate Odoo API key (read-only user, not admin)
- [ ] Create new Vercel project: `lumadent-jarvis` (or extend existing)
- [ ] Set environment variables: `ODOO_URL`, `ODOO_DB`, `ODOO_UID`, `ODOO_API_KEY`, `AI_API_SECRET`

### 11.2 Endpoints to Build

| Endpoint | Description | Odoo Model |
|---|---|---|
| `GET /api/lumadent/health` | Health check (no auth) | — |
| `GET /api/lumadent/pipeline` | Active opportunities with stage + days stale | `crm.lead` |
| `GET /api/lumadent/follow-ups` | Activities due today + overdue | `mail.activity` |
| `GET /api/lumadent/demo-briefing` | Context for an upcoming demo | `crm.lead` + `mail.activity` |
| `GET /api/lumadent/morning-briefing` | Full Lumadent daily briefing | All above, aggregated |
| `GET /api/lumadent/lead/{id}` | Detail view of one opportunity | `crm.lead` |
| `GET /api/lumadent/openapi` | OpenAPI schema for ChatGPT Actions | — |

### 11.3 OpenAPI Operation Budget (Lumadent GPT)
Starting budget: 30 operations

| Category | Operations | Count |
|---|---|---|
| Health | getHealth | 1 |
| Read-only | getPipeline, getFollowUps, getDemoBriefing, getMorningBriefing, getLead, search | 6 |
| **Reserve for Phase 2** | — | 23 |

Start with ~7 operations. Preserve 23 slots for write operations, Gmail integration, Quo enrichment, and Phase 2 features.

### 11.4 Data Freshness
- Odoo data: no caching (real-time via API, mark `no-store`)
- Demo briefing: 5-minute cache acceptable (briefing unlikely to change mid-prep)
- Pipeline: no caching (stale pipeline data is harmful)

### 11.5 Testing Plan
- E2E tests matching Threefold pattern (Playwright HTTP, authenticated, skip when key missing)
- Test against a sandbox Odoo account if available
- PII exclusion tests for every endpoint (doctor names, emails, phones must never appear)

---

## 12. Phase 2 Roadmap: Quo + Unified Briefing

**Goal:** "Jarvis, what's going on today?" (cross-domain)  
**Timeline:** 4–6 weeks after Phase 1  
**Risk:** Low (read-only)

### 12.1 Quo Integration
- [ ] Obtain Quo API key from account settings
- [ ] Discover phone number IDs for Lumadent Quo number(s)
- [ ] Build `GET /api/lumadent/recent-messages?phone={e164}` — last 5 messages with a contact
- [ ] Surface in demo briefing: last text date + direction (no raw content)
- [ ] Optional: webhook receiver to log incoming messages to a lightweight store

### 12.2 Enhanced Demo Briefing (Odoo + Quo)
With Quo data:
```
Last Communication:
- Text: 4 days ago (outgoing — awaiting reply)
- Previous text: 8 days ago (incoming — confirmed demo)
```

### 12.3 Google Calendar Integration
- [ ] OAuth consent screen setup (Alliyah grants once)
- [ ] Store refresh token securely
- [ ] Build `GET /api/personal/calendar-today` — today's events (title + time only)
- [ ] Build `GET /api/personal/calendar-week` — next 7 days
- [ ] Content deadline detection: events titled "Podcast", "Vlog", "Deadline"

### 12.4 Unified Briefing Endpoint
- [ ] `GET /api/jarvis/unified-briefing` — aggregates all domains
- [ ] Calls Threefold API internally (or directly queries Supabase)
- [ ] Calls Lumadent Odoo API
- [ ] Calls Google Calendar API
- [ ] Returns merged priority list with `topActions[0..2]`

### 12.5 New GPT: Jarvis / Daily
- Schema exposes only the unified briefing + top-level domain queries
- User says: "Jarvis, good morning" → receives full cross-domain briefing
- Domain-specific actions remain in Threefold GPT and Lumadent GPT

---

## 13. Phase 3 Roadmap: Personal + Health + Content

**Goal:** Full life-admin reduction  
**Timeline:** 3–4 months after Phase 2  
**Risk:** Medium (health data is personal; bill detection requires Gmail body parsing)

### 13.1 Gmail Bill Detection
- [ ] OAuth consent for Gmail read
- [ ] Query: `subject:(invoice OR bill OR payment OR due) newer_than:14d`
- [ ] Extract: sender name, subject, date — never body content
- [ ] Flag emails with "due" or "payment" in subject dated in next 7 days

### 13.2 Health Tracking
**Option A — Apple Health Export** (most accurate, high effort)
- Requires iOS Shortcut or third-party app to push data to an API
- Or: periodic manual export + parse

**Option B — Manual Check-In** (recommended for Phase 3 start)
- Alliyah tells Jarvis: "Log my workout — 45 minutes running"
- Jarvis endpoint: `POST /api/personal/health-log` (write, requires confirm)
- Jarvis stores in lightweight table (Supabase or SQLite)
- Morning briefing shows: streak, last workout date, weekly count

**Option C — Google Fit** (if Alliyah uses Android/Google)
- Google Fit API via OAuth — aggregated steps, active minutes
- Lower accuracy but no manual input required

### 13.3 Content Schedule
- [ ] Google Sheets: maintain content calendar (episode number, due date, status)
- [ ] Jarvis reads: upcoming deadlines in next 14 days
- [ ] Morning briefing surfaces: "Podcast episode 47 due Friday — not yet published"

### 13.4 Lumadent Write Actions (Phase 3)
After read-only is stable and trusted:
- [ ] `POST /api/lumadent/log-activity` — log a call or meeting (confirm required)
- [ ] `POST /api/lumadent/update-stage` — move opportunity to next stage (confirm required)
- [ ] `POST /api/lumadent/schedule-activity` — create follow-up activity (confirm required)

---

## 14. Recommended Implementation Order

### Priority Matrix

| Feature | ROI | Effort | Risk | Priority |
|---|---|---|---|---|
| Lumadent pipeline read | Very High | Low | Low | **1** |
| Lumadent follow-up watchlist | Very High | Low | Low | **2** |
| Lumadent demo briefing (Odoo only) | Very High | Medium | Low | **3** |
| Lumadent morning briefing | High | Low | Low | **4** |
| Quo text enrichment in demo brief | High | Low | Low | **5** |
| Google Calendar personal | High | Medium | Low | **6** |
| Unified cross-domain briefing | Very High | High | Low | **7** |
| Gmail bill detection | Medium | High | Medium | **8** |
| Manual health check-in | Medium | Low | Low | **9** |
| Lumadent write actions | High | Medium | Medium | **10** |
| Apple Health integration | Low | Very High | Low | **11** |
| Content schedule (Google Sheets) | Medium | Low | Low | **12** |

### Implementation Sequence
```
Week 1-2:  Odoo API connection + pipeline endpoint + follow-up endpoint
Week 3:    Demo briefing endpoint + Lumadent GPT in ChatGPT
Week 4:    Quo enrichment + morning briefing endpoint
Month 2:   Google Calendar integration + unified briefing backend
Month 2-3: New unified "Jarvis / Daily" GPT with cross-domain briefing
Month 3-4: Gmail bill detection + manual health log
Month 4+:  Lumadent write actions (after trust is established in read-only)
```

---

## 15. Recommended First Build After Threefold

**Build: Lumadent Jarvis V1 — Read-Only Pipeline & Follow-Up Assistant**

**Why this first:**
1. Highest cognitive load after Threefold — active pipeline with demos, follow-ups, and opportunities
2. Odoo JSON-RPC API is well-documented and proven
3. Threefold patterns (auth, envelope, priority tiers, reason strings) copy directly
4. No PII return is the default — same rule as Threefold
5. Immediate value: "Who do I need to follow up with?" answered in one ChatGPT message
6. Zero risk: read-only means nothing can be corrupted
7. Demo briefing is uniquely high-value — no other tool does this well

**First prompt to hand to Claude for implementation:**
> "Build Lumadent Jarvis V1 — a read-only AI assistant API for Alliyah's Lumadent pipeline. New Next.js project. Connect to Odoo via JSON-RPC + API key. Endpoints: health, pipeline (active opportunities), follow-ups (activities due today + overdue), demo-briefing (pre-demo context for one lead by ID), morning-briefing (daily aggregated summary). Same auth, envelope, and PII rules as Threefold V1. Same test patterns. No write actions. OpenAPI schema for ChatGPT Actions (budget 7 of 30 operations for Phase 1). TypeScript clean. Deploy to Vercel."

---

*Document prepared 2026-05-31. Review before implementation to verify Odoo plan tier, current Quo API docs, and any ChatGPT Actions limit changes.*
