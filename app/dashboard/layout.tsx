import Link from "next/link";
import { ReactNode } from "react";
import { requireAdminPage } from "@/lib/api/auth-guard";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { email } = await requireAdminPage();
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 border-r bg-muted/30 p-4 flex flex-col gap-1">
        <div className="px-2 py-3 text-lg font-bold">
          <span className="text-[#2563EB]">Auto</span>
          <span className="text-[#F97316]">Spark</span>
        </div>
        <NavLink href="/dashboard" label="ホーム" />
        <NavLink href="/dashboard/compose" label="投稿作成" />
        <NavLink href="/dashboard/clients" label="クライアント" />
        <div className="mt-auto text-xs text-muted-foreground px-2 py-3 border-t">
          {email}
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-md text-sm hover:bg-accent hover:text-accent-foreground"
    >
      {label}
    </Link>
  );
}
