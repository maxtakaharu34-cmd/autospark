import { TwitterApi } from "twitter-api-v2";
import { withErrorBoundary, fail, HttpError } from "@/lib/api/response";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/crypto";
import { requireAdminApi } from "@/lib/api/auth-guard";

export const GET = withErrorBoundary(async (request) => {
  await requireAdminApi();
  const url = new URL(request.url);
  const oauth_token = url.searchParams.get("oauth_token");
  const oauth_verifier = url.searchParams.get("oauth_verifier");
  if (!oauth_token || !oauth_verifier) {
    return fail(400, "oauth_token and oauth_verifier are required.");
  }

  // Look up the matching request from /api/x/auth.
  const { data: pending } = await supabaseAdmin()
    .from("error_logs")
    .select("id, meta")
    .eq("kind", "x_oauth_request")
    .order("created_at", { ascending: false })
    .limit(20);

  const match = (pending ?? []).find((row) => {
    const meta = row.meta as { oauth_token?: string } | null;
    return meta?.oauth_token === oauth_token;
  });
  if (!match) {
    throw new HttpError(404, "OAuth request expired or unknown.", "warning");
  }

  const meta = match.meta as {
    oauth_token: string;
    oauth_token_secret_enc: string;
    client_id: string;
  };
  const requestSecret = decrypt(meta.oauth_token_secret_enc);

  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;
  if (!appKey || !appSecret) {
    throw new HttpError(503, "X app credentials are not configured.", "critical");
  }

  const tempClient = new TwitterApi({
    appKey,
    appSecret,
    accessToken: oauth_token,
    accessSecret: requestSecret,
  });
  const { client: loggedClient, accessToken, accessSecret } = await tempClient.login(oauth_verifier);
  const me = await loggedClient.v2.me();

  await supabaseAdmin().from("x_accounts").upsert(
    {
      client_id: meta.client_id,
      handle: me.data.username,
      user_id: me.data.id,
      access_token_enc: encrypt(accessToken),
      access_secret_enc: encrypt(accessSecret),
      scopes: ["tweet.read", "tweet.write", "users.read"],
    },
    { onConflict: "client_id,user_id" },
  );

  await supabaseAdmin().from("error_logs").update({ resolved: true }).eq("id", match.id);

  return Response.redirect(new URL(`/dashboard/clients/${meta.client_id}?connected=x`, request.url), 302);
});
