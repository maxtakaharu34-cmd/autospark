import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Anon-key Supabase client for Server Components and Server Actions.
 * Honors RLS. Do NOT use this in API routes that need to mutate operator-owned
 * data — use `supabaseAdmin()` from `./admin` for those.
 */
export function supabaseServer() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase anon credentials are not configured.");
  }

  const store = cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll().map((c) => ({ name: c.name, value: c.value })),
      setAll: () => {
        // RSC cannot mutate cookies — Auth.js handles its own session cookies.
      },
    },
  });
}
