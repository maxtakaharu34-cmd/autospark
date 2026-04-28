import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClientRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

async function createClient(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  if (!name) return;
  const { data } = await supabaseAdmin().from("clients").insert({ name, email }).select("id").single();
  if (data?.id) redirect(`/dashboard/clients/${data.id}`);
}

export default async function ClientsListPage() {
  const { data } = await supabaseAdmin().from("clients").select("*").order("created_at", { ascending: false });
  const clients = (data ?? []) as ClientRow[];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">クライアント</h1>
      </header>

      <form action={createClient} className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1">名前</label>
          <Input name="name" required placeholder="例: サンプル株式会社" />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1">連絡先メール</label>
          <Input name="email" type="email" placeholder="任意" />
        </div>
        <Button type="submit">追加</Button>
      </form>

      <ul className="divide-y border rounded-md bg-card">
        {clients.length === 0 && (
          <li className="px-4 py-6 text-sm text-muted-foreground">クライアントがいません。</li>
        )}
        {clients.map((c) => (
          <li key={c.id}>
            <Link href={`/dashboard/clients/${c.id}`} className="block px-4 py-3 hover:bg-accent text-sm flex justify-between">
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground">{c.plan}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
