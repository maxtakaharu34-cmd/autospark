import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseAppSession } from "@/lib/supabase/client-session";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  const supabase = supabaseAppSession();

  // Supabase magic links arrive either as a PKCE `?code=` (default for
  // @supabase/ssr) or as `?token_hash=&type=`. Handle both.
  let userEmail: string | null = null;
  let userId: string | null = null;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user?.email) return NextResponse.redirect(`${origin}/app/login`);
    userEmail = data.user.email;
    userId = data.user.id;
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error || !data.user?.email) return NextResponse.redirect(`${origin}/app/login`);
    userEmail = data.user.email;
    userId = data.user.id;
  } else {
    return NextResponse.redirect(`${origin}/app/login`);
  }

  const email = userEmail.toLowerCase();
  const admin = supabaseAdmin();
  // Link the verified auth user to the matching, not-yet-linked client.
  // Exact `.eq` (emails are normalized lowercase in 0003) — never LIKE/ILIKE.
  const { data: client } = await admin
    .from("clients")
    .select("id, auth_user_id")
    .eq("email", email)
    .maybeSingle();

  if (client && client.auth_user_id === null) {
    await admin.from("clients").update({ auth_user_id: userId }).eq("id", client.id);
  }
  return NextResponse.redirect(`${origin}/app`);
}
