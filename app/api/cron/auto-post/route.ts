import { withErrorBoundary, ok, HttpError } from "@/lib/api/response";
import { requireCronSecret } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { userXClient } from "@/lib/x/client";
import { loadIgAuth, igPost, publishContainer } from "@/lib/instagram/client";
import { logError } from "@/lib/monitoring/logError";
import { postToSlack } from "@/lib/notify/slack";
import type { ClientRow, ScheduledPostPayload, ScheduledPostRow } from "@/lib/supabase/types";

const MAX_ATTEMPTS = 3;

async function runX(client: ClientRow, payload: ScheduledPostPayload): Promise<string> {
  const { client: x } = await userXClient(client.id);
  switch (payload.action) {
    case "post":
      if (!payload.text) throw new HttpError(400, "post requires text", "warning");
      return (await x.v2.tweet(payload.text)).data.id;
    case "thread":
      if (!payload.thread || payload.thread.length < 2) throw new HttpError(400, "thread requires >=2 tweets", "warning");
      return (await x.v2.tweetThread(payload.thread))[0]?.data.id ?? "";
    case "quote_rt":
      if (!payload.text || !payload.target_tweet_id) throw new HttpError(400, "quote_rt requires text + target", "warning");
      return (await x.v2.tweet(payload.text, { quote_tweet_id: payload.target_tweet_id })).data.id;
    case "reply":
      if (!payload.text || !payload.reply_to_tweet_id) throw new HttpError(400, "reply requires text + target", "warning");
      return (await x.v2.reply(payload.text, payload.reply_to_tweet_id)).data.id;
    default:
      throw new HttpError(400, `Unknown X action: ${payload.action}`, "warning");
  }
}

async function runInstagram(client: ClientRow, payload: ScheduledPostPayload): Promise<string> {
  const { account, accessToken } = await loadIgAuth(client.id);
  if (payload.action === "ig_feed") {
    if (!payload.media_urls?.[0]) throw new HttpError(400, "ig_feed requires media_urls[0]", "warning");
    const created = await igPost<{ id: string }>(`/${account.ig_user_id}/media`, {
      image_url: payload.media_urls[0],
      caption: payload.caption ?? "",
      access_token: accessToken,
    });
    return publishContainer(account.ig_user_id, accessToken, created.id);
  }
  if (payload.action === "ig_reel") {
    if (!payload.media_urls?.[0]) throw new HttpError(400, "ig_reel requires media_urls[0]", "warning");
    const created = await igPost<{ id: string }>(`/${account.ig_user_id}/media`, {
      media_type: "REELS",
      video_url: payload.media_urls[0],
      caption: payload.caption ?? "",
      access_token: accessToken,
    });
    return publishContainer(account.ig_user_id, accessToken, created.id);
  }
  throw new HttpError(400, `Unsupported IG action: ${payload.action}`, "warning");
}

export const GET = withErrorBoundary(async (request) => {
  requireCronSecret(request);
  const db = supabaseAdmin();

  const { data: due } = await db
    .from("scheduled_posts")
    .select("*")
    .in("status", ["pending"])
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at")
    .limit(50);

  const rows = (due ?? []) as ScheduledPostRow[];
  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    await db.from("scheduled_posts").update({ status: "running" }).eq("id", row.id);

    const { data: clientRow } = await db.from("clients").select("*").eq("id", row.client_id).maybeSingle();
    if (!clientRow) {
      await db.from("scheduled_posts").update({ status: "failed", last_error: "client_missing" }).eq("id", row.id);
      failed++;
      continue;
    }
    const client = clientRow as ClientRow;
    if (client.suspend_at && new Date(client.suspend_at).getTime() <= Date.now()) {
      await db.from("scheduled_posts").update({ status: "cancelled", last_error: "client_suspended" }).eq("id", row.id);
      continue;
    }

    try {
      const externalId = row.platform === "x"
        ? await runX(client, row.payload)
        : await runInstagram(client, row.payload);

      await db.from("post_history").insert({
        client_id: client.id,
        platform: row.platform,
        external_id: externalId,
        action: row.payload.action,
        text: row.payload.text ?? row.payload.caption ?? null,
      });
      await db.from("scheduled_posts").update({ status: "succeeded", attempts: row.attempts + 1 }).eq("id", row.id);
      succeeded++;
    } catch (error) {
      const attempts = row.attempts + 1;
      const message = error instanceof Error ? error.message : String(error);
      const finalFailure = attempts >= MAX_ATTEMPTS;
      await db.from("scheduled_posts").update({
        status: finalFailure ? "failed" : "pending",
        attempts,
        last_error: message,
      }).eq("id", row.id);

      if (finalFailure) {
        failed++;
        await logError({
          severity: "critical",
          clientId: client.id,
          kind: "auto_post_failed",
          message,
          meta: { row },
        });
        await postToSlack({
          channel: "errors",
          text: `:rotating_light: scheduled_post ${row.id} failed permanently after ${MAX_ATTEMPTS} attempts.\n\`${message}\``,
        });
      }
    }
  }

  return ok({ processed: rows.length, succeeded, failed });
});
