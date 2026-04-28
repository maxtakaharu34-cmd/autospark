import { withErrorBoundary, ok } from "@/lib/api/response";
import { requireCronSecret } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/notify/resend";
import type { ClientRow, PostHistoryRow } from "@/lib/supabase/types";

function renderHtml(client: ClientRow, posts: PostHistoryRow[]): string {
  const totals = posts.reduce(
    (acc, p) => {
      acc.impressions += p.impressions;
      acc.likes += p.likes;
      acc.replies += p.replies;
      return acc;
    },
    { impressions: 0, likes: 0, replies: 0 },
  );
  const top = [...posts].sort((a, b) => b.impressions - a.impressions).slice(0, 5);

  return `
    <h2>${client.name} — 週次レポート</h2>
    <ul>
      <li>投稿数: ${posts.length}</li>
      <li>合計インプレッション: ${totals.impressions.toLocaleString()}</li>
      <li>合計いいね: ${totals.likes.toLocaleString()}</li>
      <li>合計リプライ: ${totals.replies.toLocaleString()}</li>
    </ul>
    <h3>今週のTOP5</h3>
    <ol>
      ${top.map((p) => `<li>[${p.platform}] ${(p.text ?? "").slice(0, 80)} — ${p.impressions} imp</li>`).join("")}
    </ol>
  `;
}

export const GET = withErrorBoundary(async (request) => {
  requireCronSecret(request);
  const db = supabaseAdmin();

  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const { data: clients } = await db.from("clients").select("*");

  let sent = 0;
  for (const c of (clients ?? []) as ClientRow[]) {
    if (!c.email) continue;
    const { data: posts } = await db.from("post_history").select("*").eq("client_id", c.id).gte("posted_at", since);
    const html = renderHtml(c, (posts ?? []) as PostHistoryRow[]);
    try {
      await sendEmail({ to: c.email, subject: `[AutoSpark] ${c.name} 週次レポート`, html });
      sent++;
    } catch (e) {
      console.error("weekly report send failed for", c.id, e);
    }
  }

  return ok({ sent, total: (clients ?? []).length });
});
