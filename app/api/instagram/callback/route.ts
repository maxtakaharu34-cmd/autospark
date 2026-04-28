import { withErrorBoundary, fail, HttpError } from "@/lib/api/response";
import { requireAdminApi } from "@/lib/api/auth-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";

interface ShortTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}
interface LongTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}
interface MePagesResponse {
  data: Array<{
    id: string;
    name: string;
    access_token: string;
    instagram_business_account?: { id: string };
  }>;
}
interface IgUserResponse {
  username: string;
  id: string;
}

export const GET = withErrorBoundary(async (request) => {
  await requireAdminApi();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail(400, "code and state are required.");

  let clientId: string;
  try {
    clientId = (JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { clientId: string }).clientId;
  } catch {
    return fail(400, "state is invalid.");
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const callback = process.env.META_OAUTH_CALLBACK_URL;
  if (!appId || !appSecret || !callback) {
    throw new HttpError(503, "Meta credentials are not configured.", "critical");
  }

  // 1. Exchange code -> short-lived token
  const shortRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(callback)}&code=${encodeURIComponent(code)}`,
    { cache: "no-store" },
  );
  if (!shortRes.ok) throw new HttpError(502, "Meta token exchange failed.", "warning");
  const shortBody = (await shortRes.json()) as ShortTokenResponse;

  // 2. Exchange short -> long-lived token (~60 days)
  const longRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortBody.access_token}`,
    { cache: "no-store" },
  );
  if (!longRes.ok) throw new HttpError(502, "Meta long-token exchange failed.", "warning");
  const longBody = (await longRes.json()) as LongTokenResponse;

  // 3. Resolve the IG business account from the user's pages.
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longBody.access_token}`,
    { cache: "no-store" },
  );
  if (!pagesRes.ok) throw new HttpError(502, "Failed to fetch pages.", "warning");
  const pages = (await pagesRes.json()) as MePagesResponse;

  const page = pages.data.find((p) => p.instagram_business_account);
  if (!page || !page.instagram_business_account) {
    throw new HttpError(400, "No Instagram business account is linked to any owned page.", "warning");
  }

  const igUserId = page.instagram_business_account.id;
  const userRes = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}?fields=username,id&access_token=${page.access_token}`,
    { cache: "no-store" },
  );
  if (!userRes.ok) throw new HttpError(502, "Failed to fetch IG user.", "warning");
  const igUser = (await userRes.json()) as IgUserResponse;

  const expiresAt = new Date(Date.now() + longBody.expires_in * 1000).toISOString();

  await supabaseAdmin().from("instagram_accounts").upsert(
    {
      client_id: clientId,
      ig_user_id: igUserId,
      username: igUser.username,
      // Page access token is what's used to call IG endpoints.
      access_token_enc: encrypt(page.access_token),
      token_expires_at: expiresAt,
    },
    { onConflict: "client_id,ig_user_id" },
  );

  return Response.redirect(new URL(`/dashboard/clients/${clientId}?connected=instagram`, request.url), 302);
});
