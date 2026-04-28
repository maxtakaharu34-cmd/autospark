import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <div className="space-y-6 max-w-2xl">
      <header>
        <h1 className="text-2xl font-bold">投稿作成</h1>
        <p className="text-sm text-muted-foreground">予約投稿としてキューに投入します。</p>
      </header>

      <form action={schedulePost} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">クライアント</label>
          <select name="clientId" required className="w-full border rounded-md h-10 px-3 text-sm bg-background">
            <option value="">選択してください</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">プラットフォーム</label>
          <select name="platform" required className="w-full border rounded-md h-10 px-3 text-sm bg-background">
            <option value="x">X</option>
            <option value="instagram">Instagram</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">本文</label>
          <textarea
            name="text"
            required
            rows={5}
            className="w-full border rounded-md p-3 text-sm bg-background"
            placeholder="投稿本文..."
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">投稿日時</label>
          <Input name="scheduledAt" type="datetime-local" required />
        </div>
        <Button type="submit">予約</Button>
      </form>
    </div>
  );
}
