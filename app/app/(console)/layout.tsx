import { ReactNode } from "react";
import Link from "next/link";
import { requireClient } from "@/lib/api/client-guard";

export default async function AppConsoleLayout({ children }: { children: ReactNode }) {
  const { client } = await requireClient();
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/app" className="text-lg font-bold">
            <span className="text-[#2563EB]">Auto</span><span className="text-[#F97316]">Spark</span>
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/app">ダッシュボード</Link>
            <Link href="/app/approvals">承認</Link>
          </nav>
          <span className="text-xs text-muted-foreground">{client.name}</span>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
