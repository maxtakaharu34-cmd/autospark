import { withErrorBoundary, ok } from "@/lib/api/response";
import { requireCronSecret } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { postToSlack } from "@/lib/notify/slack";
import type { PostHistoryRow, ErrorLogRow } from "@/lib/supabase/types";

export const GET = withErrorBoundary(async (request) => {
  requireCronSecret(request);
  const db = supabaseAdmin();

  const now = new Date();
  const yesterdayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)).toISOString();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

  const [posts, scheduled, errors] = await Promise.all([
    db.from("post_history").select("*").gte("posted_at", yesterdayStart).lt("posted_at", todayStart),
    db.from("scheduled_posts").select("*").gte("scheduled_at", todayStart).lt("scheduled_at", tomorrow).eq("status", "pending"),
    db.from("error_logs").select("*").eq("resolved", false).in("severity", ["warning", "critical"]).order("created_at", { ascending: false }).limit(10),
  ]);

  const postRows = (posts.data ?? []) as PostHistoryRow[];
  const top = [...postRows].sort((a, b) => b.impressions - a.impressions).slice(0, 3);
  const todoCount = (errors.data ?? []).length;

  const lines = [
    "*:sunrise: AutoSpark 朝サマリー*",
    `昨日の投稿: ${postRows.length}件`,
    "*伸びた投稿 TOP3*",
    ...top.map((p, i) => `${i + 1}. [${p.platform}] ${(p.text ?? "").slice(0, 60)} — ${p.impressions} imp`),
    `今日の予約: ${(scheduled.data ?? []).length}件`,
    `要対応: ${todoCount}件`,
    ...(((errors.data ?? []) as ErrorLogRow[]).slice(0, 5).map((e) => `  • [${e.severity}] ${e.kind}: ${e.message}`)),
  ];

  await postToSlack({ text: lines.join("\n") });

  return ok({ posts: postRows.length, todo: todoCount, scheduledToday: (scheduled.data ?? []).length });
});
