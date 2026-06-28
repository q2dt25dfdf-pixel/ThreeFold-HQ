# Jarvis Next Steps
**Prepared:** 2026-05-31  
**Purpose:** Actionable roadmap — highest ROI next moves for the Jarvis executive assistant expansion

---

## Top 10 Highest-ROI Next Actions

### Action 1 — Verify Odoo API Access for Lumadent
**What:** Confirm Lumadent's Odoo subscription includes external API access (requires Custom plan, not Free/Standard). Generate a read-only API key from a dedicated Jarvis user account.  
**Why:** This is the single dependency blocking all Lumadent work. Nothing else can start until this is confirmed.  
**Effort:** 30 minutes (account check + key generation)  
**Risk:** Low — if not on Custom plan, Odoo can be upgraded or a workaround explored  
**Dependency:** None — do this first  
**Owner:** Alliyah (account access required)

---

### Action 2 — Build Lumadent Pipeline Endpoint
**What:** `GET /api/lumadent/pipeline` — returns all active opportunities with stage, days stale, expected revenue, and next activity date. No doctor names or email addresses returned.  
**Why:** Answers "what's in my pipeline?" in one ChatGPT message. Immediate daily utility.  
**Effort:** 4–6 hours  
**Risk:** Low (read-only)  
**Dependency:** Action 1 (Odoo API key)

**Fields to return per opportunity:**
- `id`, `opportunityTitle`, `stageName`, `probability`, `expectedRevenue`
- `daysSinceLastActivity`, `nextActivityDate`, `nextActivityType`
- `practiceCity` (non-PII — city only, not full address)
- `daysSinceCreated`, `isStale` (boolean: no activity in 7+ days)

---

### Action 3 — Build Lumadent Follow-Up Watchlist
**What:** `GET /api/lumadent/follow-ups` — returns activities overdue + due today, grouped by urgency. Each item includes a human-readable `reason` string ("Demo follow-up overdue by 6 days").  
**Why:** "Who do I need to call today?" — this is the single highest-frequency daily question. Directly reduces forgotten follow-ups.  
**Effort:** 3–4 hours  
**Risk:** Low (read-only)  
**Dependency:** Action 1

**Priority tiers to use:**
- 🔴 Red: Overdue by 3+ days
- 🟡 Amber: Due today or overdue 1–2 days
- 🔵 Blue: Due tomorrow (preview)

---

### Action 4 — Build Lumadent Demo Briefing Endpoint
**What:** `GET /api/lumadent/demo-briefing?leadId=...` — pre-demo context for one opportunity. Includes stage history, notes summary (not raw), products of interest (from notes keywords), and recommended talking points.  
**Why:** The most unique high-value Jarvis feature for Lumadent — no other tool does this. Transforms demo prep from 10-minute manual CRM digging into one ChatGPT message.  
**Effort:** 6–8 hours (includes note summarization logic)  
**Risk:** Medium (notes may contain PII — must sanitize before returning)  
**Dependency:** Actions 1, 2

**Key design constraint:** Never return raw `description` field content. Extract:
- Days since last activity
- Activity types in history (Demo, Email, Call)
- Keywords from notes that indicate product interest (e.g., "AirLuxe", "ErgoMax")
- Next scheduled activity type and date

---

### Action 5 — Build Lumadent Morning Briefing
**What:** `GET /api/lumadent/morning-briefing` — aggregates pipeline + follow-ups + demos today into one structured response. Same pattern as Threefold's morning briefing.  
**Why:** The "what's going on today?" question, but for Lumadent specifically. Powers the first useful Lumadent GPT.  
**Effort:** 3–4 hours (mostly composition of Actions 2–4)  
**Risk:** Low  
**Dependency:** Actions 2, 3, 4

---

### Action 6 — Deploy Lumadent GPT in ChatGPT
**What:** Create a new ChatGPT Custom GPT called "Jarvis / Lumadent". Connect the Actions schema. Write system instructions that enforce: no PII return, show follow-ups sorted by urgency, confirm before suggesting any action.  
**Why:** Makes all the backend work usable. This is the point where Alliyah can actually type "Jarvis, what's my pipeline?" and get an answer.  
**Effort:** 1–2 hours (schema, instructions, test prompts)  
**Risk:** Low  
**Dependency:** Actions 2–5 deployed to Vercel

---

