"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseAppSession } from "@/lib/supabase/client-session";

export async function sendMagicLink(_prev: unknown, formData: FormData): Promise<{ message: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { message: "メールアドレスを入力してください。" };

  // Invite gate: only invited, existing clients may receive a link.
  // Exact `.eq` against normalized lowercase email (0003) — never ILIKE.
  const { data: client } = await supabaseAdmin()
    .from("clients")
    .select("id, invited_at")
    .eq("email", email)
    .maybeSingle();

  // Always return the same message (do not leak whether an email is registered).
  const generic = { message: "ログインリンクを送信しました。メールをご確認ください。" };
  if (!client || !client.invited_at) return generic;

  // APP_BASE_URL is the public origin of the deployment (e.g. https://autospark.app).
  // Must be set in prod; falling back to localhost would email broken links to customers.
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const redirectTo = `${baseUrl}/app/auth/callback`;
  await supabaseAppSession().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  });
  return generic;
}
