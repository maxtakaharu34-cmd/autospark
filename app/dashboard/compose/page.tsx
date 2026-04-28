import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import type { ClientRow, Platform } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

async function schedulePost(formData: FormData) {
  "use server";
  const clientId = String(formData.get("clientId") ?? "");
  const platform = String(formData.get("platform") ?? "x") as Platform;
  const text = String(formData.get("text") ?? "").trim();
  const scheduledAt = String(formData.get("scheduledAt") ?? "").trim();
  if (!clientId || !text || !scheduledAt) return;

  await supabaseAdmin().from("scheduled_posts").insert({
    client_id: clientId,
    platform,
    payload: platform === "x"
      ? { action: "post", text }
      : { action: "ig_feed", caption: text, media_urls: [] },
    scheduled_at: new Date(scheduledAt).toISOString(),
    status: "pending",
  });
  redirect(`/dashboard/clients/${clientId}`);
}

export default async function ComposePage() {
  const { data } = await supabaseAdmin().from("clients").select("*").order("name");
  const clients = (data ?? []) as ClientRow[];

  return (
    <div className="space-y-8 max-w-3xl">
      <PageHeader
        title="投稿作成"
        description="予約投稿をキューに投入します。Cron が時刻に応じて自動投稿します。"
      />

      <Card>
        <CardHeader>
          <CardTitle>新規投稿</CardTitle>
          <CardDescription>クライアント・プラットフォーム・本文・投稿日時を指定してください</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={schedulePost} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">クライアント *</label>
                <select
                  name="clientId"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">選択してください</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">プラットフォーム *</label>
                <select
                  name="platform"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="x">X (Twitter)</option>
                  <option value="instagram">Instagram</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">本文 *</label>
              <Textarea
                name="text"
                required
                rows={6}
                placeholder="投稿本文を入力..."
              />
              <p className="text-xs text-muted-foreground mt-1">X は 140文字、Instagram は 2200文字まで。</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">投稿日時 *</label>
              <Input name="scheduledAt" type="datetime-local" required className="max-w-xs" />
            </div>

            <div className="pt-2 border-t flex gap-2">
              <Button type="submit">予約に追加</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {clients.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">先にクライアントを登録してください。</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
