import { z } from "zod";
import { oauthRequestClient } from "@/lib/x/client";
import { fail, withErrorBoundary, HttpError } from "@/lib/api/response";
import { requireAdminApi } from "@/lib/api/auth-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";

const querySchema = z.object({ clientId: z.string().uuid() });

/**
 * Begin the X OAuth 1.0a flow. The client (browser) is redirected to X with a
 * request token. We stash the request-token secret + clientId in
 * `error_logs`-adjacent table? No — we store transiently in a dedicated row
 * via Supabase using a short-lived storage table. For simplicity the secret is
 * encoded into the state cookie below.
 */
export const GET = withErrorBoundary(async (request) => {
  await requireAdminApi();
  const url = new URL(request.url);
  const params = querySchema.safeParse({ clientId: url.searchParams.get("clientId") });
  if (!params.success) return fail(400, "clientId query is required.");

  const callbackUrl = process.env.X_OAUTH_CALLBACK_URL;
  if (!callbackUrl) throw new HttpError(503, "X callback URL is not configured.", "critical");

  const oauth = oauthRequestClient();
  const { url: authUrl, oauth_token, oauth_token_secret } = await oauth.generateAuthLink(callbackUrl, {
    linkMode: "authorize",
  });

  // Persist the request-token secret keyed by oauth_token so /callback can finish it.
  await supabaseAdmin().from("error_logs").insert({
    severity: "info",
    kind: "x_oauth_request",
    message: "X OAuth request token issued.",
    meta: {
      oauth_token,
      oauth_token_secret_enc: encrypt(oauth_token_secret),
      client_id: (params.data as { clientId: string }).clientId,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    },
  });

  return Response.redirect(authUrl, 302);
});
