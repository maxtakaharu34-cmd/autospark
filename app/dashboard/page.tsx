import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ClientRow, ErrorLogRow, ScheduledPostRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const db = supabaseAdmin();
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

  const [{ data: clients }, { data: scheduled }, { data: errors }] = await Promise.all([
    db.from("clients").select("*").order("created_at", { ascending: false }).limit(20),
    db.from("scheduled_posts")
      .select("*")
      .gte("scheduled_at", startOfDay)
      .lt("scheduled_at", endOfDay.toISOString())
      .order("scheduled_at"),
    db.from("error_logs")
      .select("*")
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">ホーム</h1>
        <p className="text-sm text-muted-foreground">運用全体のサマリーと当日のタイムライン</p>
      </header>

      <section>
        <h2 className="font-semibold mb-2">クライアント ({clients?.length ?? 0})</h2>
        <ClientList clients={(clients ?? []) as ClientRow[]} />
      </section>

      <section>
        <h2 className="font-semibold mb-2">本日の投稿予定 ({scheduled?.length ?? 0})</h2>
        <ScheduleTimeline rows={(scheduled ?? []) as ScheduledPostRow[]} />
      </section>

      <section>
        <h2 className="font-semibold mb-2">未解決のエラー ({errors?.length ?? 0})</h2>
        <ErrorList rows={(errors ?? []) as ErrorLogRow[]} />
      </section>
    </div>
  );
}

function ClientList({ clients }: { clients: ClientRow[] }) {
  if (clients.length === 0) {
    return <p className="text-sm text-muted-foreground">クライアントが未登録です。</p>;
  }
  return (
    <ul className="divide-y border rounded-md bg-card">
      {clients.map((c) => (
        <li key={c.id} className="px-4 py-3 text-sm flex justify-between">
          <span>{c.name}</span>
          <span className="text-muted-foreground">{c.plan}</span>
        </li>
      ))}
    </ul>
  );
}

function ScheduleTimeline({ rows }: { rows: ScheduledPostRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">本日の投稿予定はありません。</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex gap-3">
          <span className="font-mono text-muted-foreground">
            {new Date(r.scheduled_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span>{r.platform.toUpperCase()}</span>
          <span className="text-muted-foreground">{r.status}</span>
        </li>
      ))}
    </ul>
  );
}

function ErrorList({ rows }: { rows: ErrorLogRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">未解決のエラーはありません。</p>;
  }
  return (
    <ul className="text-sm space-y-1">
      {rows.map((e) => (
        <li key={e.id} className="flex gap-3">
          <span className="font-mono text-xs text-muted-foreground">
            {new Date(e.created_at).toLocaleString("ja-JP")}
          </span>
          <span className={severityClass(e.severity)}>{e.severity}</span>
          <span>{e.kind}</span>
          <span className="text-muted-foreground truncate">{e.message}</span>
        </li>
      ))}
    </ul>
  );
}

function severityClass(severity: ErrorLogRow["severity"]) {
  switch (severity) {
    case "critical":
      return "text-red-600 font-semibold";
    case "warning":
      return "text-amber-600";
    default:
      return "text-muted-foreground";
  }
}
