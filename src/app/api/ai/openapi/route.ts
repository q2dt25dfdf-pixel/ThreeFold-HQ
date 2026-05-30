/**
 * GET /api/ai/openapi
 *
 * Serves the OpenAPI 3.1 schema for the ThreeFold HQ Jarvis read-only API.
 * Used to configure a Custom GPT Action in ChatGPT settings.
 *
 * - No authentication required (schema contains no secrets).
 * - Cache-Control: public, max-age=3600 (safe to cache — schema changes rarely).
 * - All data endpoints use bearerAuth (AI_API_SECRET as Bearer token).
 * - Health endpoint is intentionally public / no-auth.
 */

// Static: does not read request headers for data, only for server URL.
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Reusable component schemas
// ---------------------------------------------------------------------------

const components = {
  securitySchemes: {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      description:
        "AI API secret. Set once in Custom GPT Action → Authentication → Bearer token. Never include the secret value in prompts or logs.",
    },
  },
  schemas: {
    Meta: {
      type: "object",
      description: "Standard response metadata present on every response.",
      properties: {
        as_of: {
          type: "string",
          format: "date-time",
          description: "ISO 8601 timestamp of when the response data was generated.",
        },
        count: {
          type: "integer",
          description: "Optional result count (present on search responses).",
        },
      },
      required: ["as_of"],
    },

    ErrorResponse: {
      type: "object",
      description: "Returned when the request fails. ok is always false.",
      properties: {
        ok:    { type: "boolean", enum: [false] },
        error: { type: "string", description: "Human-readable error message. Generic — never leaks internals." },
      },
      required: ["ok", "error"],
    },

    ReportItem: {
      type: "object",
      description: "A single item in a morning briefing or auditor section. Safe: order/task name and date only, never client PII.",
      properties: {
        id:     { type: "string" },
        name:   { type: "string", description: "Safe display label (order name, task title, company name)." },
        detail: { type: "string", description: "Optional extra context (e.g. 'Due 2026-06-01', 'No client assigned')." },
      },
      required: ["id", "name"],
    },

    ReportSection: {
      type: "object",
      description: "A grouped category of items in the morning briefing or auditor report.",
      properties: {
        key:   { type: "string", description: "Machine-readable section identifier." },
        label: { type: "string", description: "Human-readable section label." },
        count: { type: "integer" },
        tone:  { type: "string", enum: ["red", "amber", "blue"], description: "Urgency colour for the section. red = critical/overdue, amber = needs attention, blue = informational." },
        items: { type: "array", items: { "$ref": "#/components/schemas/ReportItem" } },
      },
      required: ["key", "label", "count", "items"],
    },

    SearchResult: {
      type: "object",
      description: "A single search result across clients, orders, leads, or vendors.",
      properties: {
        type:   { type: "string", enum: ["client", "order", "lead", "vendor"] },
        id:     { type: "string", description: "Record ID — use with the corresponding detail endpoint." },
        label:  { type: "string", description: "Safe display name (company name, order name, vendor name)." },
        status: { type: "string", description: "Current status or stage." },
        detail: { type: "string", description: "Optional extra context (due date, vendor type, etc.)." },
      },
      required: ["type", "id", "label", "status"],
    },

    ActivityEvent: {
      type: "object",
      description:
        "A single recent activity event. Note content (notes/summary) is NEVER included — only the event type, date, and owner.",
      properties: {
        id:        { type: "string" },
        source:    { type: "string", enum: ["client", "crm"] },
        type:      { type: "string", description: "Contact type: Call, Email, Text, Meeting, In Person, or Other." },
        date:      { type: "string", format: "date" },
        owner:     { type: "string", description: "Founder who logged the activity." },
        relatedId: { type: "string", description: "ID of the related client or CRM lead." },
      },
      required: ["id", "source", "type", "date"],
    },
  },
};

// ---------------------------------------------------------------------------
// Path definitions
// ---------------------------------------------------------------------------