### Action 7 — Add Quo Enrichment to Demo Briefing
**What:** Extend the demo briefing endpoint to include: last text date, last text direction (sent/received), and whether a response is pending (sent, no reply in 3+ days).  
**Why:** Adds critical context: "You texted Dr. Martinez 4 days ago — no reply. May need to follow up before the demo."  
**Effort:** 3–4 hours  
**Risk:** Low (read-only API key)  
**Dependency:** Action 4, Quo API key

---

### Action 8 — Google Calendar Personal Integration
**What:** `GET /api/personal/calendar-today` and `GET /api/personal/calendar-week` using Google Calendar API + OAuth. Returns event titles and times only (no descriptions). Detects content deadlines from event titles.  
**Why:** Completes the personal layer of the morning briefing. Calendar is the highest-signal personal data source.  
**Effort:** 4–6 hours (OAuth setup is the heaviest part)  
**Risk:** Low (read-only OAuth scope)  
**Dependency:** Google Cloud project setup + OAuth consent

---

### Action 9 — Build Unified Daily Briefing Endpoint
**What:** `GET /api/jarvis/unified-briefing` — aggregates Threefold command center + Lumadent morning briefing + Google Calendar into one structured response with cross-domain `topActions[0..2]`.  
**Why:** This delivers the core vision: "Jarvis, what's going on today?" with a single, unified answer.  
**Effort:** 6–8 hours  
**Risk:** Medium (multiple external dependencies; any one failing should degrade gracefully)  
**Dependency:** Actions 5, 8; access to Threefold HQ data

**Graceful degradation design:**
- If Odoo is down → return Threefold + Calendar, note Lumadent unavailable
- If Google Calendar fails → return Threefold + Lumadent, note Calendar unavailable
- Never fail entirely — partial briefing is better than no briefing

---

### Action 10 — Manual Health Check-In (Jarvis Write Endpoint)
**What:** `POST /api/personal/health-log` — Alliyah tells Jarvis "log my workout: 45-minute run". Stores in a lightweight table. Morning briefing surfaces streak + last workout.  
**Why:** Highest-ROI personal health feature with the least complexity. No Apple Health integration needed.  
**Effort:** 3–4 hours  
**Risk:** Low (personal data, no external dependencies)  
**Dependency:** Action 9 (unified briefing to display the data)

---

## Effort & Risk Summary

| # | Action | Effort | Risk | Dependency |
|---|---|---|---|---|
| 1 | Verify Odoo API access | 0.5 hr | Low | None |
| 2 | Lumadent pipeline endpoint | 5 hrs | Low | 1 |
| 3 | Lumadent follow-up watchlist | 4 hrs | Low | 1 |
| 4 | Lumadent demo briefing | 7 hrs | Medium | 1, 2 |
| 5 | Lumadent morning briefing | 4 hrs | Low | 2, 3, 4 |
| 6 | Deploy Lumadent GPT | 2 hrs | Low | 2–5 |
| 7 | Quo text enrichment | 4 hrs | Low | 4, Quo key |
| 8 | Google Calendar personal | 5 hrs | Low | Google OAuth |
| 9 | Unified daily briefing | 7 hrs | Medium | 5, 8 |
| 10 | Manual health check-in | 4 hrs | Low | 9 |

**Total estimated effort:** ~42 hours of focused implementation  
**MVP for Lumadent (Actions 1–6):** ~23 hours

---

## Next Week Plan

**Day 1 (Monday):**
- [ ] Log into Lumadent Odoo account and confirm API tier
- [ ] Generate read-only API key for Jarvis user
- [ ] Set up new Next.js project (or scaffold API routes in existing project)
- [ ] Test Odoo JSON-RPC connection with a simple `search_read` on `crm.lead`

**Day 2 (Tuesday):**
- [ ] Build `GET /api/lumadent/health` (no auth, public)
- [ ] Build `GET /api/lumadent/pipeline` endpoint
- [ ] Write basic auth layer (copy from Threefold `aiAuth.ts`)
- [ ] Write response envelope (copy from Threefold `aiResponse.ts`)

**Day 3 (Wednesday):**
- [ ] Build `GET /api/lumadent/follow-ups` (activities model)
- [ ] Test: confirm overdue activities surface correctly
- [ ] Write PII exclusion tests for both endpoints

**Day 4 (Thursday):**
- [ ] Begin `GET /api/lumadent/demo-briefing` endpoint
- [ ] Design note keyword extraction (product names → talking points)
- [ ] Test against a real opportunity in Odoo

**Day 5 (Friday):**
- [ ] Build `GET /api/lumadent/morning-briefing` (compose pipeline + follow-ups + demos)
- [ ] Write OpenAPI schema (first 7 operations)
- [ ] Deploy to Vercel
- [ ] Create Lumadent GPT in ChatGPT, run first live test

