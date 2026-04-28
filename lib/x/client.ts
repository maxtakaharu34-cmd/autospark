import "server-only";
import { TwitterApi } from "twitter-api-v2";
import { decrypt } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/api/response";
import type { XAccountRow } from "@/lib/supabase/types";

function appCredentials() {
  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;
  if (!appKey || !appSecret) {
    throw new HttpError(503, "X app credentials are not configured.", "critical");
  }
  return { appKey, appSecret };
}

/** App-only client (Bearer) for read endpoints that don't require user context. */
export function appOnlyXClient(): TwitterApi {
  const bearer = process.env.X_BEARER_TOKEN;
  if (!bearer) {
    throw new HttpError(503, "X bearer token is not configured.", "critical");
  }
  return new TwitterApi(bearer);
}

/** OAuth 1.0a request-token client for the auth handshake. */
export function oauthRequestClient(): TwitterApi {
  return new TwitterApi(appCredentials());
}

/**
 * Build a user-context client for a given client (decrypts stored OAuth 1.0a tokens).
 */
export async function userXClient(clientId: string): Promise<{
  client: TwitterApi;
  account: XAccountRow;
}> {
  const { data, error } = await supabaseAdmin()
    .from("x_accounts")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to load X account.", "critical");
  }
  if (!data) {
    throw new HttpError(404, "X account is not connected for this client.", "warning");
  }

  const account = data as XAccountRow;
  const accessToken = decrypt(account.access_token_enc);
  const accessSecret = decrypt(account.access_secret_enc);
  const { appKey, appSecret } = appCredentials();

  const client = new TwitterApi({
    appKey,
    appSecret,
    accessToken,
    accessSecret,
  });
  return { client, account };
}
