import "server-only";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Anon Supabase client for the customer console (`/app`). Honors RLS and the
 * Supabase Auth session. Use ONLY where cookies are mutable: the login Server
 * Action (signInWithOtp stores the PKCE verifier cookie) and the auth callback
 * Route Handler (exchangeCodeForSession reads it). Never bypasses RLS — do not
 * use service-role here, and do not use this in a Server Component render path
 * (use supabaseServer() there).
 */
export function supabaseAppSession() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase anon credentials are not configured.");

  const store = cookies();
  return createServerClient(url, key, {
    auth: { flowType: "pkce" }, // magic link carries ?code=; verifier stored in cookie
    cookies: {
      getAll: () => store.getAll().map((c) => ({ name: c.name, value: c.value })),
      setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
        for (const { name, value, options } of toSet) {
          store.set(name, value, options);
        }
      },
    },
  });
}
