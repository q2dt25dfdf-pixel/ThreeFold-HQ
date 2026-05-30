import { okResponse } from "@/lib/aiResponse";

// Disable static generation — this route must always run server-side so the
// timestamp is current and Cache-Control: no-store is applied at runtime.
export const dynamic = "force-dynamic";

/**
 * GET /api/ai/health
 *
 * Unauthenticated liveness check. Returns only { status: "ok" } plus the
 * standard meta.as_of timestamp. No HQ data is included.
 *
 * Used to verify the API integration is reachable before configuring auth
 * in a ChatGPT Custom GPT or any other AI client.
 */
export async function GET(): Promise<Response> {
  return okResponse({ status: "ok" });
}
