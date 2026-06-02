import { requireClient } from "@/lib/api/client-guard";
import { supabaseServer } from "@/lib/supabase/server";
import type { PostHistoryRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function AppDashboard() {
  await requireClient(); // ensures linked client / redirects otherwise
  // RLS restricts rows to the caller's client automatically (read-only client).
  const { data } = await supabaseServer()
    .from("post_history")
    .select("id, platform, action, text, impressions, likes, posted_at")
    .order("posted_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as Pick<PostHistoryRow,
    "id" | "platform" | "action" | "text" | "impressions" | "likes" | "posted_at">[];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">投稿実績</h1>
      <div className="rounded-xl border divide-y">
        {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">まだ投稿はありません。</p>}
        {rows.map((r) => (
          <div key={r.id} className="p-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm truncate">{r.text ?? r.action}</p>
              <p className="text-xs text-muted-foreground">
                {r.platform} ・ {new Date(r.posted_at).toLocaleString("ja-JP")}
              </p>
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap">
              👁 {r.impressions} ・ ♥ {r.likes}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
