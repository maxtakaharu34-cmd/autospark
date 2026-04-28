import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { PlanBadge, StatusBadge, SeverityBadge } from "@/components/dashboard/plan-badge";
import type { ClientRow, ErrorLogRow, ScheduledPostRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const db = supabaseAdmin();
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

  const [{ data: clients }, { data: scheduled }, { data: errors }, { count: postsToday }] = await Promise.all([
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
    db.from("post_history").select("*", { count: "exact", head: true }).gte("posted_at", startOfDay),
  ]);

  const clientList = (clients ?? []) as ClientRow[];
  const scheduledList = (scheduled ?? []) as ScheduledPostRow[];
  const errorList = (errors ?? []) as ErrorLogRow[];
  const criticalCount = errorList.filter((e) => e.severity === "critical").length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="ホーム"
        description="運用全体のサマリーと当日のタイムライン"
        actions={
          <Link href="/dashboard/compose">
            <Button>新規投稿</Button>
          </Link>
        }
      />

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="クライアント" value={clientList.length} />
        <StatCard label="今日の投稿予定" value={scheduledList.length} />
        <StatCard label="本日の投稿実績" value={postsToday ?? 0} tone="success" />
        <StatCard
          label="未解決エラー"
          value={errorList.length}
          tone={criticalCount > 0 ? "danger" : errorList.length > 0 ? "warning" : "default"}
          delta={criticalCount > 0 ? `critical: ${criticalCount}` : undefined}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>本日のタイムライン</CardTitle>
            <CardDescription>予約済みの投稿（時刻順）</CardDescription>
          </CardHeader>
          <CardContent>
            {scheduledList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">本日の投稿予定はありません。</p>
            ) : (
              <ul className="space-y-2">
                {scheduledList.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-4 px-3 py-2.5 rounded-md hover:bg-muted/50"
                  >
                    <span className="font-mono text-sm text-muted-foreground w-14 shrink-0">
                      {new Date(s.scheduled_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-xs uppercase font-semibold text-muted-foreground w-20 shrink-0">
                      {s.platform}
                    </span>
                    <span className="text-sm flex-1 truncate">
                      {s.payload.text ?? s.payload.caption ?? s.payload.action}
                    </span>
                    <StatusBadge status={s.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>クライアント</CardTitle>
            <CardDescription>{clientList.length} 件</CardDescription>
          </CardHeader>
          <CardContent>
            {clientList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                未登録です。
                <Link href="/dashboard/clients" className="text-primary ml-1 underline">
                  追加 →
                </Link>
              </p>
            ) : (
              <ul className="space-y-1">
                {clientList.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/dashboard/clients/${c.id}`}
                      className="flex items-center justify-between px-2 py-2 rounded-md hover:bg-muted/50 text-sm"
                    >
                      <span className="font-medium truncate">{c.name}</span>
                      <PlanBadge plan={c.plan} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>未解決のエラー</CardTitle>
          <CardDescription>error_logs の resolved=false</CardDescription>
        </CardHeader>
        <CardContent>
          {errorList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">未解決のエラーはありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-muted-foreground">
                    <th className="text-left font-medium py-2 pr-4">時刻</th>
                    <th className="text-left font-medium py-2 pr-4">レベル</th>
                    <th className="text-left font-medium py-2 pr-4">種別</th>
                    <th className="text-left font-medium py-2">メッセージ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {errorList.map((e) => (
                    <tr key={e.id}>
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString("ja-JP")}
                      </td>
                      <td className="py-2 pr-4">
                        <SeverityBadge severity={e.severity} />
                      </td>
                      <td className="py-2 pr-4 text-xs">{e.kind}</td>
                      <td className="py-2 text-muted-foreground truncate max-w-md">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
