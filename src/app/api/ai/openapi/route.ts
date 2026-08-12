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

    CalendarEvent: {
      type: "object",
      description: "A single HQ calendar event. Notes and source are never included.",
      properties: {
        id:         { type: "string" },
        title:      { type: "string" },
        date:       { type: "string", format: "date", description: "Event date (YYYY-MM-DD)." },
        time:       { type: "string", description: "Start time in 24-hour HH:MM format, or null if all-day." },
        endTime:    { type: "string", description: "End time in 24-hour HH:MM format, or null." },
        type:       { type: "string", enum: ["Client Meeting", "Demo", "Video Call", "Delivery", "Deadline", "Internal Meeting", "Other"] },
        priority:   { type: "string", enum: ["High", "Medium", "Low"] },
        assignedTo: { type: "array", items: { type: "string" }, description: "Founder names assigned to this event." },
      },
      required: ["id", "title", "date", "type", "assignedTo"],
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
                          revenueCollected: { type: "number", description: "Total revenue collected: custom invoices (tax-inclusive) plus shop revenue net of tax. Matches the Finances page Collected headline." },
                          customRevenueCollected: { type: "number", description: "Custom-invoice portion of revenueCollected." },
                          shopRevenueNet:   { type: "number", description: "Shop portion of revenueCollected, net of sales tax." },
                          grossProfit:      { type: "number", description: "Revenue collected minus paid vendor costs." },
                          netPosition:      { type: "number", description: "Gross profit minus paid operating expenses and minus custom-invoice sales tax held for CDTFA (all years, unremitted). Matches the Finances page Net Position." },
                          taxDue:           { type: "number" },
                          customTaxHeldAllYears: { type: "number", description: "Custom-invoice sales tax collected and not yet remitted, all years — the net-position deduction." },
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

  "/api/ai/quote-preview": {
    get: {
      operationId: "previewQuote",
      summary: "Preview the most recent quote for a CRM lead",
      description:
        "Read-only preview of a CRM lead's quote. Accepts leadId, quoteNumber, company, or contactName. " +
        "Multiple company/contact matches returns a choice list — never guesses. " +
        "No records created.",
      parameters: [
        {
          name: "leadId",
          in: "query",
          required: false,
          description: "CRM lead UUID. Highest priority — use this when known.",
          schema: { type: "string" },
        },
        {
          name: "quoteNumber",
          in: "query",
          required: false,
          description: "Quote number (e.g. TF-Q-2026-0022). Returns that exact quote.",
          schema: { type: "string" },
        },
        {
          name: "company",
          in: "query",
          required: false,
          description: "Lead company name (partial, case-insensitive). Returns ambiguity list if multiple match.",
          schema: { type: "string" },
        },
        {
          name: "contactName",
          in: "query",
          required: false,
          description: "Lead contact person name (partial, case-insensitive). Used as lookup key only — never returned.",
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": {
          description: "Quote preview. hasExistingQuote is false if no quote has been generated yet.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      leadId:            { type: "string" },
                      company:           { type: "string", nullable: true },
                      stage:             { type: "string", nullable: true },
                      hasExistingQuote:  { type: "boolean" },
                      message:           { type: "string", description: "Human-readable status — present when hasExistingQuote is false or ambiguous is true." },
                      quoteId:           { type: "string", description: "Present when hasExistingQuote is true." },
                      quoteNumber:       { type: "string", nullable: true },
                      quoteStatus:       { type: "string", nullable: true, description: "'draft', 'sent', or 'approved'." },
                      expirationDate:    { type: "string", nullable: true, description: "ISO 8601 date (YYYY-MM-DD)." },
                      lineItems: {
                        nullable: true,
                        type: "array",
                        description: "Quote line items. null for quotes generated before line items UI existed.",
                        items: {
                          type: "object",
                          properties: {
                            name:        { type: "string" },
                            description: { type: "string" },
                            quantity:    { type: "number" },
                            unitPrice:   { type: "number" },
                            lineTotal:   { type: "number" },
                          },
                        },
                      },
                      subtotal:          { type: "number", nullable: true },
                      salesTaxRate:      { type: "number", nullable: true },
                      salesTaxAmount:    { type: "number", nullable: true },
                      grandTotal:        { type: "number", nullable: true },
                      depositEstimate:   { type: "number", nullable: true, description: "50% of grandTotal. null if grandTotal is null." },
                      publicLink:        { type: "string", nullable: true, description: "Live public quote URL. Share with founders only — not directly to clients." },
                      resolvedBy:           { type: "string", description: "'leadId', 'quoteNumber', 'company', or 'contactName' — how the lead was found." },
                      totalQuotesForLead:   { type: "integer", description: "Total number of quotes in the system for this lead. >1 means other quotes exist." },
                      selectionNote:        { type: "string", description: "Explains which quote was selected and why. Always show this to the founder when totalQuotesForLead > 1." },
                      selectionWarning:     { type: "string", nullable: true, description: "Present when the selected quote is a draft (not yet sent). Show to founder and ask them to confirm before proceeding to deposit-send." },
                      isRevised:            { type: "boolean", description: "True if the lead is currently at 'Quote Sent' stage, indicating a revised quote flow." },
                      emailSubject:      { type: "string", description: "Email subject matching HQ SendQuoteModal. Present when hasExistingQuote is true." },
                      emailBodyPreview:  { type: "string", description: "Full email body preview matching HQ SendQuoteModal templates. Company name used as contact fallback." },
                      ambiguous:         { type: "boolean", description: "True when multiple leads matched (matches array) or multiple equally-valid quotes found (candidates array). Never guesses — show choices and ask founder." },
                      matchCount:        { type: "integer", description: "Number of leads or quotes matched. Present when ambiguous is true." },
                      matches: {
                        type: "array",
                        description: "Lead choice list when multiple leads matched the company/contact search. Show to founder.",
                        items: {
                          type: "object",
                          properties: {
                            leadId:      { type: "string" },
                            company:     { type: "string", nullable: true },
                            stage:       { type: "string", nullable: true },
                            quoteNumber: { type: "string", nullable: true },
                          },
                          required: ["leadId"],
                        },
                      },
                      candidates: {
                        type: "array",
                        description: "Quote choice list when multiple equally-valid quotes exist for the same lead. Show to founder — use quoteNumber=<number> to select.",
                        items: {
                          type: "object",
                          properties: {
                            quoteId:     { type: "string" },
                            quoteNumber: { type: "string", nullable: true },
                            status:      { type: "string", nullable: true, description: "'sent' or 'draft'." },
                            grandTotal:  { type: "number", nullable: true },
                            sentDate:    { type: "string", nullable: true },
                            createdAt:   { type: "string", nullable: true },
                          },
                          required: ["quoteId"],
                        },
                      },
                    },
                    required: [],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "400": { description: "No lookup parameter provided.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "404": { description: "Lead or quote not found.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/deposit-preview": {
    get: {
      operationId: "previewDeposit",
      summary: "Preview the most recent deposit request for a CRM lead",
      description:
        "Preview of the most recent deposit request for a CRM lead. " +
        "Find by leadId, depositNumber (e.g. TF-D-2026-0001), or q (partial company name). " +
        "Ambiguous q returns a choice list. " +
        "Returns emailSubject and emailBodyPreview matching HQ SendDepositModal. " +
        "No records created. Read-only.",
      parameters: [
        {
          name: "leadId",
          in: "query",
          required: false,
          description: "CRM lead UUID. Highest priority — use when known.",
          schema: { type: "string" },
        },
        {
          name: "depositNumber",
          in: "query",
          required: false,
          description: "Deposit request number (e.g. TF-D-2026-0001). Returns that exact deposit.",
          schema: { type: "string" },
        },
        {
          name: "q",
          in: "query",
          required: false,
          description: "Partial, case-insensitive company name search. Returns choice list if multiple match.",
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": {
          description: "Deposit preview. hasExistingDeposit is false if no deposit has been generated yet.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    description:
                      "Deposit preview, ambiguous choice list, or no-deposit message. " +
                      "When ambiguous is true, show matches to the founder and ask which lead they mean.",
                    properties: {
                      // ── Single result ───────────────────────────────────
                      leadId:         { type: "string" },
                      company:        { type: "string", nullable: true, description: "Business name — no contact PII." },
                      depositId:      { type: "string" },
                      depositNumber:  { type: "string", nullable: true, description: "Formatted request number (e.g. TF-D-2026-0001)." },
                      depositAmount:  { type: "number", description: "Amount due from the client for this deposit." },
                      totalAmount:    { type: "number", description: "Full project value." },
                      grandTotal:     { type: "number", nullable: true, description: "Grand total including tax. Equal to totalAmount when tax is included." },
                      balanceRemaining: { type: "number", description: "Remaining balance after deposit. 0 when deposit is paid." },
                      status:         { type: "string", description: "'draft', 'pending', 'payment_failed', or 'paid'." },
                      sentDate:       { type: "string", format: "date", nullable: true, description: "Date the deposit request was sent. null if not yet sent." },
                      lineItems: {
                        type: "array",
                        nullable: true,
                        description: "Line items carried over from the quote. null if no quote was linked.",
                        items: {
                          type: "object",
                          properties: {
                            name:        { type: "string" },
                            description: { type: "string" },
                            quantity:    { type: "number" },
                            unitPrice:   { type: "number" },
                            lineTotal:   { type: "number" },
                          },
                        },
                      },
                      subtotal:       { type: "number", nullable: true },
                      salesTaxRate:   { type: "number", nullable: true },
                      salesTaxAmount: { type: "number", nullable: true },
                      publicLink:     { type: "string", nullable: true, description: "Live deposit URL. Share with founders only — not directly to clients." },
                      emailSubject:   { type: "string", description: "Email subject matching HQ SendDepositModal." },
                      emailBodyPreview: { type: "string", description: "Full email body preview matching HQ SendDepositModal template." },
                      verificationSummary: { type: "string", description: "Plain-language summary of the deposit state. Quote directly to the founder for confirmation." },
                      totalDepositsForLead: { type: "integer", description: "Total deposits on file for this lead. >1 means other deposit requests exist." },
                      selectionNote:  { type: "string", description: "Explains which deposit was selected and why." },
                      hasExistingDeposit: { type: "boolean", description: "False when no deposit has been generated yet." },
                      message:        { type: "string", description: "Human-readable status — present when hasExistingDeposit is false or ambiguous is true." },
                      nextStepGuidance: { type: "string", description: "Present when hasExistingDeposit is false. Instructs Jarvis to call POST /api/ai/deposit-send to create and send a deposit." },
                      // ── Ambiguous ───────────────────────────────────────
                      ambiguous:  { type: "boolean", description: "True when q matched multiple leads." },
                      matchCount: { type: "integer" },
                      matches: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            leadId:  { type: "string" },
                            company: { type: "string", nullable: true },
                            stage:   { type: "string", nullable: true },
                          },
                          required: ["leadId"],
                        },
                      },
                    },
                    required: [],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "400": { description: "No lookup parameter provided.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "404": { description: "Lead or deposit not found.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/quote-send": {
    post: {
      operationId: "sendQuote",
      summary: "Send or draft a quote email after founder confirmation",
      description:
        "Sends a quote via Gmail API (or Resend fallback) after founder confirmation. " +
        "action: 'send' (default) delivers immediately and advances lead to 'Quote Sent'. " +
        "action: 'draft' saves to Gmail Drafts — lead stage NOT advanced. " +
        "Requires confirm: true — show quote-preview first. Never generates a quote.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                quoteId: {
                  type: "string",
                  description: "Quote ID from GET /api/ai/quote-preview. Never guess — always use preview result.",
                },
                sender: {
                  type: "string",
                  enum: ["Alliyah", "Hannah", "Jordan"],
                  description: "Founder sending the quote. Ask if not already specified.",
                },
                confirm: {
                  type: "boolean",
                  enum: [true],
                  description: "Must be boolean true. Only set after founder explicitly confirms the preview.",
                },
                action: {
                  type: "string",
                  enum: ["send", "draft"],
                  description: "send (default): delivers via Gmail API and advances lead to Quote Sent. draft: saves to Gmail Drafts only — no stage change. Omit (or use 'send') unless founder explicitly asks for a draft.",
                },
              },
              required: ["quoteId", "sender", "confirm"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Quote sent or drafted. When sent: lead advanced to 'Quote Sent'. When drafted: lead stage unchanged, draft saved to Gmail Drafts.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      sent:          { type: "boolean", description: "True when action is 'send'." },
                      drafted:       { type: "boolean", description: "True when action is 'draft'." },
                      sentVia:       { type: "string", enum: ["gmail", "gmail_draft", "resend"], description: "gmail = sent via Gmail API; gmail_draft = saved to Drafts; resend = sent via Resend fallback." },
                      draftId:       { type: "string", description: "Gmail draft ID. Present when drafted is true." },
                      openUrl:       { type: "string", description: "URL to open Gmail Drafts. Present when drafted is true." },
                      quoteId:       { type: "string" },
                      quoteNumber:   { type: "string", nullable: true },
                      publicLink:    { type: "string", description: "Live quote URL." },
                      leadId:        { type: "string" },
                      company:       { type: "string", nullable: true },
                      previousStage: { type: "string", nullable: true, description: "Present when sent." },
                      newStage:      { type: "string", enum: ["Quote Sent"], description: "Present when sent. Not set when drafted." },
                      isRevised:     { type: "boolean", description: "True if the lead was already at Quote Sent (revised quote flow)." },
                      sentAt:        { type: "string", format: "date-time", description: "Present when sent." },
                      draftedAt:     { type: "string", format: "date-time", description: "Present when drafted." },
                      emailSubject:  { type: "string" },
                      note:          { type: "string", description: "Human-readable status. Present when drafted." },
                    },
                    required: ["quoteId", "publicLink", "leadId", "emailSubject"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "400": { description: "Missing confirm: true, invalid sender, or missing quoteId.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "404": { description: "Quote or lead not found.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "409": { description: "Quote already sent. Use HQ to resend.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "502": { description: "Email delivery failed.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "503": { description: "No email service configured — set GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN or RESEND_API_KEY.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/deposit-send": {
    post: {
      operationId: "sendDeposit",
      summary: "Send or draft a deposit request email after founder confirmation",
      description:
        "Sends a deposit request via Gmail API (or Resend fallback). " +
        "action: 'send' (default) delivers immediately. " +
        "action: 'draft' saves to Gmail Drafts — no stage advance. " +
        "Requires confirm: true — show deposit-preview first. " +
        "Reuses existing deposit if lead has one. 409 if already sent.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                leadId: {
                  type: "string",
                  description: "CRM lead UUID from GET /api/ai/deposit-preview. Never guess.",
                },
                sender: {
                  type: "string",
                  enum: ["Alliyah", "Hannah", "Jordan"],
                  description: "Founder sending the deposit request. Ask if not specified.",
                },
                confirm: {
                  type: "boolean",
                  enum: [true],
                  description: "Must be boolean true. Only set after explicit founder confirmation.",
                },
                action: {
                  type: "string",
                  enum: ["send", "draft"],
                  description: "send (default): delivers via Gmail API. draft: saves to Gmail Drafts only — no lead record updates. Omit (or use 'send') unless founder explicitly asks for a draft.",
                },
              },
              required: ["leadId", "sender", "confirm"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Deposit sent or drafted. When sent: deposit_requests and crm_leads records updated. When drafted: draft saved to Gmail Drafts, records not updated.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      sent:          { type: "boolean", description: "True when action is 'send'." },
                      drafted:       { type: "boolean", description: "True when action is 'draft'." },
                      sentVia:       { type: "string", enum: ["gmail", "gmail_draft", "resend"], description: "gmail = sent via Gmail API; gmail_draft = saved to Drafts; resend = Resend fallback." },
                      draftId:       { type: "string", description: "Gmail draft ID. Present when drafted is true." },
                      openUrl:       { type: "string", description: "URL to open Gmail Drafts. Present when drafted is true." },
                      isNew:         { type: "boolean", description: "True if a new deposit record was created; false if an existing draft was reused. Present when sent." },
                      depositId:     { type: "string" },
                      depositNumber: { type: "string", description: "Formatted request number (e.g. TF-D-2026-0001)." },
                      publicLink:    { type: "string", description: "Live deposit URL." },
                      leadId:        { type: "string" },
                      company:       { type: "string", nullable: true },
                      sentAt:        { type: "string", format: "date-time", description: "Present when sent." },
                      draftedAt:     { type: "string", format: "date-time", description: "Present when drafted." },
                      emailSubject:  { type: "string" },
                      note:          { type: "string", description: "Human-readable status. Present when drafted." },
                    },
                    required: ["depositId", "depositNumber", "publicLink", "leadId", "emailSubject"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "400": { description: "Missing confirm: true, invalid sender, quote is draft/ambiguous, no email on lead, or no project value.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "404": { description: "Lead or deposit record not found.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "409": { description: "Deposit already sent. Use HQ SendDepositModal to resend.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "502": { description: "Email delivery failed.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "503": { description: "No email service configured — set GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN or RESEND_API_KEY.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/invoice-preview": {
    get: {
      operationId: "invoicePreview",
      summary: "Preview a final invoice before sending from HQ",
      description:
        "Read-only preview of a finances record. " +
        "Lookup by invoiceId, orderId, leadId, or q (partial company name). " +
        "Returns company, order, amounts, line items, tax, balance, email preview. " +
        "Never sends email or writes records.",
      parameters: [
        {
          name: "invoiceId",
          in: "query",
          description: "Finance record id (e.g. invoice-{orderId}).",
          schema: { type: "string" },
        },
        {
          name: "orderId",
          in: "query",
          description: "Order id — the invoice id is derived as invoice-{orderId}.",
          schema: { type: "string" },
        },
        {
          name: "leadId",
          in: "query",
          description: "CRM lead id — finds the invoice linked to this lead.",
          schema: { type: "string" },
        },
        {
          name: "q",
          in: "query",
          description: "Partial case-insensitive company name. Returns a choice list if ambiguous.",
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": {
          description:
            "Invoice preview. Fields: invoiceId, invoicePhase, company, orderName, orderId, " +
            "leadId, status, depositPaid, finalPaid, totalAmount, depositAmount, " +
            "balanceRemaining, lineItems, publicLink, emailSubject, emailBodyPreview, verificationSummary.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      invoiceId:            { type: "string" },
                      invoicePhase:         { type: "string", enum: ["deposit_phase", "final_payment_due", "paid_in_full", "draft", "cancelled"] },
                      company:              { type: "string", nullable: true },
                      orderName:            { type: "string", nullable: true },
                      orderId:              { type: "string", nullable: true },
                      leadId:               { type: "string", nullable: true },
                      depositRequestId:     { type: "string", nullable: true },
                      status:               { type: "string" },
                      depositPaid:          { type: "boolean" },
                      depositPaidDate:      { type: "string", nullable: true, format: "date" },
                      finalPaid:            { type: "boolean" },
                      finalPaidDate:        { type: "string", nullable: true, format: "date" },
                      finalDueDate:         { type: "string", nullable: true, format: "date" },
                      subtotal:             { type: "number", nullable: true },
                      salesTaxRate:         { type: "number", nullable: true },
                      salesTaxRateFormatted:{ type: "string", nullable: true },
                      salesTaxAmount:       { type: "number", nullable: true },
                      grandTotal:           { type: "number", nullable: true },
                      totalAmount:          { type: "number" },
                      depositAmount:        { type: "number" },
                      depositPercent:       { type: "integer" },
                      balanceRemaining:     { type: "number" },
                      lineItems:            { type: "array", items: { type: "object" } },
                      publicLink:           { type: "string", nullable: true, description: "Null if invoice link not yet generated in HQ." },
                      emailSubject:         { type: "string" },
                      emailBodyPreview:     { type: "string" },
                      verificationSummary:  { type: "string" },
                      selectionNote:        { type: "string" },
                    },
                    required: ["invoiceId", "invoicePhase", "status", "totalAmount", "depositAmount", "balanceRemaining", "emailSubject", "emailBodyPreview", "verificationSummary"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "400": { description: "No lookup parameter provided.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "404": { description: "Invoice not found.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/calendar": {
    get: {
      operationId: "getCalendar",
      summary: "Today's schedule and next-7-day calendar view",
      description:
        "Today's HQ calendar events and next 7 days. " +
        "Returns today[], thisWeek[], todayCount, hasDeliveriesToday, hasMeetingsToday. " +
        "Cancelled events excluded. Notes never returned. Read-only.",
      responses: {
        "200": {
          description: "Calendar events for today and the next 7 days.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      date:                { type: "string", format: "date", description: "Today's date (YYYY-MM-DD)." },
                      todayCount:          { type: "integer", description: "Number of non-cancelled events scheduled today." },
                      hasDeliveriesToday:  { type: "boolean" },
                      hasMeetingsToday:    { type: "boolean", description: "True if any Client Meeting, Demo, Video Call, or Internal Meeting is today." },
                      today:    { type: "array", description: "Events today, sorted by start time.", items: { "$ref": "#/components/schemas/CalendarEvent" } },
                      thisWeek: { type: "array", description: "Events in the next 7 days (excluding today), sorted by date then time.", items: { "$ref": "#/components/schemas/CalendarEvent" } },
                    },
                    required: ["date", "todayCount", "hasDeliveriesToday", "hasMeetingsToday", "today", "thisWeek"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/client-intelligence": {
    get: {
      operationId: "getClientIntelligence",
      summary: "Full activity and pipeline view for a CRM lead",
      description:
        "Client intelligence for one CRM lead. Find by leadId or q (partial company name). " +
        "Returns recentQuotes, recentInvoices, recentDeposits, recentOrders, " +
        "recentActivityLogs (type/date/owner — no note content), " +
        "lastContacted, nextRecommendedFollowUp, and summary. Read-only.",
      parameters: [
        {
          name: "leadId",
          in: "query",
          required: false,
          description: "CRM lead UUID. Highest priority — use when known.",
          schema: { type: "string" },
        },
        {
          name: "q",
          in: "query",
          required: false,
          description: "Partial, case-insensitive company name search. Returns choice list if multiple leads match.",
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": {
          description: "Client intelligence or ambiguous choice list.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    description:
                      "Single ClientIntelligence result, or ambiguous list. " +
                      "When ambiguous is true, show matches and ask which lead they mean.",
                    properties: {
                      // ── Single result ───────────────────────────────────
                      leadId:    { type: "string" },
                      company:   { type: "string", description: "Business name — no contact PII." },
                      stage:     { type: "string", description: "Normalized CRM pipeline stage." },
                      status:    { type: "string" },
                      owner:     { type: "string", nullable: true },
                      followUpDate: { type: "string", format: "date", nullable: true },
                      lastContacted: { type: "string", format: "date", nullable: true, description: "Date of most recent logged communication." },
                      nextRecommendedFollowUp: { type: "string", description: "Plain-language next action recommendation. Quote directly to the founder." },
                      recentQuotes: {
                        type: "array", maxItems: 5,
                        items: {
                          type: "object",
                          properties: {
                            quoteId:         { type: "string" },
                            quoteNumber:     { type: "string", nullable: true },
                            status:          { type: "string" },
                            grandTotal:      { type: "number", nullable: true },
                            expirationDate:  { type: "string", format: "date", nullable: true },
                            sentDate:        { type: "string", format: "date", nullable: true },
                            daysUntilExpiry: { type: "integer", nullable: true, description: "Negative = already expired." },
                          },
                          required: ["quoteId", "status"],
                        },
                      },
                      recentInvoices: {
                        type: "array", maxItems: 5,
                        items: {
                          type: "object",
                          properties: {
                            invoiceId:   { type: "string" },
                            orderName:   { type: "string" },
                            status:      { type: "string" },
                            depositPaid: { type: "boolean" },
                            finalPaid:   { type: "boolean" },
                            balance:     { type: "number", description: "Remaining balance. 0 when fully paid." },
                            dueDate:     { type: "string", format: "date", nullable: true },
                          },
                          required: ["invoiceId", "orderName", "status", "depositPaid", "finalPaid", "balance"],
                        },
                      },
                      recentDeposits: {
                        type: "array", maxItems: 5,
                        items: {
                          type: "object",
                          properties: {
                            depositId:            { type: "string" },
                            depositRequestNumber: { type: "string", nullable: true },
                            status:               { type: "string" },
                            depositAmount:        { type: "number", nullable: true },
                            sentDate:             { type: "string", format: "date", nullable: true },
                          },
                          required: ["depositId", "status"],
                        },
                      },
                      recentOrders: {
                        type: "array", maxItems: 5,
                        items: {
                          type: "object",
                          properties: {
                            orderId:               { type: "string" },
                            orderName:             { type: "string" },
                            status:                { type: "string" },
                            estimatedDeliveryDate: { type: "string", format: "date", nullable: true },
                          },
                          required: ["orderId", "orderName", "status"],
                        },
                      },
                      recentActivityLogs: {
                        type: "array", maxItems: 10,
                        description: "Recent communication log entries. Type, date, and owner only — note content is never returned.",
                        items: {
                          type: "object",
                          properties: {
                            date:  { type: "string", format: "date" },
                            type:  { type: "string", description: "Call, Email, Text, Meeting, In Person, or Other." },
                            owner: { type: "string" },
                          },
                          required: ["date", "type", "owner"],
                        },
                      },
                      summary: { type: "string", description: "One-sentence Jarvis-readable summary of the client's pipeline state." },
                      // ── Ambiguous ───────────────────────────────────────
                      ambiguous:  { type: "boolean", description: "True when q matched multiple leads." },
                      matchCount: { type: "integer" },
                      matches: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            leadId:  { type: "string" },
                            company: { type: "string" },
                            stage:   { type: "string" },
                            status:  { type: "string" },
                          },
                          required: ["leadId", "company", "stage", "status"],
                        },
                      },
                    },
                    required: [],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "400": { description: "No lookup parameter provided.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "404": { description: "Lead not found.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/order-intelligence": {
    get: {
      operationId: "getOrderIntelligence",
      summary: "Unified order status and next-step intelligence",
      description:
        "Full pipeline view for one order: currentStage, quoteStatus, depositStatus, " +
        "productionStatus, invoiceStatus, nextStep, blockerReason, and a plain-language summary. " +
        "Find by q (partial order name), orderId, or leadId. " +
        "Ambiguous matches return a choice list. Read-only.",
      parameters: [
        {
          name: "q",
          in: "query",
          required: false,
          description: "Partial, case-insensitive order name search (e.g. 'DSF7'). Returns choice list if multiple match.",
          schema: { type: "string" },
        },
        {
          name: "orderId",
          in: "query",
          required: false,
          description: "Direct order UUID. Highest priority — use when known.",
          schema: { type: "string" },
        },
        {
          name: "leadId",
          in: "query",
          required: false,
          description: "CRM lead UUID. Finds the order linked to this lead via its invoice.",
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": {
          description: "Order intelligence or ambiguous match list.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    description:
                      "Either a single OrderIntelligence result, or an ambiguous list. " +
                      "When ambiguous is true, show matches to the founder and ask which order they mean.",
                    properties: {
                      // ── Single-result fields ────────────────────────────
                      orderId:           { type: "string" },
                      orderName:         { type: "string" },
                      company:           { type: "string", nullable: true, description: "Business name from CRM lead — no contact PII." },
                      leadId:            { type: "string", nullable: true, description: "CRM lead UUID. null if no lead is linked." },
                      currentStage:      { type: "string", description: "CRM pipeline stage (if linked) or inferred production stage." },
                      quoteStatus: {
                        type: "string",
                        enum: ["none", "draft", "sent", "expired", "approved"],
                        description: "State of the most recent quote for this lead.",
                      },
                      depositStatus: {
                        type: "string",
                        enum: ["none", "draft", "pending", "payment_failed", "paid"],
                        description: "State of the most recent deposit request.",
                      },
                      productionStatus:  { type: "string", description: "Current order production status (e.g. Production, Quality Check, Ready, Delivered)." },
                      invoiceStatus: {
                        type: "string",
                        enum: ["none", "outstanding", "deposit_paid", "overdue", "paid"],
                        description: "Derived invoice payment state.",
                      },
                      nextStep:     { type: "string", description: "Plain-language description of the immediate next action required. Quote directly to the founder." },
                      blockerReason:{ type: "string", nullable: true, description: "Plain-language blocker description when something is actively stuck. null if no blocker." },
                      lastUpdated:  { type: "string", format: "date", nullable: true, description: "Most recent activity date across quote, deposit, and invoice records." },
                      summary:      { type: "string", description: "One-sentence Jarvis-readable summary of the full order state." },
                      // ── Ambiguous-result fields ──────────────────────────
                      ambiguous:   { type: "boolean", description: "True when q matched multiple orders. Show matches and ask which one." },
                      matchCount:  { type: "integer", description: "Total number of matching orders. Present when ambiguous is true." },
                      matches: {
                        type: "array",
                        description: "Choice list when ambiguous is true. Show to the founder to disambiguate.",
                        items: {
                          type: "object",
                          properties: {
                            orderId:   { type: "string" },
                            orderName: { type: "string" },
                            status:    { type: "string" },
                            company:   { type: "string", nullable: true },
                          },
                          required: ["orderId", "orderName", "status"],
                        },
                      },
                    },
                    required: [],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "400": { description: "No lookup parameter provided.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "404": { description: "Order not found.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
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

  "/api/ai/end-of-day-summary": {
    get: {
      operationId: "getEndOfDaySummary",
      summary: "End-of-day summary — what happened today and what's due tomorrow",
      description:
        "End-of-day summary: tasks completed, activity logged, quotes/deposits sent, " +
        "revenue today, overdue items, and a tomorrow focus list with recommended " +
        "wrap-up actions. Read-only. Auth required.",
      responses: {
        "200": {
          description: "End-of-day summary. Covers today's completions and tomorrow's priorities.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      date: { type: "string", format: "date", description: "Today's date (PT timezone, YYYY-MM-DD)." },
                      completedToday: {
                        type: "object",
                        description: "Work finished today.",
                        properties: {
                          taskCount:           { type: "integer", description: "Tasks marked complete today." },
                          tasks:               { type: "array", maxItems: 10, items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, owner: { type: "string", nullable: true } } } },
                          crmContactCount:     { type: "integer", description: "CRM communications logged today." },
                          crmContacts:         { type: "array", maxItems: 10, items: { type: "object", properties: { leadId: { type: "string" }, company: { type: "string" }, contactType: { type: "string" } } } },
                          clientActivityCount: { type: "integer", description: "Client activity log entries today." },
                        },
                        required: ["taskCount", "tasks", "crmContactCount", "crmContacts", "clientActivityCount"],
                      },
                      activityToday: {
                        type: "object",
                        description: "Activity counts for today across all sources.",
                        properties: {
                          clientActivityCount: { type: "integer" },
                          crmContactCount:     { type: "integer" },
                          totalCount:          { type: "integer" },
                        },
                        required: ["clientActivityCount", "crmContactCount", "totalCount"],
                      },
                      pipelineChanges: {
                        type: "object",
                        description: "CRM leads that had activity logged today (best available pipeline signal).",
                        properties: {
                          leadsContactedTodayCount: { type: "integer" },
                          leadsContactedToday: { type: "array", maxItems: 10, items: { type: "object", properties: { leadId: { type: "string" }, company: { type: "string" }, stage: { type: "string", nullable: true }, contactType: { type: "string" } } } },
                        },
                        required: ["leadsContactedTodayCount", "leadsContactedToday"],
                      },
                      quoteActivity: {
                        type: "object",
                        description: "Quotes sent today.",
                        properties: {
                          sentTodayCount: { type: "integer" },
                          sentToday: { type: "array", maxItems: 10, items: { type: "object", properties: { leadId: { type: "string", nullable: true }, company: { type: "string" }, quoteNumber: { type: "string", nullable: true }, grandTotal: { type: "number", nullable: true } } } },
                        },
                        required: ["sentTodayCount", "sentToday"],
                      },
                      depositActivity: {
                        type: "object",
                        description: "Deposit requests sent today and deposits/finals paid today.",
                        properties: {
                          sentTodayCount:  { type: "integer" },
                          sentToday:       { type: "array", maxItems: 10, items: { type: "object", properties: { id: { type: "string" }, depositRequestNumber: { type: "string", nullable: true }, company: { type: "string" }, depositAmount: { type: "number", nullable: true } } } },
                          paidTodayCount:  { type: "integer" },
                          paidToday:       { type: "array", maxItems: 10, items: { type: "object", properties: { id: { type: "string" }, orderName: { type: "string" }, amount: { type: "number" }, type: { type: "string", enum: ["deposit", "final"] } } } },
                          finalsPaidCount: { type: "integer" },
                        },
                        required: ["sentTodayCount", "sentToday", "paidTodayCount", "paidToday", "finalsPaidCount"],
                      },
                      orderActivity: {
                        type: "object",
                        description: "Active orders and those with delivery due today.",
                        properties: {
                          activeCount:   { type: "integer" },
                          dueTodayCount: { type: "integer" },
                          dueToday:      { type: "array", maxItems: 10, items: { type: "object", properties: { id: { type: "string" }, orderName: { type: "string" }, status: { type: "string" } } } },
                        },
                        required: ["activeCount", "dueTodayCount", "dueToday"],
                      },
                      financeActivity: {
                        type: "object",
                        description: "Revenue collected today and expenses logged today.",
                        properties: {
                          revenueToday:      { type: "number" },
                          expenseTotalToday: { type: "number" },
                          payments: { type: "array", items: { type: "object", properties: { id: { type: "string" }, orderName: { type: "string" }, amount: { type: "number" }, type: { type: "string", enum: ["deposit", "final"] } } } },
                          expenses: { type: "array", maxItems: 10, items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, amount: { type: "number" } } } },
                        },
                        required: ["revenueToday", "expenseTotalToday", "payments", "expenses"],
                      },
                      overdueItems: {
                        type: "object",
                        description: "All items still past due at end of day.",
                        properties: {
                          overdueTaskCount:        { type: "integer" },
                          overdueTasks:            { type: "array", maxItems: 10, items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, dueDate: { type: "string" }, owner: { type: "string", nullable: true } } } },
                          overdueInvoiceCount:     { type: "integer" },
                          overdueInvoices:         { type: "array", maxItems: 10, items: { type: "object", properties: { id: { type: "string" }, orderName: { type: "string" }, status: { type: "string" }, balance: { type: "number" }, daysPastDue: { type: "integer" } } } },
                          stalledOrderCount:       { type: "integer" },
                          stalledOrders:           { type: "array", maxItems: 10, items: { type: "object", properties: { id: { type: "string" }, orderName: { type: "string" }, status: { type: "string" }, dueDate: { type: "string", nullable: true }, daysPastDue: { type: "integer" } } } },
                          outstandingDepositCount: { type: "integer" },
                          outstandingDeposits:     { type: "array", maxItems: 10, items: { type: "object", properties: { id: { type: "string" }, depositRequestNumber: { type: "string", nullable: true }, company: { type: "string" }, depositAmount: { type: "number", nullable: true }, status: { type: "string" }, sentDate: { type: "string", nullable: true }, daysSinceSent: { type: "integer", nullable: true } } } },
                        },
                        required: ["overdueTaskCount", "overdueTasks", "overdueInvoiceCount", "overdueInvoices", "stalledOrderCount", "stalledOrders", "outstandingDepositCount", "outstandingDeposits"],
                      },
                      tomorrowFocus: {
                        type: "object",
                        description: "Items due tomorrow to prepare for now.",
                        properties: {
                          tasksDueTomorrow:      { type: "array", maxItems: 10, items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, owner: { type: "string", nullable: true } } } },
                          ordersDueTomorrow:     { type: "array", maxItems: 10, items: { type: "object", properties: { id: { type: "string" }, orderName: { type: "string" }, status: { type: "string" } } } },
                          followUpsDueTomorrow:  { type: "array", maxItems: 10, items: { type: "object", properties: { leadId: { type: "string" }, company: { type: "string" }, owner: { type: "string", nullable: true } } } },
                        },
                        required: ["tasksDueTomorrow", "ordersDueTomorrow", "followUpsDueTomorrow"],
                      },
                      recommendedWrapUpActions: {
                        type: "array",
                        description: "Plain-language wrap-up actions Jarvis can present directly.",
                        items: { type: "string" },
                      },
                    },
                    required: ["date", "completedToday", "activityToday", "pipelineChanges", "quoteActivity", "depositActivity", "orderActivity", "financeActivity", "overdueItems", "tomorrowFocus", "recommendedWrapUpActions"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/morning-briefing": {
    get: {
      operationId: "getMorningBriefing",
      summary: "Morning briefing — what needs attention today",
      description:
        "One-call morning briefing: overdue tasks, stale leads, pending quotes, " +
        "outstanding deposits, unpaid invoices, orders due soon, revenue pace, " +
        "and recommended plain-language actions. Read-only. Auth required.",
      responses: {
        "200": {
          description: "Morning briefing. allClear is true when no items need attention.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      date:     { type: "string", format: "date", description: "Today's date (PT timezone, YYYY-MM-DD)." },
                      allClear: { type: "boolean", description: "True when all counts are zero — nothing needs attention." },
                      pipeline: {
                        type: "object",
                        description: "CRM pipeline summary.",
                        properties: {
                          openLeadCount:      { type: "integer", description: "Total open (non-won) leads." },
                          staleLeadCount:     { type: "integer", description: "Leads with overdue follow-up dates." },
                          staleLeads:         { type: "array", maxItems: 5, items: { type: "object", properties: { leadId: { type: "string" }, company: { type: "string" }, stage: { type: "string", nullable: true }, followUpDate: { type: "string", nullable: true } } } },
                          quoteFollowUpCount: { type: "integer", description: "Leads in Quote Sent stage." },
                          quoteFollowUps:     { type: "array", maxItems: 10, items: { type: "object", properties: { leadId: { type: "string" }, company: { type: "string" }, quoteNumber: { type: "string", nullable: true }, grandTotal: { type: "number", nullable: true }, expirationDate: { type: "string", nullable: true }, daysUntilExpiry: { type: "integer", nullable: true } } } },
                        },
                        required: ["openLeadCount", "staleLeadCount", "staleLeads", "quoteFollowUpCount", "quoteFollowUps"],
                      },
                      tasks: {
                        type: "object",
                        description: "Task summary.",
                        properties: {
                          overdueCount:  { type: "integer" },
                          dueTodayCount: { type: "integer" },
                          overdue:  { type: "array", maxItems: 5, items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, dueDate: { type: "string" }, owner: { type: "string", nullable: true } } } },
                          dueToday: { type: "array", maxItems: 5, items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, owner: { type: "string", nullable: true } } } },
                        },
                        required: ["overdueCount", "dueTodayCount", "overdue", "dueToday"],
                      },
                      orders: {
                        type: "object",
                        description: "Order summary.",
                        properties: {
                          activeCount:  { type: "integer" },
                          dueSoonCount: { type: "integer", description: "Active orders with deadline within 7 days." },
                          dueSoon: { type: "array", maxItems: 10, items: { type: "object", properties: { id: { type: "string" }, orderName: { type: "string" }, dueDate: { type: "string", nullable: true }, status: { type: "string" } } } },
                        },
                        required: ["activeCount", "dueSoonCount", "dueSoon"],
                      },
                      deposits: {
                        type: "object",
                        description: "Deposit requests not yet paid.",
                        properties: {
                          outstandingCount: { type: "integer" },
                          outstanding: { type: "array", maxItems: 10, items: { type: "object", properties: { id: { type: "string" }, depositRequestNumber: { type: "string", nullable: true }, company: { type: "string" }, depositAmount: { type: "number", nullable: true }, status: { type: "string" }, sentDate: { type: "string", nullable: true } } } },
                        },
                        required: ["outstandingCount", "outstanding"],
                      },
                      invoices: {
                        type: "object",
                        description: "Unpaid final invoices.",
                        properties: {
                          unpaidCount: { type: "integer" },
                          unpaid: { type: "array", maxItems: 10, items: { type: "object", properties: { id: { type: "string" }, orderName: { type: "string" }, status: { type: "string" }, balance: { type: "number" } } } },
                        },
                        required: ["unpaidCount", "unpaid"],
                      },
                      revenue: {
                        type: "object",
                        description: "Month-to-date revenue pace.",
                        properties: {
                          monthlyGoal:   { type: "number" },
                          monthToDate:   { type: "number" },
                          paceStatus:    { type: "string", enum: ["ahead", "on-track", "behind"] },
                          projected:     { type: "number", description: "Projected month-end revenue at current daily rate." },
                          daysLeftInMonth: { type: "integer" },
                        },
                        required: ["monthlyGoal", "monthToDate", "paceStatus", "projected", "daysLeftInMonth"],
                      },
                      recommendedActions: {
                        type: "array",
                        description: "Plain-language action items Jarvis can present directly. Empty when allClear is true.",
                        items: { type: "string" },
                      },
                    },
                    required: ["date", "allClear", "pipeline", "tasks", "orders", "deposits", "invoices", "revenue", "recommendedActions"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/financial-watchlist": {
    get: {
      operationId: "getFinancialWatchlist",
      summary: "Financial watchlist — revenue and collection status",
      description:
        "Financial watchlist: revenue today/week/month, unpaid deposits, outstanding and overdue invoices, " +
        "final balances due, approved quotes awaiting deposit, and high-priority financial actions. Read-only. Auth required.",
      responses: {
        "200": {
          description: "Financial watchlist. highPriorityFinancialActions lists plain-language items needing attention.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      date:              { type: "string", format: "date", description: "Today's date (PT timezone, YYYY-MM-DD)." },
                      revenueToday:      { type: "number", description: "Revenue collected today (sum of deposits and final payments with today's paid date)." },
                      revenueThisWeek:   { type: "number", description: "Revenue collected in the rolling 7-day window ending today." },
                      revenueThisMonth:  { type: "number", description: "Revenue collected so far this calendar month." },
                      monthlyGoal:       { type: "number", description: "Configured monthly revenue goal." },
                      unpaidDeposits: {
                        type: "object",
                        description: "Deposit requests not yet paid. Failed payments sorted first, then oldest.",
                        properties: {
                          count:       { type: "integer" },
                          totalAmount: { type: "number" },
                          items: {
                            type: "array",
                            maxItems: 10,
                            items: {
                              type: "object",
                              properties: {
                                leadId:        { type: "string", nullable: true },
                                company:       { type: "string", nullable: true },
                                depositNumber: { type: "string", nullable: true },
                                status:        { type: "string", description: "pending | payment_failed | draft" },
                                sentDate:      { type: "string", nullable: true },
                                daysOld:       { type: "integer", nullable: true },
                                amount:        { type: "number" },
                              },
                            },
                          },
                        },
                        required: ["count", "totalAmount", "items"],
                      },
                      outstandingInvoices: {
                        type: "object",
                        description: "All active invoices with final payment not yet received. Overdue items sorted first.",
                        properties: {
                          count:        { type: "integer" },
                          totalBalance: { type: "number" },
                          items: {
                            type: "array",
                            maxItems: 10,
                            items: {
                              type: "object",
                              properties: {
                                invoiceId:   { type: "string" },
                                orderName:   { type: "string" },
                                company:     { type: "string", nullable: true },
                                depositPaid: { type: "boolean" },
                                dueDate:     { type: "string", nullable: true },
                                daysOverdue: { type: "integer", description: "0 when not overdue." },
                                balanceDue:  { type: "number" },
                                totalAmount: { type: "number" },
                              },
                            },
                          },
                        },
                        required: ["count", "totalBalance", "items"],
                      },
                      overdueInvoices: {
                        type: "object",
                        description: "Subset of outstandingInvoices where daysOverdue > 0, sorted most-overdue first.",
                        properties: {
                          count:        { type: "integer" },
                          totalBalance: { type: "number" },
                          items: {
                            type: "array",
                            maxItems: 10,
                            items: {
                              type: "object",
                              properties: {
                                invoiceId:   { type: "string" },
                                orderName:   { type: "string" },
                                company:     { type: "string", nullable: true },
                                depositPaid: { type: "boolean" },
                                dueDate:     { type: "string", nullable: true },
                                daysOverdue: { type: "integer" },
                                balanceDue:  { type: "number" },
                                totalAmount: { type: "number" },
                              },
                            },
                          },
                        },
                        required: ["count", "totalBalance", "items"],
                      },
                      finalBalancesDue: {
                        type: "object",
                        description: "Invoices where deposit is paid but final balance is not yet collected.",
                        properties: {
                          count:        { type: "integer" },
                          totalBalance: { type: "number" },
                          items: {
                            type: "array",
                            maxItems: 10,
                            items: {
                              type: "object",
                              properties: {
                                invoiceId:    { type: "string" },
                                orderName:    { type: "string" },
                                company:      { type: "string", nullable: true },
                                dueDate:      { type: "string", nullable: true },
                                daysOverdue:  { type: "integer" },
                                daysUntilDue: { type: "integer", nullable: true },
                                balanceDue:   { type: "number" },
                              },
                            },
                          },
                        },
                        required: ["count", "totalBalance", "items"],
                      },
                      approvedQuotesAwaitingDeposit: {
                        type: "object",
                        description: "Quotes digitally approved by the client but with no paid deposit request. Sorted oldest approval first.",
                        properties: {
                          count:       { type: "integer" },
                          totalAmount: { type: "number" },
                          items: {
                            type: "array",
                            maxItems: 10,
                            items: {
                              type: "object",
                              properties: {
                                quoteId:     { type: "string" },
                                quoteNumber: { type: "string", nullable: true },
                                company:     { type: "string", nullable: true },
                                approvedAt:  { type: "string", nullable: true },
                                grandTotal:  { type: "number" },
                              },
                            },
                          },
                        },
                        required: ["count", "totalAmount", "items"],
                      },
                      highPriorityFinancialActions: {
                        type: "array",
                        description: "Plain-language action items Jarvis can present. 'No urgent items' when nothing needs attention.",
                        items: { type: "string" },
                      },
                    },
                    required: [
                      "date", "revenueToday", "revenueThisWeek", "revenueThisMonth", "monthlyGoal",
                      "unpaidDeposits", "outstandingInvoices", "overdueInvoices",
                      "finalBalancesDue", "approvedQuotesAwaitingDeposit", "highPriorityFinancialActions",
                    ],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/follow-up-watchlist": {
    get: {
      operationId: "getFollowUpWatchlist",
      summary: "Follow-up watchlist — leads, quotes, deposits, tasks, and orders needing attention",
      description:
        "Follow-up watchlist: stale leads, quotes awaiting client response, deposits awaiting payment, " +
        "overdue tasks, stalled orders, and upcoming client follow-ups. " +
        "Each item includes reason and urgency indicators. Read-only. Auth required.",
      responses: {
        "200": {
          description: "Follow-up watchlist. recommendedFollowUpActions lists plain-language items to act on.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      date: { type: "string", format: "date", description: "Today's date (PT timezone, YYYY-MM-DD)." },
                      staleLeads: {
                        type: "object",
                        description: "Open leads with a past-due follow-up date and an active follow-up task. Sorted most-overdue first.",
                        properties: {
                          count: { type: "integer" },
                          items: {
                            type: "array",
                            maxItems: 10,
                            items: {
                              type: "object",
                              properties: {
                                leadId:             { type: "string" },
                                company:            { type: "string" },
                                stage:              { type: "string" },
                                owner:              { type: "string", nullable: true },
                                followUpDate:       { type: "string", format: "date" },
                                daysPastFollowUp:   { type: "integer", description: "Days since follow-up was due." },
                                lastContacted:      { type: "string", nullable: true, description: "Date of most recent communication log entry." },
                                daysSinceLastContact: { type: "integer", nullable: true },
                                reason:             { type: "string" },
                              },
                            },
                          },
                        },
                        required: ["count", "items"],
                      },
                      quotesAwaitingResponse: {
                        type: "object",
                        description: "Leads in Quote Sent stage with their most recent sent quote. Sorted by expiry urgency.",
                        properties: {
                          count: { type: "integer" },
                          items: {
                            type: "array",
                            maxItems: 10,
                            items: {
                              type: "object",
                              properties: {
                                leadId:        { type: "string" },
                                company:       { type: "string" },
                                quoteId:       { type: "string", nullable: true },
                                quoteNumber:   { type: "string", nullable: true },
                                sentDate:      { type: "string", nullable: true },
                                daysSinceSent: { type: "integer", nullable: true },
                                expirationDate:  { type: "string", nullable: true },
                                daysUntilExpiry: { type: "integer", nullable: true, description: "Negative when expired." },
                                grandTotal:    { type: "number", nullable: true },
                                reason:        { type: "string" },
                              },
                            },
                          },
                        },
                        required: ["count", "items"],
                      },
                      depositsAwaitingPayment: {
                        type: "object",
                        description: "Deposit requests not yet paid. Failed payments sorted first, then oldest.",
                        properties: {
                          count:       { type: "integer" },
                          totalAmount: { type: "number" },
                          items: {
                            type: "array",
                            maxItems: 10,
                            items: {
                              type: "object",
                              properties: {
                                leadId:        { type: "string", nullable: true },
                                company:       { type: "string", nullable: true },
                                depositNumber: { type: "string", nullable: true },
                                status:        { type: "string", description: "pending | payment_failed | draft" },
                                sentDate:      { type: "string", nullable: true },
                                daysOld:       { type: "integer", nullable: true },
                                amount:        { type: "number" },
                                reason:        { type: "string" },
                              },
                            },
                          },
                        },
                        required: ["count", "totalAmount", "items"],
                      },
                      overdueTasks: {
                        type: "object",
                        description: "Incomplete tasks past their due date. Sorted most-overdue first.",
                        properties: {
                          count: { type: "integer" },
                          items: {
                            type: "array",
                            maxItems: 10,
                            items: {
                              type: "object",
                              properties: {
                                id:          { type: "string" },
                                title:       { type: "string" },
                                owner:       { type: "string", nullable: true },
                                dueDate:     { type: "string" },
                                daysPastDue: { type: "integer" },
                                reason:      { type: "string" },
                              },
                            },
                          },
                        },
                        required: ["count", "items"],
                      },
                      stalledOrders: {
                        type: "object",
                        description: "Active orders past their estimated delivery date. Sorted most-overdue first.",
                        properties: {
                          count: { type: "integer" },
                          items: {
                            type: "array",
                            maxItems: 10,
                            items: {
                              type: "object",
                              properties: {
                                id:          { type: "string" },
                                orderName:   { type: "string" },
                                status:      { type: "string" },
                                dueDate:     { type: "string" },
                                daysPastDue: { type: "integer" },
                                reason:      { type: "string" },
                              },
                            },
                          },
                        },
                        required: ["count", "items"],
                      },
                      clientFollowUps: {
                        type: "object",
                        description: "Leads with a follow-up task due today through the next 3 days. Sorted soonest first.",
                        properties: {
                          count: { type: "integer" },
                          items: {
                            type: "array",
                            maxItems: 10,
                            items: {
                              type: "object",
                              properties: {
                                leadId:            { type: "string" },
                                company:           { type: "string" },
                                stage:             { type: "string" },
                                owner:             { type: "string", nullable: true },
                                followUpDate:      { type: "string", format: "date" },
                                daysUntilFollowUp: { type: "integer", description: "0 = today, 1 = tomorrow, etc." },
                                reason:            { type: "string" },
                              },
                            },
                          },
                        },
                        required: ["count", "items"],
                      },
                      recommendedFollowUpActions: {
                        type: "array",
                        description: "Plain-language follow-up actions Jarvis can present. 'All caught up' when nothing needs attention.",
                        items: { type: "string" },
                      },
                    },
                    required: [
                      "date", "staleLeads", "quotesAwaitingResponse", "depositsAwaitingPayment",
                      "overdueTasks", "stalledOrders", "clientFollowUps", "recommendedFollowUpActions",
                    ],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/invoice-action/prepare-final-send": {
    post: {
      operationId: "prepareFinalInvoiceSend",
      summary: "Prepare final invoice send data after deposit is paid",
      description:
        "Validates deposit_paid and prevents double-payment. Calls invoice/generate (idempotent). " +
        "Returns publicLink, emailSubject, emailBodyPreview, balanceRemaining, verificationSummary. " +
        "Requires confirm: true. No email sent. No Stripe. No final_paid update.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                invoiceId: {
                  type: "string",
                  description: "Finance record ID. Obtain from GET /api/ai/invoice-preview. Never guess.",
                },
                confirm: {
                  type: "boolean",
                  enum: [true],
                  description: "Must be boolean true. Only set after reviewing the invoice preview with the founder.",
                },
              },
              required: ["invoiceId", "confirm"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Invoice link generated (idempotent) and compose-ready data returned. No email sent.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok: { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      invoiceId:          { type: "string" },
                      invoicePhase:       { type: "string", enum: ["final_payment_due"], description: "Always final_payment_due on success." },
                      company:            { type: "string", nullable: true, description: "Business name — no contact PII." },
                      orderName:          { type: "string", nullable: true },
                      leadId:             { type: "string", nullable: true },
                      status:             { type: "string" },
                      depositPaidDate:    { type: "string", format: "date", nullable: true },
                      finalDueDate:       { type: "string", format: "date", nullable: true },
                      balanceRemaining:   { type: "number", description: "Final balance owed by the client." },
                      publicLink:         { type: "string", nullable: true, description: "Live invoice URL. Share with founders only — not directly to clients." },
                      emailSubject:       { type: "string", description: "Email subject matching HQ SendFinalInvoiceModal." },
                      emailBodyPreview:   { type: "string", description: "Full email body preview. Review with founder before sending." },
                      verificationSummary: { type: "string", description: "Plain-language confirmation. Quote to founder before they send." },
                      nextStep:           { type: "string", description: "Reminder that the founder must send the email manually." },
                      preparedVia:        { type: "string", enum: ["jarvis"] },
                    },
                    required: ["invoiceId", "invoicePhase", "balanceRemaining", "emailSubject", "emailBodyPreview", "verificationSummary", "nextStep", "preparedVia"],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "400": { description: "Missing invoiceId, missing confirm: true, or invalid JSON.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "404": { description: "Invoice not found.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "409": { description: "Invoice already paid, cancelled, draft, or deposit not yet collected.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "502": { description: "Invoice link generation failed (upstream error from invoice/generate).", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/command-center": {
    get: {
      operationId: "getCommandCenter",
      summary: "Command center — what needs attention right now",
      description:
        "Command center: cross-category urgent items, today's focus, financial and follow-up priorities, " +
        "task and order priorities, recommended actions, and an executive summary. Read-only. Auth required.",
      responses: {
        "200": {
          description: "Command center snapshot. executiveSummary gives a one-paragraph business-state narrative.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      date: { type: "string", format: "date", description: "Today's date (PT timezone, YYYY-MM-DD)." },
                      urgentItems: {
                        type: "array",
                        maxItems: 15,
                        description: "Cross-category urgent items sorted red→amber→blue then finance→followup→task→order.",
                        items: {
                          type: "object",
                          properties: {
                            priority: { type: "string", enum: ["red", "amber", "blue"] },
                            category: { type: "string", enum: ["finance", "followup", "task", "order"] },
                            label:    { type: "string", description: "Company or order name (no PII)." },
                            detail:   { type: "string" },
                            reason:   { type: "string" },
                          },
                          required: ["priority", "category", "label", "detail", "reason"],
                        },
                      },
                      todayFocus: {
                        type: "object",
                        description: "Tasks and client follow-ups due specifically today.",
                        properties: {
                          tasksDueToday:     { type: "integer" },
                          followUpsDueToday: { type: "integer" },
                          allClear:          { type: "boolean", description: "True when nothing is due today." },
                          items: {
                            type: "array",
                            maxItems: 10,
                            items: {
                              type: "object",
                              description: "type=task includes id/title/owner; type=followup includes leadId/company/stage.",
                              properties: {
                                type:    { type: "string", enum: ["task", "followup"] },
                                reason:  { type: "string" },
                              },
                            },
                          },
                        },
                        required: ["tasksDueToday", "followUpsDueToday", "allClear", "items"],
                      },
                      financialPriorities: {
                        type: "object",
                        description: "Revenue pace, overdue invoices, failed deposits, and approved quotes awaiting deposit.",
                        properties: {
                          revenueToday:                  { type: "number" },
                          revenueThisWeek:               { type: "number" },
                          revenueThisMonth:              { type: "number" },
                          monthlyGoal:                   { type: "number" },
                          monthlyPercent:                { type: "integer" },
                          paceStatus:                    { type: "string", enum: ["ahead", "on-track", "behind"] },
                          failedDepositCount:            { type: "integer" },
                          overdueInvoiceCount:           { type: "integer" },
                          overdueInvoiceTotal:           { type: "number" },
                          approvedQuotesAwaitingDeposit: { type: "integer" },
                          unpaidDepositCount:            { type: "integer" },
                          topItems: {
                            type: "array",
                            maxItems: 5,
                            items: {
                              type: "object",
                              properties: {
                                type:   { type: "string", description: "failed-deposit | overdue-invoice | approved-quote-no-deposit | old-unpaid-deposit" },
                                label:  { type: "string" },
                                amount: { type: "number" },
                                reason: { type: "string" },
                              },
                            },
                          },
                        },
                        required: ["revenueToday", "revenueThisMonth", "monthlyGoal", "paceStatus", "failedDepositCount", "overdueInvoiceCount", "topItems"],
                      },
                      followUpPriorities: {
                        type: "object",
                        description: "Stale leads, expired/expiring quotes, old unpaid deposits, and upcoming follow-ups.",
                        properties: {
                          staleLeadCount:     { type: "integer" },
                          expiredQuoteCount:  { type: "integer" },
                          expiringQuoteCount: { type: "integer" },
                          oldDepositCount:    { type: "integer" },
                          followUpsDueToday:  { type: "integer" },
                          followUpsDueSoon:   { type: "integer" },
                          topItems: {
                            type: "array",
                            maxItems: 5,
                            items: {
                              type: "object",
                              properties: {
                                type:             { type: "string", description: "stale-lead | expired-quote | expiring-quote | old-deposit" },
                                leadId:           { type: "string", nullable: true },
                                company:          { type: "string" },
                                daysPastFollowUp: { type: "integer", nullable: true },
                                daysUntilExpiry:  { type: "integer", nullable: true },
                                reason:           { type: "string" },
                              },
                            },
                          },
                        },
                        required: ["staleLeadCount", "expiredQuoteCount", "followUpsDueToday", "topItems"],
                      },
                      taskPriorities: {
                        type: "object",
                        properties: {
                          overdueCount:  { type: "integer" },
                          dueTodayCount: { type: "integer" },
                          topItems: {
                            type: "array",
                            maxItems: 5,
                            items: {
                              type: "object",
                              properties: {
                                id:          { type: "string" },
                                title:       { type: "string" },
                                owner:       { type: "string", nullable: true },
                                dueDate:     { type: "string" },
                                daysPastDue: { type: "integer" },
                                reason:      { type: "string" },
                              },
                            },
                          },
                        },
                        required: ["overdueCount", "dueTodayCount", "topItems"],
                      },
                      orderPriorities: {
                        type: "object",
                        properties: {
                          stalledCount: { type: "integer" },
                          dueSoonCount: { type: "integer" },
                          topItems: {
                            type: "array",
                            maxItems: 5,
                            items: {
                              type: "object",
                              properties: {
                                id:          { type: "string" },
                                orderName:   { type: "string" },
                                status:      { type: "string" },
                                dueDate:     { type: "string" },
                                daysPastDue: { type: "integer" },
                                isStalled:   { type: "boolean" },
                                reason:      { type: "string" },
                              },
                            },
                          },
                        },
                        required: ["stalledCount", "dueSoonCount", "topItems"],
                      },
                      recommendedActions: {
                        type: "array",
                        description: "Plain-language action items sorted by urgency. Non-empty — 'all clear' message when nothing needs attention.",
                        items: { type: "string" },
                      },
                      executiveSummary: {
                        type: "string",
                        description: "One-paragraph business-state narrative Jarvis can read as a briefing.",
                      },
                    },
                    required: [
                      "date", "urgentItems", "todayFocus", "financialPriorities",
                      "followUpPriorities", "taskPriorities", "orderPriorities",
                      "recommendedActions", "executiveSummary",
                    ],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
      },
    },
  },

  "/api/ai/quote-create": {
    post: {
      operationId: "quoteCreate",
      summary: "Create a draft quote for an existing CRM lead",
      description:
        "Creates a draft quote for an existing CRM lead after founder confirmation. " +
        "Requires confirm: true and at least one line item with quantity > 0 and unitPrice >= 0. " +
        "Does not send email or update lead stage. Set revisedQuote: true if a quote already exists.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                leadId: {
                  type: "string",
                  description: "CRM lead UUID. Preferred — use when known.",
                },
                company: {
                  type: "string",
                  description: "Partial company name for fuzzy match. Returns choice list if ambiguous. Use leadId when possible.",
                },
                lineItems: {
                  type: "array",
                  description: "At least one line item. Each item requires name, quantity (> 0), and unitPrice (>= 0).",
                  items: {
                    type: "object",
                    properties: {
                      name:        { type: "string", description: "Item name." },
                      description: { type: "string", description: "Optional item description." },
                      quantity:    { type: "number", description: "Quantity — must be greater than 0." },
                      unitPrice:   { type: "number", description: "Unit price in USD — must be >= 0." },
                    },
                    required: ["name", "quantity", "unitPrice"],
                  },
                },
                notes: {
                  type: "string",
                  description: "Optional internal notes for the quote.",
                },
                deliveryZip: {
                  type: "string",
                  description: "Delivery ZIP code for sales tax lookup. A ship-to ZIP must resolve from deliveryZip, clientZip, or the lead's stored address — otherwise the request fails with 400 (a sales tax rate is never guessed).",
                },
                clientZip: {
                  type: "string",
                  description: "Client ZIP code for sales tax lookup fallback. See deliveryZip: some ZIP source is required or the request fails with 400.",
                },
                revisedQuote: {
                  type: "boolean",
                  description: "Set to true to allow creating a new quote when one already exists for this lead.",
                },
                confirm: {
                  type: "boolean",
                  enum: [true],
                  description: "Must be exactly true. Show proposed quote to founder and get confirmation before calling.",
                },
              },
              required: ["lineItems", "confirm"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Draft quote created. Review quoteId, grandTotal, expirationDate, and publicLink before proceeding to send.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      quoteId:            { type: "string" },
                      quoteNumber:        { type: "string", description: "Sequential quote number e.g. TF-Q-2026-0043." },
                      leadId:             { type: "string" },
                      company:            { type: "string", nullable: true },
                      stage:              { type: "string", nullable: true },
                      isRevised:          { type: "boolean", description: "True when lead stage is 'Quote Sent' — email template changes accordingly." },
                      resolvedBy:         { type: "string", enum: ["leadId", "company"] },
                      existingQuoteCount: { type: "integer", description: "Number of pre-existing quotes for this lead before this one was created." },
                      lineItems: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name:        { type: "string" },
                            description: { type: "string" },
                            quantity:    { type: "number" },
                            unitPrice:   { type: "number" },
                            lineTotal:   { type: "number" },
                          },
                        },
                      },
                      subtotal:        { type: "number" },
                      salesTaxRate:    { type: "number", description: "Decimal rate e.g. 0.09375." },
                      salesTaxAmount:  { type: "number" },
                      grandTotal:      { type: "number" },
                      depositEstimate: { type: "number", description: "50% of grandTotal — the expected deposit amount." },
                      expirationDate:  { type: "string", format: "date", description: "Quote valid through this date (30 days from creation)." },
                      publicLink:      { type: "string", nullable: true, description: "Client-facing quote portal URL." },
                      taxRateSource:   { type: "string" },
                      taxRateWarning:  { type: "string", nullable: true },
                      status:          { type: "string", enum: ["draft"] },
                      notes:           { type: "string" },
                      nextStep:        { type: "string" },
                      createdVia:      { type: "string", enum: ["jarvis"] },
                    },
                    required: [
                      "quoteId", "quoteNumber", "leadId", "isRevised", "lineItems",
                      "subtotal", "salesTaxRate", "salesTaxAmount", "grandTotal",
                      "depositEstimate", "expirationDate", "status", "nextStep", "createdVia",
                    ],
                  },
                  meta: { "$ref": "#/components/schemas/Meta" },
                },
              },
            },
          },
        },
        "400": { description: "Validation error — missing confirm, invalid line items, or missing lead identifier.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "401": { description: "Unauthorized.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "404": { description: "Lead not found.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "409": { description: "Quote already exists — set revisedQuote: true to proceed.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
        "500": { description: "Internal error.", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } },
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
        "POST /api/ai/pipeline-stage (move lead to new stage; Deposit Paid blocked), " +
        "POST /api/ai/quote-create (create draft quote for existing CRM lead; requires confirm: true), " +
        "POST /api/ai/quote-send (send or draft a quote email via Gmail API; action: send advances lead to Quote Sent; action: draft saves to Gmail Drafts only), " +
        "POST /api/ai/deposit-send (send or draft a deposit request email via Gmail API; action: send or draft), " +
        "POST /api/ai/invoice-action/prepare-final-send (prepare final invoice data for email; no email sent; requires confirm: true). " +
        "Read-only preview: GET /api/ai/quote-preview (existing quote data + email templates; no records created). " +
        "Schedule: GET /api/ai/calendar (today's events and next 7 days; read-only). " +
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
