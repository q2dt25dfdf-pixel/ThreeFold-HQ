import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getStripe } from "@/lib/stripe";
import { createNotification } from "@/lib/notifications";

// Disable body parsing — Stripe signature verification requires the raw body
export const config = { api: { bodyParser: false } };

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event;
  try {
    const rawBody = await request.text();
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  console.log(`[webhook] event=${event.type} id=${event.id}`);

  try {
    if (event.type === "checkout.session.completed") {
      await handleSessionCompleted(event.data.object as unknown as CheckoutSession);
    } else if (event.type === "checkout.session.async_payment_succeeded") {
      await handleAsyncPaymentSucceeded(event.data.object as unknown as CheckoutSession);
    } else if (event.type === "checkout.session.async_payment_failed") {
      await handleAsyncPaymentFailed(event.data.object as unknown as CheckoutSession);
    }
  } catch (err) {
    console.error(`[webhook] unhandled error processing ${event.type}:`, err);
    // Still return 200 so Stripe does not endlessly retry for application-level errors
  }

  return NextResponse.json({ received: true });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CheckoutSession = {
  id: string;
  payment_status: string;
  payment_intent?: string | null;
  metadata?: Record<string, string> | null;
};

// ─── Low-level DB helper ──────────────────────────────────────────────────────

async function updateRecord(
  table: string,
  id: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const db = getSupabaseAdmin();
  const { data: rows } = await db.from(table).select("id,data").eq("id", id).limit(1);
  if (!rows || rows.length === 0) {
    console.warn(`[webhook] ${table}/${id} not found — skipping update`);
    return;
  }
  const existing = rows[0].data as Record<string, unknown>;
  await db.from(table).update({ data: { ...existing, ...fields } }).eq("id", id);
}

// ─── Full deposit fulfillment ─────────────────────────────────────────────────
//
// Called when a deposit is confirmed paid (card: immediately; bank ACH: on async_payment_succeeded).
// Updates the deposit request, moves the CRM lead to "Deposit Paid", and ensures the linked
// finance record (and order/portal if not yet created) reflects the payment.

async function fulfillDepositPaid(
  session: CheckoutSession,
  depositRequestId: string,
  paymentIntentId: string | null,
): Promise<void> {
  const db = getSupabaseAdmin();
  const paidAt = new Date().toISOString();
  const today = paidAt.slice(0, 10);
  const meta = session.metadata ?? {};
  const leadId = meta.lead_id || undefined;

  console.log(
    `[webhook] fulfillDepositPaid session=${session.id} deposit=${depositRequestId} ` +
    `lead=${leadId ?? "none"} method=${meta.payment_method ?? "unknown"}`,
  );

  // 1. Read deposit request
  const { data: depRows } = await db
    .from("deposit_requests")
    .select("id,data")
    .eq("id", depositRequestId)
    .limit(1);

  if (!depRows || depRows.length === 0) {
    console.error(`[webhook] deposit_request not found: ${depositRequestId}`);
    return;
  }

  const depData = depRows[0].data as Record<string, unknown>;
  // Prefer metadata lead_id; fall back to lead_id stored on the deposit request
  const effectiveLeadId = leadId || (depData.lead_id as string | undefined);

  // 2. Mark deposit request paid
  await db.from("deposit_requests").update({
    data: {
      ...depData,
      status: "paid",
      paid_at: paidAt,
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
    },
  }).eq("id", depositRequestId);
  console.log(`[webhook] deposit_request ${depositRequestId} → paid`);

  // 3. Update CRM lead stage to "Deposit Paid"
  if (effectiveLeadId) {
    const { data: leadRows } = await db
      .from("crm_leads")
      .select("id,data")
      .eq("id", effectiveLeadId)
      .limit(1);

    if (leadRows && leadRows.length > 0) {
      const ld = leadRows[0].data as Record<string, unknown>;
      const currentStage = ld.stage as string | undefined;
      // Treat "Approved" as the legacy equivalent of "Deposit Paid"
      if (currentStage !== "Deposit Paid" && currentStage !== "Approved") {
        await db.from("crm_leads").update({
          data: { ...ld, stage: "Deposit Paid", status: "Won" },
        }).eq("id", effectiveLeadId);
        console.log(`[webhook] crm_lead ${effectiveLeadId} → Deposit Paid`);
      } else {
        console.log(`[webhook] crm_lead ${effectiveLeadId} already at ${currentStage}`);
      }
    } else {
      console.warn(`[webhook] crm_lead not found: ${effectiveLeadId}`);
    }
  }

  // 4. Amounts — always read from the deposit request, never from Stripe's charged amount
  //    (card adds a 3% processing fee to the Stripe charge; the base deposit amount is unchanged)
  const totalAmount = Number(depData.total_amount ?? 0);
  const depositAmount = Number(depData.deposit_amount ?? totalAmount * 0.5);
  const balanceRemaining = Math.max(totalAmount - depositAmount, 0);
  const clientName = (depData.client_name ?? "") as string;

  // Proportional tax collected with deposit
  const depSalesTaxAmount = Number(depData.sales_tax_amount ?? 0);
  const depGrandTotal = Number(depData.grand_total ?? totalAmount);
  const depositTaxCollected = depGrandTotal > 0 && depSalesTaxAmount > 0
    ? Math.round((depositAmount / depGrandTotal) * depSalesTaxAmount * 100) / 100
    : 0;

  // 5. Find existing finance record linked to this deposit
  const { data: finRows } = await db
    .from("finances")
    .select("id,data")
    .eq("data->>deposit_request_id", depositRequestId)
    .limit(1);

  if (finRows && finRows.length > 0) {
    // Finance record already exists — mark deposit paid without touching amounts
    const fin = finRows[0];
    const fd = fin.data as Record<string, unknown>;
    const isFinalAlreadyPaid = fd.final_paid === true;
    const finSalesTaxAmount = Number(fd.sales_tax_amount ?? depSalesTaxAmount);
    const finGrandTotal = Number(fd.grand_total ?? depGrandTotal);
    const finDepositTax = finGrandTotal > 0 && finSalesTaxAmount > 0
      ? Math.round((depositAmount / finGrandTotal) * finSalesTaxAmount * 100) / 100
      : depositTaxCollected;
    const updatedTaxCollected = isFinalAlreadyPaid ? finSalesTaxAmount : finDepositTax;
    await db.from("finances").update({
      data: {
        ...fd,
        deposit_paid: true,
        deposit_paid_date: today,
        status: isFinalAlreadyPaid ? "Paid" : "Deposit Paid",
        ...(finSalesTaxAmount > 0 && { tax_collected_amount: updatedTaxCollected, tax_collected_at: today }),
      },
    }).eq("id", fin.id);
    console.log(`[webhook] finances ${fin.id} → deposit_paid=true`);
    // Ensure the client record exists even if it was created before the webhook was updated
    if (effectiveLeadId) {
      const { data: ldRows } = await db.from("crm_leads").select("id,data").eq("id", effectiveLeadId).limit(1);
      const ld = (ldRows?.[0]?.data ?? {}) as Record<string, unknown>;
      const { clientId: updatedClientId, isNew: isNewClient } = await upsertClientRecord(db, effectiveLeadId, clientName, ld, depData);
      if (isNewClient) {
        createNotification({
          type: "client_created",
          title: "New Client Created",
          message: `${clientName} · Client profile created successfully.`,
          entity_type: "client",
          entity_id: updatedClientId,
        }).catch(err => console.error("[webhook] client_created notification failed:", err));
      }
    }
  } else if (effectiveLeadId) {
    // No finance record yet — bootstrap order + finance so HQ is fully up to date
    await bootstrapOrderAndFinance({
      depositRequestId,
      depData,
      depositTaxCollected,
      leadId: effectiveLeadId,
      clientName,
      totalAmount,
      depositAmount,
      balanceRemaining,
      today,
      paidAt,
    });
  } else {
    console.warn(
      `[webhook] no existing finance record and no leadId — ` +
      `deposit marked paid but finance/order not created`,
    );
  }

  // Notify HQ — fire-and-forget so a notification failure never affects payment fulfillment
  const notifOrderId = effectiveLeadId ? `order-lead-${effectiveLeadId}` : "";
  createNotification({
    type: "deposit_received",
    title: "Deposit Received",
    message: `${clientName}${depositAmount > 0 ? ` · ${fmtNotifAmount(depositAmount)}` : ""}`,
    entity_type: "order",
    entity_id: notifOrderId,
  }).catch(err => console.error("[webhook] deposit notification failed:", err));
  console.log(`[webhook] notified: deposit received for ${clientName}`);
}

// ─── Client record upsert ─────────────────────────────────────────────────────
//
// Mirrors syncClientFromLead in crm/page.tsx. Deduplicates by email then company name,
// then falls back to the deterministic ID `client-{leadId}`.

async function upsertClientRecord(
  db: ReturnType<typeof getSupabaseAdmin>,
  leadId: string,
  clientName: string,
  leadData: Record<string, unknown>,
  depData: Record<string, unknown>,
): Promise<{ clientId: string; isNew: boolean }> {
  const defaultClientId = `client-${leadId}`;
  const email = (leadData.email ?? depData.client_email ?? "") as string;
  let clientId = defaultClientId;
  let existingData: Record<string, unknown> = {};

  // Deduplicate: email first, then company name, then deterministic ID
  if (email) {
    const { data: emailRows } = await db
      .from("clients")
      .select("id,data")
      .eq("data->>email", email)
      .limit(1);
    if (emailRows && emailRows.length > 0) {
      clientId = emailRows[0].id;
      existingData = (emailRows[0].data as Record<string, unknown>) ?? {};
    }
  }

  if (clientId === defaultClientId && clientName) {
    const { data: nameRows } = await db
      .from("clients")
      .select("id,data")
      .eq("data->>name", clientName)
      .limit(1);
    if (nameRows && nameRows.length > 0) {
      clientId = nameRows[0].id;
      existingData = (nameRows[0].data as Record<string, unknown>) ?? {};
    }
  }

  if (clientId === defaultClientId) {
    const { data: idRows } = await db
      .from("clients")
      .select("id,data")
      .eq("id", defaultClientId)
      .limit(1);
    if (idRows && idRows.length > 0) {
      existingData = (idRows[0].data as Record<string, unknown>) ?? {};
    }
  }

  const cp = (leadData.companyProfile as Record<string, unknown> | undefined) ?? {};
  const isNew = Object.keys(existingData).length === 0;

  await db.from("clients").upsert({
    id: clientId,
    data: {
      ...existingData,
      id: clientId,
      name: clientName,
      company: clientName,
      contact: (leadData.contact ?? "") as string,
      email,
      phone: (leadData.phone ?? "") as string,
      owner: (leadData.owner ?? "") as string,
      industry: (cp.industry as string | undefined) ?? "",
      address: (cp.address as string | undefined) ?? "",
      website: (cp.website as string | undefined) ?? "",
      orders: (existingData.orders as number | undefined) ?? 0,
      notes: (existingData.notes as string | undefined) ??
        `Added automatically when deposit was paid.`,
      status: (existingData.status as string | undefined) ?? "Lead",
    },
  });

  console.log(`[webhook] upserted client ${clientId} (name=${clientName} isNew=${isNew})`);
  return { clientId, isNew };
}

// ─── Order + finance bootstrap ────────────────────────────────────────────────
//
// Creates the order and finance records when neither exists yet (i.e. the lead was never
// manually moved to "Deposit Paid" in the CRM before the Stripe payment arrived).
// Uses the same deterministic IDs as handleApproveLead in crm/page.tsx so upserts are safe.

type BootstrapOpts = {
  depositRequestId: string;
  depData: Record<string, unknown>;
  leadId: string;
  clientName: string;
  totalAmount: number;
  depositAmount: number;
  balanceRemaining: number;
  today: string;
  paidAt: string;
  depositTaxCollected?: number;
};

async function bootstrapOrderAndFinance(opts: BootstrapOpts): Promise<void> {
  const {
    depositRequestId, depData, leadId, clientName,
    totalAmount, depositAmount, balanceRemaining, today, paidAt,
    depositTaxCollected,
  } = opts;

  const db = getSupabaseAdmin();

  // Pull additional lead fields for order/intake snapshot
  const { data: leadRows } = await db
    .from("crm_leads")
    .select("id,data")
    .eq("id", leadId)
    .limit(1);
  const leadData = (leadRows?.[0]?.data ?? {}) as Record<string, unknown>;

  // Deterministic order ID — same formula as handleApproveLead in crm/page.tsx
  const orderId = `order-lead-${leadId}`;

  // Check whether the order already exists (created manually in CRM)
  const { data: existingOrders } = await db
    .from("orders")
    .select("id,data")
    .eq("id", orderId)
    .limit(1);

  let orderName: string;

  if (!existingOrders || existingOrders.length === 0) {
    // Generate order number and portal token
    const year = new Date().getFullYear();
    const { count: orderCount } = await db
      .from("orders")
      .select("*", { count: "exact", head: true });
    const orderNumber = `TF-ORD-${year}-${String((orderCount ?? 0) + 1).padStart(4, "0")}`;
    orderName = `${clientName} — ${orderNumber}`;
    const portalToken = "tf-" + randomBytes(12).toString("hex");

    // Create the client record first so we can link it to the order
    const { clientId, isNew: isNewClient } = await upsertClientRecord(db, leadId, clientName, leadData, depData);

    await db.from("orders").upsert({
      id: orderId,
      data: {
        id: orderId,
        orderName,
        order_name: orderName,
        order_number: orderNumber,
        client: clientName,
        client_id: clientId,
        client_name: clientName,
        vendor: "",
        items: [],
        quantity: 0,
        estimatedDeliveryDate: "",
        notes: "",
        lead_id: leadId,
        deposit_request_id: depositRequestId,
        quote_id: (leadData.quote_id ?? depData.quote_id ?? "") as string,
        questionnaire_id: (leadData.questionnaire_id ?? "") as string,
        total_amount: totalAmount,
        amount: totalAmount,
        status: "Production",
        source: leadData.source === "Website" ? "Website Lead" : "CRM Lead",
        portal_token: portalToken,
        portal_enabled: true,
        portal_generated_at: paidAt,
        intake_snapshot: {
          contact_title: leadData.contact_title ?? "",
          contact_method: leadData.contact_method ?? "",
          company_description: leadData.company_description ?? "",
          quantity: leadData.quantity ?? "",
          target_date: leadData.target_date ?? "",
          project_timeline: leadData.project_timeline ?? "",
          budget: leadData.budget ?? "",
          apparel_types: leadData.apparel_types ?? "",
          audience: leadData.audience ?? "",
          station_code: leadData.station_code ?? "",
          meaning: leadData.meaning ?? "",
          style: leadData.style ?? "",
          colors: leadData.colors ?? "",
          notes: leadData.notes ?? "",
          files: (leadData.questionnaire_files as unknown[]) ?? [],
        },
        created_at: paidAt,
      },
    });
    console.log(`[webhook] created order ${orderId} (${orderNumber}) for lead ${leadId}`);
    createNotification({
      type: "order_created",
      title: "New Order Created",
      message: `${orderNumber} · Order created successfully.`,
      entity_type: "order",
      entity_id: orderId,
    }).catch(err => console.error("[webhook] order_created notification failed:", err));
    if (isNewClient) {
      createNotification({
        type: "client_created",
        title: "New Client Created",
        message: `${clientName} · Client profile created successfully.`,
        entity_type: "client",
        entity_id: clientId,
      }).catch(err => console.error("[webhook] client_created notification failed:", err));
    }
  } else {
    const existing = existingOrders[0].data as Record<string, unknown>;
    orderName = (existing.order_name ?? existing.orderName ?? clientName) as string;
    console.log(`[webhook] order ${orderId} already exists — reusing`);
  }

  // Deterministic finance ID — same formula as handleApproveLead in crm/page.tsx
  const invoiceId = `invoice-${orderId}`;
  const { data: existingFin } = await db
    .from("finances")
    .select("id")
    .eq("id", invoiceId)
    .limit(1);

  if (!existingFin || existingFin.length === 0) {
    const salesTaxAmount = Number(depData.sales_tax_amount ?? 0);
    const financeData: Record<string, unknown> = {
      id: invoiceId,
      client: clientName,
      client_name: clientName,
      client_email: (leadData.email ?? depData.client_email ?? "") as string,
      orderName,
      order_name: orderName,
      order_id: orderId,
      lead_id: leadId,
      quote_id: (leadData.quote_id ?? depData.quote_id ?? "") as string,
      deposit_request_id: depositRequestId,
      total_amount: totalAmount,
      amount: totalAmount,
      deposit_amount: depositAmount,
      deposit_paid: true,
      deposit_paid_date: today,
      balance_remaining: balanceRemaining,
      final_paid: false,
      status: "Deposit Paid",
      created_at: paidAt,
    };
    if (depData.subtotal != null) financeData.subtotal = depData.subtotal;
    if (depData.sales_tax_rate != null) financeData.sales_tax_rate = depData.sales_tax_rate;
    if (salesTaxAmount > 0) {
      financeData.sales_tax_amount = salesTaxAmount;
      financeData.grand_total = depData.grand_total ?? totalAmount;
      const taxOnDeposit = depositTaxCollected ?? 0;
      if (taxOnDeposit > 0) {
        financeData.tax_collected_amount = taxOnDeposit;
        financeData.tax_collected_at = today;
      }
    }
    await db.from("finances").upsert({ id: invoiceId, data: financeData });
    console.log(`[webhook] created finance ${invoiceId} for order ${orderId}`);
  } else {
    console.log(`[webhook] finance ${invoiceId} already exists — skipping create`);
  }
}

// ─── Notification helpers ─────────────────────────────────────────────────────

function fmtNotifAmount(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

async function notifyAchPayment(
  kind: "cleared" | "failed",
  table: "finances" | "deposit_requests",
  id: string,
  baseAmount: string | number | undefined,
): Promise<void> {
  const db = getSupabaseAdmin();
  const { data: rows } = await db.from(table).select("data").eq("id", id).limit(1);
  const d = (rows?.[0]?.data ?? {}) as Record<string, unknown>;
  const clientName = (d.client_name ?? d.client ?? "") as string;
  const amount = baseAmount != null
    ? Number(baseAmount)
    : Number(table === "finances" ? (d.balance_remaining ?? 0) : (d.deposit_amount ?? 0));
  await createNotification({
    type: kind === "cleared" ? "ach_payment_cleared" : "ach_payment_failed",
    title: kind === "cleared" ? "ACH Payment Cleared" : "ACH Payment Failed",
    message: `${clientName}${amount > 0 ? ` · ${fmtNotifAmount(amount)}` : ""}`,
    entity_type: table === "finances" ? "finance" : "order",
    entity_id: id,
  });
}

async function notifyFinalInvoicePaid(financeId: string, baseAmount: string | undefined): Promise<void> {
  const db = getSupabaseAdmin();
  const { data: rows } = await db.from("finances").select("data").eq("id", financeId).limit(1);
  const fd = (rows?.[0]?.data ?? {}) as Record<string, unknown>;
  const clientName = (fd.client_name ?? fd.client ?? "") as string;
  const amount = Number(baseAmount ?? 0);
  await createNotification({
    type: "final_invoice_paid",
    title: "Final Invoice Paid",
    message: `${clientName}${amount > 0 ? ` · ${fmtNotifAmount(amount)}` : ""}`,
    entity_type: "finance",
    entity_id: financeId,
  });
  console.log(`[webhook] notified: final invoice paid ${financeId}`);
}

// ─── Event handlers ───────────────────────────────────────────────────────────

async function handleSessionCompleted(session: CheckoutSession): Promise<void> {
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;
  const meta = session.metadata ?? {};

  console.log(
    `[webhook] checkout.session.completed id=${session.id} ` +
    `payment_status=${session.payment_status} payment_type=${meta.payment_type ?? "none"} ` +
    `deposit_request_id=${meta.deposit_request_id ?? "none"} ` +
    `finance_id=${meta.finance_id ?? "none"} ` +
    `lead_id=${meta.lead_id ?? "none"} ` +
    `payment_method=${meta.payment_method ?? "none"}`,
  );

  // ── Final invoice path ────────────────────────────────────────────────────
  const financeId = meta.finance_id;
  if (financeId) {
    const paidAt = new Date().toISOString();
    if (session.payment_status === "paid") {
      // Card: confirmed immediately
      console.log(`[webhook] final invoice ${financeId} → Paid (${meta.payment_method ?? "card"})`);
      // Compute remaining tax for this final payment
      const { data: finRows } = await getSupabaseAdmin().from("finances").select("data").eq("id", financeId).limit(1);
      const finData = (finRows?.[0]?.data ?? {}) as Record<string, unknown>;
      const finSalesTax = Number(finData.sales_tax_amount ?? 0);
      const finTaxAlreadyCollected = Number(finData.tax_collected_amount ?? 0);
      const finalTaxFields: Record<string, unknown> = {};
      if (finSalesTax > 0) {
        const remainingTax = Math.max(Math.round((finSalesTax - finTaxAlreadyCollected) * 100) / 100, 0);
        finalTaxFields.tax_collected_amount = finTaxAlreadyCollected + remainingTax;
        finalTaxFields.tax_collected_at = paidAt.slice(0, 10);
      }
      await updateRecord("finances", financeId, {
        final_paid: true,
        final_paid_date: paidAt.slice(0, 10),
        balance_remaining: 0,
        status: "Paid",
        stripe_final_session_id: session.id,
        stripe_final_payment_intent_id: paymentIntentId,
        final_paid_at: paidAt,
        ...finalTaxFields,
      });
      notifyFinalInvoicePaid(financeId, meta.base_amount).catch(err => console.error("[webhook] final invoice notification failed:", err));
    } else {
      // Bank ACH: initiated — wait for async_payment_succeeded
      console.log(`[webhook] final invoice ${financeId} → bank ACH initiated (awaiting settlement)`);
      await updateRecord("finances", financeId, {
        stripe_final_session_id: session.id,
        stripe_final_payment_intent_id: paymentIntentId,
        final_payment_initiated_at: paidAt,
      });
    }
    return;
  }

  // ── Deposit path ──────────────────────────────────────────────────────────
  const depositRequestId = meta.deposit_request_id;
  if (!depositRequestId) {
    console.warn(
      `[webhook] checkout.session.completed: no finance_id or deposit_request_id ` +
      `in metadata — session=${session.id} — ignoring`,
    );
    return;
  }

  if (session.payment_status === "paid") {
    // Card: payment confirmed immediately — run full fulfillment
    console.log(`[webhook] deposit ${depositRequestId} → card payment confirmed`);
    await fulfillDepositPaid(session, depositRequestId, paymentIntentId);
  } else {
    // Bank ACH: record pending state — fulfillment deferred to async_payment_succeeded
    console.log(`[webhook] deposit ${depositRequestId} → bank ACH initiated (pending)`);
    await updateRecord("deposit_requests", depositRequestId, {
      status: "pending",
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      payment_initiated_at: new Date().toISOString(),
    });
  }
}

async function handleAsyncPaymentSucceeded(session: CheckoutSession): Promise<void> {
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;
  const meta = session.metadata ?? {};

  console.log(
    `[webhook] checkout.session.async_payment_succeeded id=${session.id} ` +
    `payment_type=${meta.payment_type ?? "none"} ` +
    `deposit_request_id=${meta.deposit_request_id ?? "none"} ` +
    `finance_id=${meta.finance_id ?? "none"}`,
  );

  // ── Final invoice path ────────────────────────────────────────────────────
  const financeId = meta.finance_id;
  if (financeId) {
    const paidAt = new Date().toISOString();
    console.log(`[webhook] final invoice ${financeId} → Paid (bank ACH settled)`);
    const { data: asyncFinRows } = await getSupabaseAdmin().from("finances").select("data").eq("id", financeId).limit(1);
    const asyncFinData = (asyncFinRows?.[0]?.data ?? {}) as Record<string, unknown>;
    const asyncFinSalesTax = Number(asyncFinData.sales_tax_amount ?? 0);
    const asyncFinTaxCollected = Number(asyncFinData.tax_collected_amount ?? 0);
    const asyncFinalTaxFields: Record<string, unknown> = {};
    if (asyncFinSalesTax > 0) {
      const remainingTax = Math.max(Math.round((asyncFinSalesTax - asyncFinTaxCollected) * 100) / 100, 0);
      asyncFinalTaxFields.tax_collected_amount = asyncFinTaxCollected + remainingTax;
      asyncFinalTaxFields.tax_collected_at = paidAt.slice(0, 10);
    }
    await updateRecord("finances", financeId, {
      final_paid: true,
      final_paid_date: paidAt.slice(0, 10),
      balance_remaining: 0,
      status: "Paid",
      stripe_final_payment_intent_id: paymentIntentId,
      final_paid_at: paidAt,
      ...asyncFinalTaxFields,
    });
    notifyFinalInvoicePaid(financeId, meta.base_amount).catch(err => console.error("[webhook] final invoice notification failed:", err));
    notifyAchPayment("cleared", "finances", financeId, meta.base_amount).catch(err => console.error("[webhook] ACH cleared notification failed:", err));
    return;
  }

  // ── Deposit path ──────────────────────────────────────────────────────────
  const depositRequestId = meta.deposit_request_id;
  if (!depositRequestId) {
    console.warn(
      `[webhook] async_payment_succeeded: no finance_id or deposit_request_id ` +
      `in metadata — session=${session.id} — ignoring`,
    );
    return;
  }

  // Bank ACH settled — run full deposit fulfillment (same as card path)
  console.log(`[webhook] deposit ${depositRequestId} → bank ACH settled`);
  await fulfillDepositPaid(session, depositRequestId, paymentIntentId);
  notifyAchPayment("cleared", "deposit_requests", depositRequestId, undefined).catch(err => console.error("[webhook] ACH cleared notification failed:", err));
}

async function handleAsyncPaymentFailed(session: CheckoutSession): Promise<void> {
  const meta = session.metadata ?? {};

  console.log(
    `[webhook] checkout.session.async_payment_failed id=${session.id} ` +
    `payment_type=${meta.payment_type ?? "none"} ` +
    `deposit_request_id=${meta.deposit_request_id ?? "none"} ` +
    `finance_id=${meta.finance_id ?? "none"}`,
  );

  const financeId = meta.finance_id;
  if (financeId) {
    await updateRecord("finances", financeId, {
      final_payment_failed_at: new Date().toISOString(),
    });
    notifyAchPayment("failed", "finances", financeId, meta.base_amount).catch(err => console.error("[webhook] ACH failed notification error:", err));
    return;
  }

  const depositRequestId = meta.deposit_request_id;
  if (!depositRequestId) {
    console.warn(`[webhook] async_payment_failed: no IDs in metadata — session=${session.id}`);
    return;
  }

  await updateRecord("deposit_requests", depositRequestId, {
    status: "payment_failed",
    payment_failed_at: new Date().toISOString(),
  });
  notifyAchPayment("failed", "deposit_requests", depositRequestId, undefined).catch(err => console.error("[webhook] ACH failed notification error:", err));
}
