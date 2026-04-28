import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { postToSlack, severityEmoji } from "@/lib/notify/slack";
import { HttpError } from "@/lib/api/response";
import type { Platform } from "@/lib/supabase/types";

const WARN_RATIO = 0.8;
const HARD_RATIO = 0.95;

function currentPeriodStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString();
}

/**
 * Increment the monthly call counter for `(client, platform)`. Sends a Slack
 * warning at 80%, throws an HttpError(429) at 95%.
 */
export async function trackApiCall(
  clientId: string,
  platform: Platform,
): Promise<void> {
  const db = supabaseAdmin();
  const periodStart = currentPeriodStart();

  const { data: existing } = await db
    .from("api_quota_usage")
    .select("id, call_count, monthly_limit")
    .eq("client_id", clientId)
    .eq("platform", platform)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (!existing) {
    await db.from("api_quota_usage").insert({
      client_id: clientId,
      platform,
      period_start: periodStart,
      call_count: 1,
      // Default monthly limit per platform — tweak per plan later.
      monthly_limit: platform === "x" ? 1500 : 200,
    });
    return;
  }

  const next = existing.call_count + 1;
  const ratio = next / Math.max(1, existing.monthly_limit);

  if (ratio >= HARD_RATIO) {
    throw new HttpError(
      429,
      "Monthly API quota nearly exhausted; further calls are throttled.",
      "warning",
    );
  }

  await db
    .from("api_quota_usage")
    .update({ call_count: next, updated_at: new Date().toISOString() })
    .eq("id", existing.id);

  if (existing.call_count / existing.monthly_limit < WARN_RATIO && ratio >= WARN_RATIO) {
    await postToSlack({
      text:
        `${severityEmoji("warning")} client \`${clientId}\` reached ${Math.round(ratio * 100)}% of ${platform} monthly quota.`,
    });
  }
}
