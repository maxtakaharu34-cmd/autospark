import "server-only";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ClientRow } from "@/lib/supabase/types";

/**
 * For `/app` server components. Requires a Supabase session AND a linked client.
 * - not signed in            -> redirect /app/login
 * - signed in, not linked    -> redirect /app/not-ready
 *
 * Uses the read-only `supabaseServer()` (no-op cookie setAll): Server Components
 * cannot mutate cookies in Next 14. Session refresh is handled by middleware.ts.
 */
export async function requireClient(): Promise<{ userId: string; client: ClientRow }> {
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();
  if (!user) redirect("/app/login");

  // RLS-safe: client resolved by service-role keyed on the verified auth uid.
  const { data } = await supabaseAdmin()
    .from("clients")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!data) redirect("/app/not-ready");
  return { userId: user.id, client: data as ClientRow };
}
