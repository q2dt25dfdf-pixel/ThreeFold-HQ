import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/rest\/v1\/?$/, "");
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const noStoreFetch: typeof fetch = (input, init = {}) => {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");

  return fetch(input, {
    ...init,
    cache: "no-store",
    headers,
  });
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { fetch: noStoreFetch },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
