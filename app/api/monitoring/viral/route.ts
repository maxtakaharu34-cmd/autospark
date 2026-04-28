import { withErrorBoundary, ok } from "@/lib/api/response";
import { requireCronSecret } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { userXClient } from "@/lib/x/client";
import { postToSlack } from "@/lib/notify/slack";
import type { PostHistoryRow } from "@/lib/supabase/types";

const VIRAL_THRESHOLD = 100_000;

export const GET = withErrorBoundary(async (request) => {
  requireCronSecret(request);
  const db = supabaseAdmin();

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: rows } = await db
    .from("post_history")
    .select("*")
    .eq("platform", "x")
    .gte("posted_at", since)
    .lt("impressions", VIRAL_THRESHOLD)
    .not("external_id", "is", null);

  let flagged = 0;
  for (const row of (rows ?? []) as PostHistoryRow[]) {
    if (!row.external_id) continue;
    try {
      const { client: x } = await userXClient(row.client_id);
      const t = await x.v2.singleTweet(row.external_id, { "tweet.fields": ["public_metrics"] });
      const m = t.data.public_metrics;
      const impressions = m?.impression_count ?? 0;
      await db.from("post_history").update({
        impressions,
        likes: m?.like_count ?? row.likes,
        retweets: m?.retweet_count ?? row.retweets,
        replies: m?.reply_count ?? row.replies,
        measured_at: new Date().toISOString(),
      }).eq("id", row.id);

      if (impressions >= VIRAL_THRESHOLD) {
        flagged++;
        const url = `https://x.com/i/web/status/${row.external_id}`;
        await postToSlack({
          text: `:rocket: viral! client \`${row.client_id}\` — ${impressions.toLocaleString()} imp\n${url}`,
        });
      }
    } catch (e) {
      console.error("viral check failed", row.id, e);
    }
  }

  return ok({ checked: (rows ?? []).length, flagged });
});