const paths: Record<string, unknown> = {

  "/api/ai/health": {
    get: {
      operationId: "getHealth",
      summary: "API health check",
      description:
        "Unauthenticated liveness check. Returns status 'ok' when the API is reachable. " +
        "Call this first to verify connectivity before sending authenticated requests.",
      security: [],
      responses: {
        "200": {
          description: "API is healthy and reachable.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean", enum: [true] },
                  data: { type: "object", properties: { status: { type: "string", enum: ["ok"] } }, required: ["status"] },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
      },
    },
  },

  "/api/ai/summary": {
    get: {
      operationId: "getSummary",
      summary: "All-up operational summary",
      description:
        "Operational snapshot: task counts, active orders, unpaid invoice balance, " +
        "month-to-date revenue, sales tax owed, and open CRM pipeline value. " +
        "Returns aggregate counts only — no individual records, no PII.",
      responses: {
        "200": {
          description: "Operational summary.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      tasks:    { type: "object", properties: { open: { type: "integer" }, overdue: { type: "integer" } }, required: ["open", "overdue"] },
                      orders:   { type: "object", properties: { active: { type: "integer" }, dueSoon: { type: "integer" } }, required: ["active", "dueSoon"] },
                      invoices: { type: "object", properties: { unpaid: { type: "integer" }, outstandingBalance: { type: "number" } }, required: ["unpaid", "outstandingBalance"] },
                      finances: { type: "object", properties: { revenueCollectedThisMonth: { type: "number" }, salesTaxOwed: { type: "number" } }, required: ["revenueCollectedThisMonth", "salesTaxOwed"] },
                      crm:      { type: "object", properties: { activeLeads: { type: "integer" }, pipelineValue: { type: "number" } }, required: ["activeLeads", "pipelineValue"] },
                    },
                    required: ["tasks", "orders", "invoices", "finances", "crm"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "401": { description: "Missing or invalid Bearer token.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/tasks": {
    get: {
      operationId: "getTasks",
      summary: "Task aggregates and urgent task list",
      description:
        "Returns open task counts (total, overdue, due today, due this week), " +
        "priority breakdown (high/medium/low), per-founder load, and up to 10 urgent tasks " +
        "(overdue first, then high-priority). Task titles are included; notes are excluded.",
      responses: {
        "200": {
          description: "Task aggregates.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      counts: {
                        type: "object",
                        properties: { total: { type: "integer" }, open: { type: "integer" }, overdue: { type: "integer" }, dueToday: { type: "integer" }, dueThisWeek: { type: "integer" } },
                        required: ["total", "open", "overdue", "dueToday", "dueThisWeek"],
                      },
                      byPriority: {
                        type: "object",
                        properties: { high: { type: "integer" }, medium: { type: "integer" }, low: { type: "integer" } },
                        required: ["high", "medium", "low"],
                      },
                      byAssignee: {
                        type: "object",
                        description: "Per-founder task load. Keys are founder first names.",
                        additionalProperties: {
                          type: "object",
                          properties: { open: { type: "integer" }, overdue: { type: "integer" } },
                          required: ["open", "overdue"],
                        },
                      },
                      urgentTasks: {
                        type: "array",
                        maxItems: 10,
                        items: {
                          type: "object",
                          properties: {
                            id:         { type: "string" },
                            title:      { type: "string" },
                            dueDate:    { type: "string" },
                            priority:   { type: "string" },
                            assignedTo: { type: "string" },
                          },
                          required: ["id", "title", "dueDate", "priority", "assignedTo"],
                        },
                      },
                    },
                    required: ["counts", "byPriority", "byAssignee", "urgentTasks"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/orders": {
    get: {
      operationId: "getOrders",
      summary: "Order aggregates and attention list",
      description:
        "Returns active order counts, status breakdown, overdue/due-soon counts, " +
        "recently delivered count, and up to 10 orders needing attention. " +
        "Order names and delivery dates are included; client PII and notes are excluded.",
      responses: {
        "200": {
          description: "Order aggregates.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      counts: {
                        type: "object",
                        properties: {
                          total: { type: "integer" }, active: { type: "integer" },
                          overdue: { type: "integer" }, dueSoon: { type: "integer" },
                          recentlyDelivered: { type: "integer" },
                        },
                        required: ["total", "active", "overdue", "dueSoon", "recentlyDelivered"],
                      },
                      byStatus: {
                        type: "array",
                        items: { type: "object", properties: { status: { type: "string" }, count: { type: "integer" } }, required: ["status", "count"] },
                      },
                      ordersNeedingAttention: {
                        type: "array",
                        maxItems: 10,
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" }, orderName: { type: "string" },
                            status: { type: "string" }, estimatedDeliveryDate: { type: "string" },
                          },
                          required: ["id", "orderName", "status", "estimatedDeliveryDate"],
                        },
                      },
                    },
                    required: ["counts", "byStatus", "ordersNeedingAttention"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/crm": {
    get: {
      operationId: "getCRM",
      summary: "CRM lead pipeline aggregates",
      description:
        "Lead pipeline aggregates: counts by stage and owner, follow-up counts, total pipeline value, " +
        "stale lead count, and up to 10 leads needing attention. " +
        "Business names only — no contact names, emails, phones, or notes.",
      responses: {
        "200": {
          description: "CRM aggregates.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      counts: {
                        type: "object",
                        properties: {
                          total: { type: "integer" }, open: { type: "integer" }, won: { type: "integer" },
                          stale: { type: "integer" }, followUpsDueToday: { type: "integer" }, followUpsDueThisWeek: { type: "integer" },
                        },
                        required: ["total", "open", "won", "stale", "followUpsDueToday", "followUpsDueThisWeek"],
                      },
                      pipelineValue: { type: "number", description: "Total value of open leads in dollars." },
                      byStage: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: { stage: { type: "string" }, count: { type: "integer" }, totalValue: { type: "number" } },
                          required: ["stage", "count", "totalValue"],
                        },
                      },
                      byOwner: {
                        type: "object",
                        description: "Per-founder CRM load. Keys are founder first names.",
                        additionalProperties: {
                          type: "object",
                          properties: { open: { type: "integer" }, stale: { type: "integer" }, followUpsDueToday: { type: "integer" } },
                          required: ["open", "stale", "followUpsDueToday"],
                        },
                      },
                      leadsNeedingAttention: {
                        type: "array",
                        maxItems: 10,
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" }, company: { type: "string" }, stage: { type: "string" },
                            followUpDate: { type: "string", nullable: true }, owner: { type: "string" },
                            status: { type: "string" }, isStale: { type: "boolean" }, isDueToday: { type: "boolean" },
                          },
                          required: ["id", "company", "stage", "owner", "status", "isStale", "isDueToday"],
                        },
                      },
                    },
                    required: ["counts", "pipelineValue", "byStage", "byOwner", "leadsNeedingAttention"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/vendors": {
    get: {
      operationId: "getVendors",
      summary: "Vendor aggregates and sample tracking",
      description:
        "Returns vendor counts by status (active/review/inactive/preferred/approved), " +
        "breakdown by product category and vendor type, sample tracking totals, " +
        "and up to 10 vendors needing attention. " +
        "Vendor names and types are included; contact names, emails, phones, addresses, and pricing notes are excluded.",
      responses: {
        "200": {
          description: "Vendor aggregates.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      counts: {
                        type: "object",
                        properties: {
                          total: { type: "integer" }, active: { type: "integer" }, review: { type: "integer" },
                          inactive: { type: "integer" }, preferred: { type: "integer" }, approved: { type: "integer" },
                        },
                        required: ["total", "active", "review", "inactive", "preferred", "approved"],
                      },
                      byCategory: {
                        type: "array",
                        items: { type: "object", properties: { category: { type: "string" }, count: { type: "integer" } }, required: ["category", "count"] },
                      },
                      byType: {
                        type: "array",
                        items: { type: "object", properties: { type: { type: "string" }, count: { type: "integer" } }, required: ["type", "count"] },
                      },
                      sampleTracking: {
                        type: "object",
                        properties: {
                          notRequested: { type: "integer" }, requested: { type: "integer" }, ordered: { type: "integer" },
                          received: { type: "integer" }, approved: { type: "integer" }, rejected: { type: "integer" },
                        },
                        required: ["notRequested", "requested", "ordered", "received", "approved", "rejected"],
                      },
                      vendorsNeedingAttention: {
                        type: "array",
                        maxItems: 10,
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" }, name: { type: "string" }, type: { type: "string" },
                            status: { type: "string" }, sampleStatus: { type: "string" }, turnaround: { type: "string" },
                          },
                          required: ["id", "name", "type", "status", "sampleStatus", "turnaround"],
                        },
                      },
                    },
                    required: ["counts", "byCategory", "byType", "sampleTracking", "vendorsNeedingAttention"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/reports": {
    get: {
      operationId: "getReports",
      summary: "Morning Briefing, HQ Auditor, and End-of-Day Report",
      description:
        "Three reports in one call: morningBriefing (items needing attention today, allClear flag), " +
        "hqAuditor (data integrity issues, systemHealthy flag), " +
        "endOfDayReport (today's activity summary, hasActivity flag). " +
        "Item names included; all PII and note content excluded.",
      responses: {
        "200": {
          description: "All three reports.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      date: { type: "string", format: "date" },
                      morningBriefing: {
                        type: "object",
                        properties: {
                          allClear:   { type: "boolean" },
                          totalItems: { type: "integer" },
                          taxDue:     { type: "number" },
                          sections:   { type: "array", items: { "$ref": "#/components/schemas/ReportSection" } },
                        },
                        required: ["allClear", "totalItems", "taxDue", "sections"],
                      },
                      hqAuditor: {
                        type: "object",
                        properties: {
                          systemHealthy:  { type: "boolean" },
                          totalCritical:  { type: "integer" },
                          totalWarnings:  { type: "integer" },
                          taxDue:         { type: "number" },
                          critical:       { type: "array", items: { "$ref": "#/components/schemas/ReportSection" } },
                          warnings:       { type: "array", items: { "$ref": "#/components/schemas/ReportSection" } },
                        },
                        required: ["systemHealthy", "totalCritical", "totalWarnings", "taxDue", "critical", "warnings"],
                      },
                      endOfDayReport: {
                        type: "object",
                        properties: {
                          hasActivity:       { type: "boolean" },
                          revenueToday:      { type: "number" },
                          expenseTotalToday: { type: "number" },
                          payments: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: { id: { type: "string" }, name: { type: "string" }, amount: { type: "number" }, type: { type: "string", enum: ["deposit", "final"] } },
                              required: ["id", "name", "amount", "type"],
                            },
                          },
                          completedTasks: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: { id: { type: "string" }, name: { type: "string" }, assignedTo: { type: "string" } },
                              required: ["id", "name"],
                            },
                          },
                          contactsLogged: {
                            type: "array",
                            description: "CRM contacts logged today. Company name and contact type only — no note content.",
                            items: {
                              type: "object",
                              properties: { leadId: { type: "string" }, leadName: { type: "string" }, contactType: { type: "string" } },
                              required: ["leadId", "leadName", "contactType"],
                            },
                          },
                          expensesToday: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: { id: { type: "string" }, name: { type: "string" }, amount: { type: "number" } },
                              required: ["id", "name", "amount"],
                            },
                          },
                        },
                        required: ["hasActivity", "revenueToday", "expenseTotalToday", "payments", "completedTasks", "contactsLogged", "expensesToday"],
                      },
                    },
                    required: ["date", "morningBriefing", "hqAuditor", "endOfDayReport"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/finances": {
    get: {
      operationId: "getFinances",
      summary: "Invoice, expense, and financial position aggregates",
      description:
        "Invoice and expense aggregates: counts, totals, YTD sales tax, per-status breakdown, " +
        "gross profit, and net position. " +
        "Order names used as invoice labels — no client names, emails, Stripe links, or payment links.",
      responses: {
        "200": {
          description: "Finance aggregates.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      invoices: {
                        type: "object",
                        properties: {
                          counts: {
                            type: "object",
                            properties: { total: { type: "integer" }, outstanding: { type: "integer" }, paid: { type: "integer" }, overdue: { type: "integer" }, draft: { type: "integer" }, cancelled: { type: "integer" } },
                            required: ["total", "outstanding", "paid", "overdue", "draft", "cancelled"],
                          },
                          totals: {
                            type: "object",
                            properties: { totalValue: { type: "number" }, revenueCollected: { type: "number" }, outstandingBalance: { type: "number" } },
                            required: ["totalValue", "revenueCollected", "outstandingBalance"],
                          },
                          salesTax: {
                            type: "object",
                            properties: { collectedYTD: { type: "number" }, paidYTD: { type: "number" }, dueYTD: { type: "number" } },
                            required: ["collectedYTD", "paidYTD", "dueYTD"],
                          },
                          byStatus: {
                            type: "array",
                            items: { type: "object", properties: { status: { type: "string" }, count: { type: "integer" }, totalValue: { type: "number" } }, required: ["status", "count", "totalValue"] },
                          },
                          invoicesNeedingAttention: {
                            type: "array",
                            maxItems: 10,
                            items: {
                              type: "object",
                              properties: { id: { type: "string" }, orderName: { type: "string" }, status: { type: "string" }, dueDate: { type: "string" }, balance: { type: "number" } },
                              required: ["id", "orderName", "status", "dueDate", "balance"],
                            },
                          },
                        },
                        required: ["counts", "totals", "salesTax", "byStatus", "invoicesNeedingAttention"],
                      },
                      expenses: {
                        type: "object",
                        properties: {
                          counts: {
                            type: "object",
                            properties: { total: { type: "integer" }, paid: { type: "integer" }, unpaid: { type: "integer" } },
                            required: ["total", "paid", "unpaid"],
                          },
                          totals: {
                            type: "object",
                            properties: { total: { type: "number" }, paid: { type: "number" }, unpaid: { type: "number" } },
                            required: ["total", "paid", "unpaid"],
                          },
                          byCategory: {
                            type: "array",
                            items: { type: "object", properties: { category: { type: "string" }, count: { type: "integer" }, total: { type: "number" } }, required: ["category", "count", "total"] },
                          },
                          expensesNeedingAttention: {
                            type: "array",
                            maxItems: 10,
                            items: {
                              type: "object",
                              properties: { id: { type: "string" }, name: { type: "string" }, category: { type: "string" }, amount: { type: "number" }, expenseDate: { type: "string" }, paidBy: { type: "string" } },
                              required: ["id", "name", "category", "amount", "expenseDate"],
                            },
                          },
                        },
                        required: ["counts", "totals", "byCategory", "expensesNeedingAttention"],
                      },
                      summary: {
                        type: "object",
                        properties: {
                          revenueCollected: { type: "number" },
                          grossProfit:      { type: "number", description: "Revenue collected minus paid vendor costs." },
                          netPosition:      { type: "number", description: "Gross profit minus paid operating expenses." },
                          taxDue:           { type: "number" },
                        },
                        required: ["revenueCollected", "grossProfit", "netPosition", "taxDue"],
                      },
                    },
                    required: ["invoices", "expenses", "summary"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/activity": {
    get: {
      operationId: "getActivity",
      summary: "Recent activity and follow-up history",
      description:
        "Activity counts (today, this week, last 30 days) from client logs and CRM history. " +
        "Breakdown by type and founder. Last 10 recent events. " +
        "Follow-up counts (overdue, due today, due this week). " +
        "Note content is never returned — only activity type, date, and owner.",
      responses: {
        "200": {
          description: "Activity aggregates.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      date: { type: "string", format: "date" },
                      counts: {
                        type: "object",
                        properties: {
                          total: { type: "integer" }, clientActivity: { type: "integer" }, crmComms: { type: "integer" },
                          today: { type: "integer" }, thisWeek: { type: "integer" }, lastThirtyDays: { type: "integer" },
                        },
                        required: ["total", "clientActivity", "crmComms", "today", "thisWeek", "lastThirtyDays"],
                      },
                      byType: {
                        type: "array",
                        items: { type: "object", properties: { type: { type: "string" }, count: { type: "integer" } }, required: ["type", "count"] },
                      },
                      byOwner: {
                        type: "object",
                        description: "Per-founder activity counts. Keys are founder first names.",
                        additionalProperties: {
                          type: "object",
                          properties: { total: { type: "integer" }, today: { type: "integer" }, thisWeek: { type: "integer" } },
                          required: ["total", "today", "thisWeek"],
                        },
                      },
                      recentEvents: {
                        type: "array",
                        maxItems: 10,
                        items: { "$ref": "#/components/schemas/ActivityEvent" },
                      },
                      followUps: {
                        type: "object",
                        properties: {
                          overdue:      { type: "integer" },
                          dueToday:     { type: "integer" },
                          dueThisWeek:  { type: "integer" },
                          overdueItems: {
                            type: "array",
                            maxItems: 10,
                            items: {
                              type: "object",
                              properties: {
                                leadId:      { type: "string" },
                                company:     { type: "string", description: "Business name only — no contact person name." },
                                owner:       { type: "string" },
                                followUpDate: { type: "string", format: "date", nullable: true },
                              },
                              required: ["leadId", "company"],
                            },
                          },
                        },
                        required: ["overdue", "dueToday", "dueThisWeek", "overdueItems"],
                      },
                    },
                    required: ["date", "counts", "byType", "byOwner", "recentEvents", "followUps"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },

    post: {
      operationId: "addActivity",
      summary: "Log a client activity entry",
      description:
        "Logs one client activity entry after founder confirmation. " +
        "Show details and ask 'Shall I log this?' first. " +
        "Append-only — no updates or deletes. " +
        "clientId must match an existing client; returns 404 if not found.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                clientId: {
                  type: "string",
                  description: "ID of the client to log against. Obtain from search results or getClient.",
                },
                type: {
                  type: "string",
                  enum: ["Call", "Email", "Text", "Meeting", "In Person", "Other"],
                  description: "Activity type.",
                },
                date: {
                  type: "string",
                  format: "date",
                  description: "Activity date in YYYY-MM-DD format. Cannot be in the future.",
                },
                owner: {
                  type: "string",
                  description: "Founder who performed this activity (Alliyah, Hannah, or Jordan).",
                },
                note: {
                  type: "string",
                  maxLength: 500,
                  description: "Brief factual description of what happened. No client PII (email/phone/address).",
                },
              },
              required: ["clientId", "type", "date", "owner", "note"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Activity entry created successfully.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      id:        { type: "string", description: "Generated entry ID." },
                      clientId:  { type: "string" },
                      type:      { type: "string" },
                      date:      { type: "string", format: "date" },
                      owner:     { type: "string" },
                      note:      { type: "string" },
                      loggedVia: { type: "string", enum: ["jarvis"], description: "Identifies this as an AI-logged entry." },
                    },
                    required: ["id", "clientId", "type", "date", "owner", "note", "loggedVia"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "400": { description: "Validation error — missing or invalid fields.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "404": { description: "Client not found.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/lead-activity": {
    post: {
      operationId: "addLeadActivity",
      summary: "Log a CRM lead communication entry",
      description:
        "Appends one communication entry to a CRM lead's history after founder confirmation. " +
        "Show details and ask 'Shall I log this?' first. " +
        "Append-only. leadId must match an existing CRM lead; returns 404 if not found.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                leadId: {
                  type: "string",
                  description: "ID of the CRM lead. Obtain from search results or getLead.",
                },
                type: {
                  type: "string",
                  enum: ["Call", "Email", "Text", "Meeting", "In Person", "Other"],
                  description: "Communication type.",
                },
                date: {
                  type: "string",
                  format: "date",
                  description: "Date of the communication (YYYY-MM-DD). Cannot be in the future.",
                },
                owner: {
                  type: "string",
                  description: "Founder who had the communication (Alliyah, Hannah, or Jordan).",
                },
                summary: {
                  type: "string",
                  maxLength: 500,
                  description: "Brief factual summary of what happened. No PII (email/phone/address).",
                },
              },
              required: ["leadId", "type", "date", "owner", "summary"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Communication entry appended successfully.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      id:        { type: "string", description: "Generated entry ID." },
                      leadId:    { type: "string" },
                      type:      { type: "string" },
                      date:      { type: "string", format: "date" },
                      owner:     { type: "string" },
                      summary:   { type: "string" },
                      loggedVia: { type: "string", enum: ["jarvis"] },
                    },
                    required: ["id", "leadId", "type", "date", "owner", "summary", "loggedVia"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "400": { description: "Validation error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "404": { description: "Lead not found.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/task": {
    post: {
      operationId: "createTask",
      summary: "Create a task after founder confirmation",
      description:
        "Creates one HQ task after explicit founder confirmation. " +
        "Show a [JARVIS TASK PREVIEW] and wait for 'yes' before calling. " +
        "Generic tasks appear on the HQ board. " +
        "Lead-linked tasks (optional leadId) count in the lead's openTaskCount but are hidden from the board.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "What needs to get done.",
                },
                assignedTo: {
                  type: "string",
                  enum: ["Alliyah", "Hannah", "Jordan", "All"],
                  description: "Which founder (or All) this task is assigned to.",
                },
                dueDate: {
                  type: "string",
                  format: "date",
                  description: "Due date in YYYY-MM-DD format.",
                },
                priority: {
                  type: "string",
                  enum: ["High", "Medium", "Low"],
                  description: "Task priority. Defaults to Medium if omitted.",
                },
                notes: {
                  type: "string",
                  maxLength: 500,
                  description: "Optional context notes.",
                },
                leadId: {
                  type: "string",
                  description: "Optional CRM lead ID. Links the task to a lead. Returns 404 if not found.",
                },
              },
              required: ["title", "assignedTo", "dueDate"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Task created successfully.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      id:           { type: "string", description: "Generated task ID." },
                      title:        { type: "string" },
                      dueDate:      { type: "string", format: "date" },
                      assignedTo:   { type: "string" },
                      priority:     { type: "string" },
                      notes:        { type: "string" },
                      status:       { type: "string" },
                      completed:    { type: "boolean" },
                      boardVisible: { type: "boolean", description: "True if the task appears on the HQ task board." },
                      leadId:       { type: "string", description: "Present only when a leadId was provided." },
                      createdVia:   { type: "string", enum: ["jarvis"] },
                    },
                    required: ["id", "title", "dueDate", "assignedTo", "priority", "status", "completed", "boardVisible", "createdVia"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "400": { description: "Validation error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "404": { description: "Lead not found (when leadId is provided).", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/pipeline-stage": {
    post: {
      operationId: "updatePipelineStage",
      summary: "Move a CRM lead to a new pipeline stage",
      description:
        "Moves a CRM lead to a new pipeline stage after founder confirmation. " +
        "Show current and new stage and ask 'Shall I move this?' first. " +
        "Deposit Paid is blocked — that cascade must be done manually in HQ.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                leadId: {
                  type: "string",
                  description: "ID of the CRM lead. Obtain from search results or getLead.",
                },
                newStage: {
                  type: "string",
                  enum: [
                    "New Lead", "Contacted", "Design Phase", "Client Review",
                    "Design Approved", "Quote Sent", "Quote Approved",
                  ],
                  description: "Target pipeline stage. Deposit Paid is intentionally excluded — use HQ UI.",
                },
              },
              required: ["leadId", "newStage"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Lead stage updated successfully.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      leadId:        { type: "string" },
                      company:       { type: "string", nullable: true },
                      previousStage: { type: "string", nullable: true },
                      newStage:      { type: "string" },
                      updatedVia:    { type: "string", enum: ["jarvis"] },
                    },
                    required: ["leadId", "previousStage", "newStage", "updatedVia"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "400": { description: "Validation error or Deposit Paid blocked.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "404": { description: "Lead not found.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/search": {
    get: {
      operationId: "search",
      summary: "Search across clients, orders, leads, and vendors",
      description:
        "Searches safe display fields across clients, orders, leads, and vendors. " +
        "Returns up to 5 results per type (20 total). " +
        "Use the returned id with the corresponding detail endpoint for full record details. " +
        "Returns 400 if q is missing or empty.",
      parameters: [
        {
          name: "q",
          in: "query",
          required: true,
          description: "Search query (max 100 characters). Matched against safe display fields only.",
          schema: { type: "string", minLength: 1, maxLength: 100 },
        },
      ],
      responses: {
        "200": {
          description: "Search results.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      query:        { type: "string" },
                      totalResults: { type: "integer" },
                      results:      { type: "array", maxItems: 20, items: { "$ref": "#/components/schemas/SearchResult" } },
                    },
                    required: ["query", "totalResults", "results"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "400": { description: "Missing or empty q parameter.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/client/{id}": {
    get: {
      operationId: "getClient",
      summary: "Client detail summary",
      description:
        "Returns a safe operational summary for a single client by ID. " +
        "Includes: name, industry, status, owner (founder), website, order count, and linked lead count. " +
        "Excludes: email, phone, address, contact person name, and notes.",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Client record ID from search results or other endpoints." }],
      responses: {
        "200": {
          description: "Client summary.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      id:         { type: "string" },
                      name:       { type: "string" },
                      industry:   { type: "string", nullable: true },
                      status:     { type: "string" },
                      owner:      { type: "string", nullable: true },
                      website:    { type: "string", nullable: true },
                      orderCount: { type: "integer" },
                      leadCount:  { type: "integer" },
                    },
                    required: ["id", "name", "status", "orderCount", "leadCount"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "404": { description: "Client not found.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/order/{id}": {
    get: {
      operationId: "getOrder",
      summary: "Order detail summary",
      description:
        "Safe summary for one order: status, delivery date, vendor, quantity, items, owner, " +
        "vendor cost, portal enabled flag, open task count, and invoice state " +
        "(depositPaid, finalPaid, balanceRemaining). " +
        "Excludes notes, delivery address, portal token, and client PII.",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Order record ID." }],
      responses: {
        "200": {
          description: "Order summary.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      id:                    { type: "string" },
                      orderName:             { type: "string" },
                      status:                { type: "string" },
                      isActive:              { type: "boolean" },
                      estimatedDeliveryDate: { type: "string", nullable: true },
                      vendor:                { type: "string", nullable: true },
                      quantity:              { type: "integer", nullable: true },
                      items:                 { type: "array", items: { type: "string" } },
                      owner:                 { type: "string", nullable: true },
                      vendorCost:            { type: "number", nullable: true },
                      vendorPaymentStatus:   { type: "string", nullable: true },
                      vendorInvoiceStatus:   { type: "string", nullable: true },
                      portalEnabled:         { type: "boolean", description: "Whether the client portal is currently enabled for this order. The portal token itself is never returned." },
                      openTaskCount:         { type: "integer" },
                      invoice: {
                        nullable: true,
                        type: "object",
                        description: "Linked invoice summary. null if no invoice is associated with this order.",
                        properties: {
                          id:               { type: "string" },
                          status:           { type: "string" },
                          depositPaid:      { type: "boolean" },
                          finalPaid:        { type: "boolean" },
                          balanceRemaining: { type: "number", description: "Remaining balance due from the client. 0 if fully paid. Use this for final invoice email drafts." },
                        },
                        required: ["id", "status", "depositPaid", "finalPaid", "balanceRemaining"],
                      },
                    },
                    required: ["id", "orderName", "status", "isActive", "items", "portalEnabled", "openTaskCount"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "404": { description: "Order not found.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/lead/{id}": {
    get: {
      operationId: "getLead",
      summary: "CRM lead detail summary",
      description:
        "Safe summary for one CRM lead: stage, status, owner, follow-up date, deal value, source, " +
        "project context, communication count, open task count, and quote/deposit workflow state. " +
        "Excludes contact name, email, phone, notes, communication content, and all public URLs.",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "CRM lead record ID." }],
      responses: {
        "200": {
          description: "Lead summary.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      id:                   { type: "string" },
                      company:              { type: "string" },
                      stage:                { type: "string" },
                      status:               { type: "string" },
                      owner:                { type: "string", nullable: true },
                      followUpDate:         { type: "string", format: "date", nullable: true },
                      value:                { type: "number", nullable: true, description: "Project total value in USD. Updated when a quote is generated." },
                      source:               { type: "string", nullable: true },
                      budget:               { type: "string", nullable: true },
                      quantity:             { type: "string", nullable: true },
                      targetDate:           { type: "string", nullable: true },
                      apparelTypes:         { type: "string", nullable: true },
                      communicationCount:   { type: "integer", description: "Number of logged communication entries. Content is never returned." },
                      openTaskCount:        { type: "integer" },
                      quoteNumber:          { type: "string", nullable: true, description: "Most-recently-sent quote number (e.g. TF-Q-2026-0047). null if no quote has been generated." },
                      latestQuoteStatus:    { type: "string", nullable: true, enum: ["sent", "approved"], description: "'approved' if client approved a quote, 'sent' if a quote was sent but not yet approved, null if no quote has been sent." },
                      quoteApproved:        { type: "boolean", description: "True if the client has approved at least one quote for this lead." },
                      depositRequested:     { type: "boolean", description: "True if a deposit request has been generated and sent for this lead." },
                      depositRequestNumber: { type: "string", nullable: true, description: "Most-recently-sent deposit request number (e.g. TF-D-2026-0023). null if no deposit request has been generated." },
                    },
                    required: ["id", "company", "stage", "status", "communicationCount", "openTaskCount", "quoteApproved", "depositRequested"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "404": { description: "Lead not found.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/vendor/{id}": {
    get: {
      operationId: "getVendor",
      summary: "Vendor detail summary",
      description:
        "Returns a safe operational summary for a single vendor by ID. " +
        "Includes: name, type, status, turnaround time, MOQ, product categories, sample status, " +
        "preferred/approved flags, website, and active order count. " +
        "Excludes: contact person name, email, phone, address, pricing notes, and internal notes.",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Vendor record ID." }],
      responses: {
        "200": {
          description: "Vendor summary.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      id:               { type: "string" },
                      name:             { type: "string" },
                      type:             { type: "string", nullable: true },
                      status:           { type: "string" },
                      turnaround:       { type: "string", nullable: true },
                      moq:              { type: "string", nullable: true },
                      productCategories:{ type: "array", items: { type: "string" } },
                      sampleStatus:     { type: "string" },
                      preferredVendor:  { type: "boolean" },
                      approvedVendor:   { type: "boolean" },
                      website:          { type: "string", nullable: true },
                      activeOrderCount: { type: "integer" },
                    },
                    required: ["id", "name", "status", "productCategories", "sampleStatus", "preferredVendor", "approvedVendor", "activeOrderCount"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "404": { description: "Vendor not found.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Validation — logs to stderr if any operation description exceeds 300 chars
// (ChatGPT Actions rejects schemas with descriptions over 300 characters)
// ---------------------------------------------------------------------------

function warnLongDescriptions(schemaPaths: Record<string, unknown>): void {
  for (const [path, methods] of Object.entries(schemaPaths as Record<string, Record<string, unknown>>)) {
    for (const [method, op] of Object.entries(methods as Record<string, Record<string, unknown>>)) {
      const desc = (op as { description?: string }).description;
      if (desc && desc.length > 300) {
        console.error(
          `[openapi] description exceeds 300 chars (${desc.length}): ${method.toUpperCase()} ${path}`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Schema builder — injects server URL from request host
// ---------------------------------------------------------------------------

function buildSchema(serverUrl: string): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "ThreeFold HQ Jarvis API",
      version: "1.0.0",
      description:
        "Operational API for ThreeFold Supply Co. intended for use by a personal ChatGPT Custom GPT (Jarvis). " +
        "Primarily read-only. Write actions (all require explicit founder confirmation before calling): " +
        "POST /api/ai/activity (log client activity), " +
        "POST /api/ai/lead-activity (log CRM lead communication), " +
        "POST /api/ai/task (create HQ task), " +
        "POST /api/ai/pipeline-stage (move lead to new stage; Deposit Paid blocked). " +
        "No PII is ever returned: no email addresses, phone numbers, physical addresses, " +
        "raw notes, Stripe links, or payment links. " +
        "All data endpoints require a Bearer token (AI_API_SECRET). " +
        "The health endpoint is public and requires no authentication.",
    },
    servers: [{ url: serverUrl, description: "ThreeFold HQ production server" }],
    security: [{ bearerAuth: [] }],
    components,
    paths,
  };
}

// ---------------------------------------------------------------------------
// Route handler — public, no auth required, safe to cache
// ---------------------------------------------------------------------------

export function GET(request: Request): Response {
  const host     = request.headers.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const serverUrl = `${protocol}://${host}`;

  warnLongDescriptions(paths);
  const body = JSON.stringify(buildSchema(serverUrl), null, 2);

  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      // Safe to cache — schema changes only on deploy, not on every request.
      // Downstream clients (GPT, browsers) get a fresh copy within the hour.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
