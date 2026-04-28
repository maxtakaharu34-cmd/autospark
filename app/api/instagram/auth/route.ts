import { fail, withErrorBoundary, HttpError } from "@/lib/api/response";
import { requireAdminApi } from "@/lib/api/auth-guard";

const SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
].join(",");

export const GET = withErrorBoundary(async (request) => {
  await requireAdminApi();
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return fail(400, "clientId is required.");

  const appId = process.env.META_APP_ID;
  const callback = process.env.META_OAUTH_CALLBACK_URL;
  if (!appId || !callback) {
    throw new HttpError(503, "Meta credentials are not configured.", "critical");
  }

  const state = Buffer.from(JSON.stringify({ clientId })).toString("base64url");
  const authUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", callback);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("state", state);

  return Response.redirect(authUrl.toString(), 302);
});
