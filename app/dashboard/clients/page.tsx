import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { PlanBadge } from "@/components/dashboard/plan-badge";
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
    <div className="space-y-8">
      <PageHeader
        title="クライアント"
        description={`${clients.length} 件の運用先を管理`}
      />

      <Card>
        <CardHeader>
          <CardTitle>新規追加</CardTitle>
          <CardDescription>名前と連絡先メールを入力してください</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createClient} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">名前 *</label>
              <Input name="name" required placeholder="例: サンプル株式会社" />
            </div>
            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">連絡先メール</label>
              <Input name="email" type="email" placeholder="任意" />
            </div>
            <div>
              <Button type="submit" className="w-full md:w-auto">追加する</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">まだクライアントが登録されていません。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((c) => (
            <Link key={c.id} href={`/dashboard/clients/${c.id}`}>
              <Card className="hover:border-primary/50 hover:shadow-md transition cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{c.name}</p>
                      {c.email && <p className="text-xs text-muted-foreground truncate mt-0.5">{c.email}</p>}
                    </div>
                    <PlanBadge plan={c.plan} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    登録: {new Date(c.created_at).toLocaleDateString("ja-JP")}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
