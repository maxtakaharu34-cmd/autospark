import { ReactNode } from "react";
import Link from "next/link";
import { requireAdminPage } from "@/lib/api/auth-guard";
import { DashboardNav } from "@/components/dashboard/nav";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { email } = await requireAdminPage();
  return (
    <div className="min-h-screen bg-muted/20">
      <div className="flex min-h-screen">
        <aside className="w-64 border-r bg-background flex flex-col">
          <Link href="/dashboard" className="px-6 py-5 border-b">
            <div className="text-xl font-bold leading-tight">
              <span className="text-[#2563EB]">Auto</span>
              <span className="text-[#F97316]">Spark</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Operator Console</p>
          </Link>

          <div className="py-4 flex-1">
            <DashboardNav />
          </div>

          <div className="border-t px-4 py-3 text-xs">
            <div className="font-medium truncate">{email}</div>
            <div className="text-muted-foreground">運営者ログイン中</div>
          </div>
        </aside>

        <main className="flex-1 overflow-x-auto">
          <div className="max-w-6xl mx-auto px-8 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
