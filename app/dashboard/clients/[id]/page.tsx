import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/dashboard/page-header";
import { PlanBadge, StatusBadge } from "@/components/dashboard/plan-badge";
import type {
  ClientRow,
  InstagramAccountRow,
  PersonaConfig,
  PostHistoryRow,
  ScheduledPostRow,
  XAccountRow,
} from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

async function updatePersona(clientId: string, formData: FormData) {
  "use server";
  const persona: PersonaConfig = {
    voice: String(formData.get("voice") ?? ""),
    character: String(formData.get("character") ?? ""),
    forbidden_words: String(formData.get("forbidden_words") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    preferred_post_hours: String(formData.get("preferred_post_hours") ?? "")
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < 24),
    notes: String(formData.get("notes") ?? ""),
  };
  await supabaseAdmin().from("clients").update({ persona }).eq("id", clientId);
}

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data: clientRow } = await db.from("clients").select("*").eq("id", params.id).maybeSingle();
  if (!clientRow) notFound();
  const client = clientRow as ClientRow;

  const [{ data: x }, { data: ig }, { data: scheduled }, { data: history }] = await Promise.all([
    db.from("x_accounts").select("*").eq("client_id", client.id).maybeSingle(),
    db.from("instagram_accounts").select("*").eq("client_id", client.id).maybeSingle(),
    db.from("scheduled_posts").select("*").eq("client_id", client.id).order("scheduled_at").limit(20),
    db.from("post_history").select("*").eq("client_id", client.id).order("posted_at", { ascending: false }).limit(20),
  ]);

  const xAccount = x as XAccountRow | null;
  const igAccount = ig as InstagramAccountRow | null;
  const scheduledList = (scheduled ?? []) as ScheduledPostRow[];
  const historyList = (history ?? []) as PostHistoryRow[];

  const updatePersonaBound = updatePersona.bind(null, client.id);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard/clients" className="hover:text-foreground">クライアント</Link>
        <span>/</span>
        <span className="text-foreground">{client.name}</span>
      </div>

      <PageHeader
        title={client.name}
        description={client.email ?? "メール未登録"}
        actions={<PlanBadge plan={client.plan} />}
      />

      <Tabs defaultValue="connect">
        <TabsList>
          <TabsTrigger value="connect">連携</TabsTrigger>
          <TabsTrigger value="persona">ペルソナ</TabsTrigger>
          <TabsTrigger value="schedule">予約</TabsTrigger>
          <TabsTrigger value="history">履歴</TabsTrigger>
        </TabsList>

        <TabsContent value="connect">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ConnectCard
              title="X (Twitter)"
              connected={!!xAccount}
              info={xAccount ? `@${xAccount.handle}` : undefined}
              authUrl={`/api/x/auth?clientId=${client.id}`}
            />
            <ConnectCard
              title="Instagram"
              connected={!!igAccount}
              info={igAccount ? `@${igAccount.username}` : undefined}
              authUrl={`/api/instagram/auth?clientId=${client.id}`}
            />
          </div>
        </TabsContent>

        <TabsContent value="persona">
          <Card>
            <CardHeader>
              <CardTitle>ペルソナ設定</CardTitle>
              <CardDescription>AI生成時の口調・キャラクター・禁止事項</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={updatePersonaBound} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field name="voice" label="口調 (voice)" defaultValue={client.persona.voice} placeholder="例: 丁寧で温かみのある" />
                <Field name="character" label="キャラクター" defaultValue={client.persona.character} placeholder="例: 親しみやすい街のカフェ店主" />
                <Field
                  name="forbidden_words"
                  label="禁止ワード（カンマ区切り）"
                  defaultValue={client.persona.forbidden_words.join(", ")}
                  placeholder="例: 激安, 業界No.1"
                />
                <Field
                  name="preferred_post_hours"
                  label="投稿時間帯 0-23（カンマ区切り）"
                  defaultValue={client.persona.preferred_post_hours.join(", ")}
                  placeholder="例: 9, 12, 19"
                />
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">メモ</label>
                  <Textarea
                    name="notes"
                    defaultValue={client.persona.notes ?? ""}
                    rows={3}
                    placeholder="AIに伝えたい補足情報"
                  />
                </div>
                <div className="md:col-span-2">
                  <Button type="submit">保存</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule">
          <Card>
            <CardHeader>
              <CardTitle>予約投稿 ({scheduledList.length})</CardTitle>
              <CardDescription>scheduled_at の昇順</CardDescription>
            </CardHeader>
            <CardContent>
              {scheduledList.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">予約はありません。</p>
              ) : (
                <ul className="divide-y">
                  {scheduledList.map((s) => (
                    <li key={s.id} className="flex items-center gap-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground w-32 shrink-0">
                        {new Date(s.scheduled_at).toLocaleString("ja-JP")}
                      </span>
                      <span className="text-xs uppercase font-semibold w-20 shrink-0">{s.platform}</span>
                      <span className="text-sm flex-1 truncate">{s.payload.text ?? s.payload.caption ?? s.payload.action}</span>
                      <StatusBadge status={s.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>最近の投稿 ({historyList.length})</CardTitle>
              <CardDescription>post_history の posted_at 降順</CardDescription>
            </CardHeader>
            <CardContent>
              {historyList.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">投稿履歴はまだありません。</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs uppercase text-muted-foreground">
                        <th className="text-left font-medium py-2 pr-4 whitespace-nowrap">日時</th>
                        <th className="text-left font-medium py-2 pr-4">媒体</th>
                        <th className="text-left font-medium py-2 pr-4">本文</th>
                        <th className="text-right font-medium py-2 pr-4">imp</th>
                        <th className="text-right font-medium py-2 pr-4">いいね</th>
                        <th className="text-right font-medium py-2">返信</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {historyList.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2 pr-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(p.posted_at).toLocaleString("ja-JP")}
                          </td>
                          <td className="py-2 pr-4 text-xs uppercase">{p.platform}</td>
                          <td className="py-2 pr-4 text-muted-foreground truncate max-w-md">{p.text}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{p.impressions.toLocaleString()}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{p.likes.toLocaleString()}</td>
                          <td className="py-2 text-right tabular-nums">{p.replies.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConnectCard({
  title,
  connected,
  info,
  authUrl,
}: {
  title: string;
  connected: boolean;
  info?: string;
  authUrl: string;
}) {
  return (
    <Card>
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold">{title}</p>
          <span
            className={
              connected
                ? "text-xs font-medium text-emerald-600"
                : "text-xs font-medium text-muted-foreground"
            }
          >
            {connected ? "接続済み" : "未接続"}
          </span>
        </div>
        {connected ? (
          <p className="text-sm text-muted-foreground">{info}</p>
        ) : (
          <Link href={authUrl}>
            <Button variant="default" size="sm">アカウントを連携する</Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  name,
  label,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      <Input name={name} defaultValue={defaultValue} placeholder={placeholder} />
    </div>
  );
}
