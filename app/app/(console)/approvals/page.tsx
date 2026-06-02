import { requireClient } from "@/lib/api/client-guard";
import { supabaseServer } from "@/lib/supabase/server";
import { approvePost, rejectPost } from "./actions";
import type { ScheduledPostRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  await requireClient();
  const { data } = await supabaseServer()
    .from("scheduled_posts")
    .select("id, platform, payload, scheduled_at, status")
    .eq("status", "pending_approval")
    .order("scheduled_at");
  const rows = (data ?? []) as Pick<ScheduledPostRow, "id" | "platform" | "payload" | "scheduled_at" | "status">[];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">承認待ち</h1>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">承認待ちの投稿はありません。</p>}
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border p-4 space-y-3">
          <p className="text-sm">{r.payload.text ?? r.payload.caption ?? "(no text)"}</p>
          <p className="text-xs text-muted-foreground">
            {r.platform} ・ 予定 {new Date(r.scheduled_at).toLocaleString("ja-JP")}
          </p>
          <div className="flex gap-2">
            <form action={async () => { "use server"; await approvePost(r.id); }}>
              <button className="h-9 px-4 rounded-md bg-[#2563EB] text-white text-sm">承認</button>
            </form>
            <form action={async (fd: FormData) => { "use server"; await rejectPost(r.id, String(fd.get("note") ?? "")); }}
                  className="flex gap-2">
              <input name="note" placeholder="却下理由（任意）" className="h-9 rounded-md border px-2 text-sm" />
              <button className="h-9 px-4 rounded-md border text-sm">却下</button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