---

## Next Month Plan

**Week 1:** MVP complete — Lumadent GPT in daily use  
**Week 2:** Add Quo enrichment to demo briefing; test with real demo prep  
**Week 3:** Set up Google OAuth; build Calendar personal endpoint  
**Week 4:** Build unified briefing backend; test cross-domain aggregation  

**End of month goal:** "Jarvis, what's going on today?" returns Threefold + Lumadent + Calendar in one response.

---

## Recommended First Implementation Prompt

Hand this prompt to Claude to start the implementation session:

---

> **Lumadent Jarvis V1 — Implementation Brief**
>
> Build a read-only AI assistant API for Alliyah's Lumadent pipeline. This is a new backend project (separate from Threefold HQ).
>
> **Stack:** Next.js App Router, TypeScript, Vercel deployment
>
> **Odoo connection:**
> - Authentication: JSON-RPC with API key
> - Environment variables: `ODOO_URL`, `ODOO_DB`, `ODOO_UID`, `ODOO_API_KEY`
> - Primary model: `crm.lead` (type=opportunity, user_id=Alliyah's UID)
> - Activities model: `mail.activity` (date_deadline, summary, activity_type_id, res_id)
>
> **Auth pattern:** Copy from Threefold — `validateAIRequest` using timing-safe Bearer token (`AI_API_SECRET`)
>
> **Response envelope:** Copy from Threefold — `{ ok, data, meta: { as_of } }`, always `Cache-Control: no-store`
>
> **Endpoints to build (in order):**
> 1. `GET /api/lumadent/health` — public, no auth, returns `{ ok: true, data: { status: "ok" } }`
> 2. `GET /api/lumadent/pipeline` — authenticated; returns active opportunities with stage, daysSinceLastActivity, nextActivityDate, isStale; NO doctor names, emails, or phone numbers
> 3. `GET /api/lumadent/follow-ups` — authenticated; returns mail.activity records due today + overdue, grouped by urgency (red/amber/blue), each with human-readable `reason` string
> 4. `GET /api/lumadent/demo-briefing?leadId={id}` — authenticated; returns pre-demo context: stage, days since last activity, activity types in history, products of interest extracted from note keywords (AirLuxe, ErgoMax, etc. — define a configurable list); NO raw notes content
> 5. `GET /api/lumadent/morning-briefing` — authenticated; aggregates endpoints 2–4 into a single daily summary with `topActions[]` array
> 6. `GET /api/lumadent/openapi` — public; serves OpenAPI 3.1 schema for ChatGPT Actions (7 operations, all descriptions ≤ 300 chars)
>
> **PII rules (same as Threefold):**
> - Never return: contact_name, email_from, phone, mobile, full address
> - Safe to return: opportunity title (if not a person's name), stage, probability, revenue figures, city only, activity types, dates
>
> **Tests:** Playwright HTTP tests for every endpoint — unauthenticated rejection (3 tests each), input validation, response shape, PII exclusion, OpenAPI schema validation
>
> **TypeScript clean. Deploy to Vercel. Report final operation count.**

---

## What to Intentionally Avoid

1. **Don't build Lumadent write actions first.** Trust must be earned with read-only before Jarvis can safely mutate the CRM.

2. **Don't connect Gmail before Odoo is working.** Odoo has structured data (fields, stages, activities) — Gmail has unstructured data (email bodies). Start with structure.

3. **Don't build Apple Health integration.** The complexity-to-ROI ratio is poor. Manual health check-in or Google Fit delivers 80% of the value at 20% of the effort.

4. **Don't merge Lumadent code into the Threefold HQ repo.** Keep systems separate — different deployment cadences, different teams, different data models.

5. **Don't use admin Odoo credentials for Jarvis.** Create a dedicated read-only user. If that user's key is ever exposed, the blast radius is limited.

6. **Don't return raw notes or description content from Odoo.** The description field on crm.lead is user-typed and likely contains doctor names, pricing negotiations, and personal details. Extract structured signals only.

7. **Don't exceed 7 operations in the Lumadent GPT v1 schema.** Preserve budget for Phase 2 write actions and Gmail enrichment.

8. **Don't build a single "super GPT" yet.** The 30-operation limit makes this impossible without sacrificing functionality. Build specialized GPTs first, unify later when the architecture is proven.

---

*Document prepared 2026-05-31. Ready for implementation session.*
