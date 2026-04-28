import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const updatePersonaBound = updatePersona.bind(null, client.id);

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{client.name}</h1>
          <p className="text-sm text-muted-foreground">プラン: {client.plan}</p>
        </div>
        <Link href="/dashboard/clients" className="text-sm text-muted-foreground">← 一覧</Link>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded-md p-4 bg-card">
          <h2 className="font-semibold mb-2">X 連携</h2>
          {xAccount ? (
            <p className="text-sm">@{xAccount.handle} <span className="text-muted-foreground">({xAccount.user_id})</span></p>
          ) : (
            <Link className="underline text-sm" href={`/api/x/auth?clientId=${client.id}`}>X アカウントを連携する →</Link>
          )}
        </div>
        <div className="border rounded-md p-4 bg-card">
          <h2 className="font-semibold mb-2">Instagram 連携</h2>
          {igAccount ? (
            <p className="text-sm">@{igAccount.username}</p>
          ) : (
            <Link className="underline text-sm" href={`/api/instagram/auth?clientId=${client.id}`}>Instagramを連携する →</Link>
          )}
        </div>
      </section>

      <section className="border rounded-md p-4 bg-card">
        <h2 className="font-semibold mb-3">ペルソナ設定</h2>
        <form action={updatePersonaBound} className="space-y-3 text-sm">
          <Field name="voice" label="口調 (voice)" defaultValue={client.persona.voice} />
          <Field name="character" label="キャラクター (character)" defaultValue={client.persona.character} />
          <Field
            name="forbidden_words"
            label="禁止ワード (カンマ区切り)"
            defaultValue={client.persona.forbidden_words.join(", ")}
          />
          <Field
            name="preferred_post_hours"
            label="投稿時間帯 0-23 (カンマ区切り)"
            defaultValue={client.persona.preferred_post_hours.join(", ")}
          />
          <Field name="notes" label="メモ" defaultValue={client.persona.notes ?? ""} />
          <Button type="submit">保存</Button>
        </form>
      </section>

      <section>
        <h2 className="font-semibold mb-2">予約 ({(scheduled ?? []).length})</h2>
        <ul className="divide-y border rounded-md bg-card text-sm">
          {((scheduled ?? []) as ScheduledPostRow[]).map((s) => (
            <li key={s.id} className="px-4 py-2 flex gap-3">
              <span className="font-mono text-muted-foreground">{new Date(s.scheduled_at).toLocaleString("ja-JP")}</span>
              <span>{s.platform}</span>
              <span className="text-muted-foreground">{s.status}</span>
              <span className="truncate">{s.payload.text ?? s.payload.caption ?? s.payload.action}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold mb-2">最近の投稿 ({(history ?? []).length})</h2>
        <ul className="divide-y border rounded-md bg-card text-sm">
          {((history ?? []) as PostHistoryRow[]).map((p) => (
            <li key={p.id} className="px-4 py-2 flex gap-3">
              <span className="font-mono text-muted-foreground">{new Date(p.posted_at).toLocaleString("ja-JP")}</span>
              <span>{p.platform}</span>
              <span className="truncate flex-1">{p.text}</span>
              <span className="text-muted-foreground">{p.impressions} imp</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Field({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <Input name={name} defaultValue={defaultValue} />
    </div>
  );
}
