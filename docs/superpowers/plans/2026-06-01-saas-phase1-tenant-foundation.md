# AutoSpark Phase 1: Tenant Foundation + Customer Approval — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first sellable slice of the self-serve hybrid SaaS — customers log in (Supabase Auth magic link, invite-only), view their own analytics, and approve/reject operator-drafted posts; only approved posts auto-publish.

**Architecture:** Dual-auth coexistence — the existing operator console (`/dashboard`, NextAuth + Google + service-role) is preserved untouched. A new customer console (`/app`) runs on Supabase Auth with RLS-enforced SELECT-only access scoped to the logged-in customer's `client_id`. Approval writes go through validated service-role Server Actions (customer anon JWT has zero write policies). A new `approved` scheduled-post state gates the existing cron.

**Tech Stack:** Next.js 14 App Router (TS strict), Supabase (Postgres + Auth + RLS), `@supabase/ssr`, vitest (new, for pure-logic unit tests).

**Spec:** `docs/superpowers/specs/2026-06-01-saas-phase1-tenant-foundation-design.md`

---

## Pre-flight

- [ ] **Step 0a: Create a feature branch** (we are on `main`)

```bash
git checkout -b feat/saas-phase1-tenant-foundation
```

- [ ] **Step 0b: Confirm baseline is green**

Run: `npm run typecheck`
Expected: no errors (exits 0).

---

## File Structure (decomposition)

**Create:**
- `supabase/migrations/0002_scheduled_status_values.sql` — enum values only
- `supabase/migrations/0003_tenant_phase1.sql` — columns, email unique, helper fn, SELECT policies
- `vitest.config.ts` — test runner config
- `lib/approval/transitions.ts` — pure approval-transition validator (unit tested)
- `lib/approval/transitions.test.ts` — its tests
- `lib/supabase/client-session.ts` — cookie-writable SSR Supabase client for `/app`
- `lib/api/client-guard.ts` — `requireClient()` for `/app`
- `middleware.ts` — `/app`-scoped Supabase session refresh
**Final `/app` route tree — route group `(console)` is gated, its siblings are NOT:**
```
app/app/
  login/page.tsx          login/actions.ts        # un-gated: request magic link
  auth/callback/route.ts                           # un-gated: session exchange + link
  not-ready/page.tsx                               # un-gated: unlinked logins land here
  (console)/
    layout.tsx                                     # gated shell (requireClient)
    page.tsx                                       # analytics dashboard (read-only)
    approvals/page.tsx     approvals/actions.ts    # approval queue + server actions
```
A route group `(console)` adds **no URL segment** (URLs stay `/app`, `/app/approvals`), but its
`layout.tsx` wraps only the pages inside the group — so `login`/`auth`/`not-ready` never run
`requireClient` (prevents a redirect loop). There is intentionally **no** `app/app/layout.tsx`;
the root layout applies to the un-gated siblings.

**Modify:**
- `lib/supabase/types.ts` — new statuses, `auth_user_id`, `invited_at`, approval columns
- `app/api/cron/auto-post/route.ts` — filter `approved`; reset transient failures to `approved`
- `app/dashboard/compose/page.tsx` — insert as `draft` (not `pending`)
- `app/dashboard/clients/[id]/page.tsx` — "顧客を招待" + "顧客に提出" actions
- `package.json` — add `test` script + vitest devDeps
- `.env.example` — note Supabase Auth usage (no new secret required; anon/url already present)

---

## Task 1: Migration 0002 — enum values

**Files:**
- Create: `supabase/migrations/0002_scheduled_status_values.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add approval-workflow states to scheduled_status.
-- MUST be a standalone migration: new enum values cannot be referenced in the
-- same transaction that adds them (see 0003 for the references).
alter type scheduled_status add value if not exists 'draft';
alter type scheduled_status add value if not exists 'pending_approval';
alter type scheduled_status add value if not exists 'approved';
alter type scheduled_status add value if not exists 'rejected';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0002_scheduled_status_values.sql
git commit -m "feat(db): add approval-workflow enum values to scheduled_status"
```

> Apply later (Task 16) — `apply_migration` runs this file in its own transaction before 0003.

---

## Task 2: Migration 0003 — tenant columns, email unique, helper fn, RLS SELECT policies

**Files:**
- Create: `supabase/migrations/0003_tenant_phase1.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Tenant foundation: link auth users to clients, invite gate, approval columns,
-- and customer-facing SELECT-only RLS. References the enum values added in 0002.

-- 1. clients: auth linkage + invite flag
alter table clients
  add column auth_user_id uuid unique references auth.users(id) on delete set null,
  add column invited_at timestamptz;

-- Normalize existing emails to lowercase so identity-linking can use exact `.eq`
-- (no LIKE/ILIKE wildcards on the security-critical email→client lookup).
update clients set email = lower(email) where email is not null and email <> lower(email);
-- email must resolve to a single client
create unique index clients_email_unique on clients (email) where email is not null;

-- 2. scheduled_posts: approval metadata
alter table scheduled_posts
  add column approval_note text,        -- customer comment (incl. rejection reason)
  add column approved_at timestamptz,
  add column approved_by uuid;          -- auth.users(id) of the approving customer

-- 3. helper: client ids owned by the current authenticated user.
--    security definer with a fixed search_path (privilege-escalation hardening).
create or replace function current_client_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select id from public.clients where auth_user_id = (select auth.uid());
$$;
revoke all on function current_client_ids() from public;
grant execute on function current_client_ids() to authenticated;

-- 4. customer SELECT-only policies (anon stays fully denied; no write policies).
create policy client_select_self on clients
  for select to authenticated
  using (id in (select current_client_ids()));

create policy client_select_post_history on post_history
  for select to authenticated
  using (client_id in (select current_client_ids()));

create policy client_select_scheduled on scheduled_posts
  for select to authenticated
  using (client_id in (select current_client_ids()));

-- NOTE: x_accounts, instagram_accounts, error_logs, api_quota_usage intentionally
-- get NO customer policies — they remain operator-only (service-role) and invisible
-- to the customer anon client.
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0003_tenant_phase1.sql
git commit -m "feat(db): tenant linkage, approval columns, customer SELECT RLS"
```

---

## Task 3: Update TypeScript types

**Files:**
- Modify: `lib/supabase/types.ts`

- [ ] **Step 1: Extend `ScheduledStatus`**

Replace line 9:
```ts
export type ScheduledStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";
```

- [ ] **Step 2: Add columns to `ClientRow`** (after `suspend_at`):
```ts
  auth_user_id: string | null;
  invited_at: string | null;
```

- [ ] **Step 3: Add columns to `ScheduledPostRow`** (after `last_error`):
```ts
  approval_note: string | null;
  approved_at: string | null;
  approved_by: string | null;
```

- [ ] **Step 4: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.
```bash
git add lib/supabase/types.ts
git commit -m "feat(types): add approval statuses and tenant columns"
```

---

## Task 4: Add vitest + approval transition validator (TDD)

This is the security-critical pure logic: which status transitions a customer may trigger.

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `lib/approval/transitions.ts`
- Test: `lib/approval/transitions.test.ts`

- [ ] **Step 1: Add vitest**

Add to `package.json` `devDependencies`: `"vitest": "^2.1.0"`.
Add to `scripts`: `"test": "vitest run"`.
Run: `npm install`

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
});
```

- [ ] **Step 3: Write the failing test** — `lib/approval/transitions.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { assertCustomerTransition } from "./transitions";

describe("assertCustomerTransition", () => {
  it("allows pending_approval -> approved", () => {
    expect(() => assertCustomerTransition("pending_approval", "approved")).not.toThrow();
  });
  it("allows pending_approval -> rejected", () => {
    expect(() => assertCustomerTransition("pending_approval", "rejected")).not.toThrow();
  });
  it("rejects approving a post that is not pending_approval", () => {
    expect(() => assertCustomerTransition("draft", "approved")).toThrow();
    expect(() => assertCustomerTransition("approved", "approved")).toThrow();
    expect(() => assertCustomerTransition("succeeded", "rejected")).toThrow();
  });
  it("rejects transitions to operator-only states", () => {
    // @ts-expect-error customers may never target these
    expect(() => assertCustomerTransition("pending_approval", "succeeded")).toThrow();
  });
});
```

- [ ] **Step 4: Run test, verify it fails**

Run: `npm test`
Expected: FAIL (`assertCustomerTransition` not defined).

- [ ] **Step 5: Implement `lib/approval/transitions.ts`**

```ts
import type { ScheduledStatus } from "@/lib/supabase/types";

export type CustomerTarget = "approved" | "rejected";

/**
 * Throws unless a customer is allowed to move `from` -> `to`.
 * Customers may only act on posts awaiting their approval.
 */
export function assertCustomerTransition(
  from: ScheduledStatus,
  to: CustomerTarget,
): void {
  if (from !== "pending_approval") {
    throw new Error(`cannot ${to} a post in status "${from}"`);
  }
  if (to !== "approved" && to !== "rejected") {
    throw new Error(`invalid customer target status "${to}"`);
  }
}
```

- [ ] **Step 6: Run test, verify pass; typecheck**

Run: `npm test` → PASS. `npm run typecheck` → PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/approval/
git commit -m "feat(approval): add vitest + customer transition validator"
```

---

## Task 5: Cookie-writable Supabase client for `/app`

**Files:**
- Create: `lib/supabase/client-session.ts`

- [ ] **Step 1: Implement** (RLS-honoring anon client that can read AND write its session cookies — unlike `server.ts` whose `setAll` is a no-op)

```ts
import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Anon Supabase client for the customer console (`/app`). Honors RLS and the
 * Supabase Auth session. Use ONLY in route handlers / server actions where
 * cookies are mutable. Never bypasses RLS — do not use service-role here.
 */
export function supabaseAppSession() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase anon credentials are not configured.");

  const store = cookies();
  return createServerClient(url, key, {
    auth: { flowType: "pkce" }, // magic link carries ?code=; verifier stored in cookie
    cookies: {
      getAll: () => store.getAll().map((c) => ({ name: c.name, value: c.value })),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) {
          store.set(name, value, options);
        }
      },
    },
  });
}
```

> Used ONLY where cookies are mutable: the login Server Action (`signInWithOtp` stores the
> PKCE verifier cookie) and the auth callback Route Handler (`exchangeCodeForSession` reads it).
> Never use this in a Server Component render path — use `supabaseServer()` there.

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck` → PASS.
```bash
git add lib/supabase/client-session.ts
git commit -m "feat(supabase): cookie-writable anon client for customer console"
```

---

## Task 6: `/app` middleware (session refresh, scoped)

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Implement** (only matches `/app/**`; `/dashboard` and `/api` untouched)

```ts
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });
  // Refresh the session so server components see a valid token.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/app/:path*"],
};
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck` → PASS.
```bash
git add middleware.ts
git commit -m "feat(app): scoped Supabase session middleware for /app"
```

---

## Task 7: `requireClient()` guard

**Files:**
- Create: `lib/api/client-guard.ts`

- [ ] **Step 1: Implement**

```ts
import "server-only";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ClientRow } from "@/lib/supabase/types";

/**
 * For `/app` server components. Requires a Supabase session AND a linked client.
 * - not signed in            -> redirect /app/login
 * - signed in, not linked    -> redirect /app/not-ready
 *
 * Uses the read-only `supabaseServer()` (no-op cookie setAll): Server Components
 * cannot mutate cookies in Next 14. Session refresh is handled by middleware.ts.
 */
export async function requireClient(): Promise<{ userId: string; client: ClientRow }> {
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();
  if (!user) redirect("/app/login");

  // RLS-safe: client resolved by service-role keyed on the verified auth uid.
  const { data } = await supabaseAdmin()
    .from("clients")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!data) redirect("/app/not-ready");
  return { userId: user.id, client: data as ClientRow };
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck` → PASS.
```bash
git add lib/api/client-guard.ts
git commit -m "feat(app): requireClient guard for customer console"
```

---

## Task 8: Customer login (invite-gated magic link)

**Files:**
- Create: `app/app/login/actions.ts`
- Create: `app/app/login/page.tsx`

- [ ] **Step 1: Implement `actions.ts`** (invite gate; `shouldCreateUser: false`)

```ts
"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseAppSession } from "@/lib/supabase/client-session";

export async function sendMagicLink(_prev: unknown, formData: FormData): Promise<{ message: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { message: "メールアドレスを入力してください。" };

  // Invite gate: only invited, existing clients may receive a link.
  // Exact `.eq` against normalized lowercase email (0003) — never ILIKE.
  const { data: client } = await supabaseAdmin()
    .from("clients")
    .select("id, invited_at")
    .eq("email", email)
    .maybeSingle();

  // Always return the same message (do not leak whether an email is registered).
  const generic = { message: "ログインリンクを送信しました。メールをご確認ください。" };
  if (!client || !client.invited_at) return generic;

  // APP_BASE_URL is the public origin of the deployment (e.g. https://autospark.app).
  // Must be set in prod; falling back to localhost would email broken links to customers.
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const redirectTo = `${baseUrl}/app/auth/callback`;
  await supabaseAppSession().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  });
  return generic;
}
```

- [ ] **Step 2: Implement `page.tsx`** (client component using the action)

```tsx
"use client";

import { useFormState } from "react-dom";
import { sendMagicLink } from "./actions";

export default function ClientLoginPage() {
  const [state, action] = useFormState(sendMagicLink, { message: "" });
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <form action={action} className="w-full max-w-sm space-y-4 border rounded-xl p-6">
        <h1 className="text-lg font-semibold">AutoSpark ログイン</h1>
        <p className="text-sm text-muted-foreground">登録済みのメールにログインリンクを送ります。</p>
        <input
          type="email" name="email" required placeholder="you@example.com"
          className="h-10 w-full rounded-md border px-3 text-sm"
        />
        <button className="h-10 w-full rounded-md bg-[#2563EB] text-white text-sm">
          ログインリンクを送信
        </button>
        {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck` → PASS.
```bash
git add app/app/login/
git commit -m "feat(app): invite-gated magic-link login"
```

---

## Task 9: Auth callback (session exchange + first-login linking)

**Files:**
- Create: `app/app/auth/callback/route.ts`

- [ ] **Step 1: Implement** (exchange code → session; link `auth_user_id` only when NULL)

```ts
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseAppSession } from "@/lib/supabase/client-session";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  const supabase = supabaseAppSession();

  // Supabase magic links arrive either as a PKCE `?code=` (default for
  // @supabase/ssr) or as `?token_hash=&type=`. Handle both.
  let userEmail: string | null = null;
  let userId: string | null = null;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user?.email) return NextResponse.redirect(`${origin}/app/login`);
    userEmail = data.user.email;
    userId = data.user.id;
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error || !data.user?.email) return NextResponse.redirect(`${origin}/app/login`);
    userEmail = data.user.email;
    userId = data.user.id;
  } else {
    return NextResponse.redirect(`${origin}/app/login`);
  }

  const email = userEmail.toLowerCase();
  const admin = supabaseAdmin();
  // Link the verified auth user to the matching, not-yet-linked client.
  // Exact `.eq` (emails are normalized lowercase in 0003) — never LIKE/ILIKE,
  // which would treat `_`/`%` in an attacker email as wildcards.
  const { data: client } = await admin
    .from("clients")
    .select("id, auth_user_id")
    .eq("email", email)
    .maybeSingle();

  if (client && client.auth_user_id === null) {
    await admin.from("clients").update({ auth_user_id: userId }).eq("id", client.id);
  }
  return NextResponse.redirect(`${origin}/app`);
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck` → PASS.
```bash
git add app/app/auth/callback/
git commit -m "feat(app): auth callback with first-login client linking"
```

---

## Task 10: Customer console shell + "準備中" + dashboard

**Files:**
- Create: `app/app/(console)/layout.tsx`  (gated shell — inside the route group)
- Create: `app/app/not-ready/page.tsx`    (un-gated sibling)
- Create: `app/app/(console)/page.tsx`    (gated dashboard)

> Route group `(console)` is the gating boundary: only files under it get `requireClient`
> (via this layout). `login`/`auth`/`not-ready` stay directly under `app/app/` and are NOT
> wrapped by it — that is what prevents the login-redirect loop. Do NOT create `app/app/layout.tsx`.

- [ ] **Step 1: `app/app/(console)/layout.tsx`** (gates everything inside the group)

```tsx
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
```

- [ ] **Step 2: `app/app/not-ready/page.tsx`** (un-gated)

```tsx
export default function NotReadyPage() {
  return (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div className="space-y-2">
        <h1 className="text-lg font-semibold">準備中です</h1>
        <p className="text-sm text-muted-foreground">
          アカウントの初期設定が完了するとご利用いただけます。担当者にお問い合わせください。
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `app/app/(console)/page.tsx`** (read-only analytics via RLS anon client)

```tsx
import { requireClient } from "@/lib/api/client-guard";
import { supabaseServer } from "@/lib/supabase/server";
import type { PostHistoryRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function AppDashboard() {
  await requireClient(); // ensures linked client / redirects otherwise
  // RLS restricts rows to the caller's client automatically (read-only client).
  const { data } = await supabaseServer()
    .from("post_history")
    .select("id, platform, action, text, impressions, likes, posted_at")
    .order("posted_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as Pick<PostHistoryRow,
    "id" | "platform" | "action" | "text" | "impressions" | "likes" | "posted_at">[];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">投稿実績</h1>
      <div className="rounded-xl border divide-y">
        {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">まだ投稿はありません。</p>}
        {rows.map((r) => (
          <div key={r.id} className="p-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm truncate">{r.text ?? r.action}</p>
              <p className="text-xs text-muted-foreground">
                {r.platform} ・ {new Date(r.posted_at).toLocaleString("ja-JP")}
              </p>
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap">
              👁 {r.impressions} ・ ♥ {r.likes}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

> Note: explicit column select (not `*`) keeps internal fields out of the customer payload (spec §4.3 read-exposure note).

- [ ] **Step 4: Typecheck + commit**

Run: `npm run typecheck` → PASS.
```bash
git add app/app/
git commit -m "feat(app): customer console shell, not-ready, analytics dashboard"
```

---

## Task 11: Approval server actions

**Files:**
- Create: `app/app/(console)/approvals/actions.ts` (path per Task 10 route-group note)

- [ ] **Step 1: Implement** (service-role write, validated by `assertCustomerTransition` + ownership)

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/api/client-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertCustomerTransition } from "@/lib/approval/transitions";
import { postToSlack } from "@/lib/notify/slack";
import type { ScheduledPostRow } from "@/lib/supabase/types";

async function loadOwnedPost(id: string, clientId: string): Promise<ScheduledPostRow> {
  const { data } = await supabaseAdmin().from("scheduled_posts").select("*").eq("id", id).maybeSingle();
  const row = data as ScheduledPostRow | null;
  if (!row || row.client_id !== clientId) throw new Error("post not found");
  return row;
}

export async function approvePost(id: string): Promise<void> {
  const { userId, client } = await requireClient();
  const row = await loadOwnedPost(id, client.id);
  assertCustomerTransition(row.status, "approved");
  await supabaseAdmin().from("scheduled_posts").update({
    status: "approved", approved_at: new Date().toISOString(), approved_by: userId,
  }).eq("id", id);
  await postToSlack({ channel: "default", text: `:white_check_mark: ${client.name} approved post ${id}` });
  revalidatePath("/app/approvals");
}

export async function rejectPost(id: string, note: string): Promise<void> {
  const { client } = await requireClient();
  const row = await loadOwnedPost(id, client.id);
  assertCustomerTransition(row.status, "rejected");
  await supabaseAdmin().from("scheduled_posts").update({
    status: "rejected", approval_note: note.slice(0, 1000),
  }).eq("id", id);
  await postToSlack({ channel: "default", text: `:x: ${client.name} rejected post ${id}: ${note}` });
  revalidatePath("/app/approvals");
}
```

> Verify `postToSlack`'s channel argument matches its real signature in `lib/notify/slack.ts` during implementation; adjust if needed.

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck` → PASS.
```bash
git add "app/app/(console)/approvals/actions.ts"
git commit -m "feat(app): approve/reject server actions with validated transitions"
```

---

## Task 12: Approval queue page

**Files:**
- Create: `app/app/(console)/approvals/page.tsx`

- [ ] **Step 1: Implement** (lists own `pending_approval` posts via RLS; calls actions)

```tsx
import { requireClient } from "@/lib/api/client-guard";
import { supabaseServer } from "@/lib/supabase/server";
import { approvePost, rejectPost } from "./actions";
import type { ScheduledPostRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  await requireClient();
  const { data } = await supabaseServer()
    .from("scheduled_posts")
    .select("id, platform, payload, scheduled_at, status")
    .eq("status", "pending_approval")
    .order("scheduled_at");
  const rows = (data ?? []) as Pick<ScheduledPostRow, "id" | "platform" | "payload" | "scheduled_at" | "status">[];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">承認待ち</h1>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">承認待ちの投稿はありません。</p>}
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border p-4 space-y-3">
          <p className="text-sm">{r.payload.text ?? r.payload.caption ?? "(no text)"}</p>
          <p className="text-xs text-muted-foreground">
            {r.platform} ・ 予定 {new Date(r.scheduled_at).toLocaleString("ja-JP")}
          </p>
          <div className="flex gap-2">
            <form action={async () => { "use server"; await approvePost(r.id); }}>
              <button className="h-9 px-4 rounded-md bg-[#2563EB] text-white text-sm">承認</button>
            </form>
            <form action={async (fd: FormData) => { "use server"; await rejectPost(r.id, String(fd.get("note") ?? "")); }}
                  className="flex gap-2">
              <input name="note" placeholder="却下理由（任意）" className="h-9 rounded-md border px-2 text-sm" />
              <button className="h-9 px-4 rounded-md border text-sm">却下</button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck` → PASS.
```bash
git add "app/app/(console)/approvals/page.tsx"
git commit -m "feat(app): approval queue page"
```

---

## Task 13: Gate the cron on `approved`

**Files:**
- Modify: `app/api/cron/auto-post/route.ts`

- [ ] **Step 1: Change the pickup filter** (line ~63)

Replace `.in("status", ["pending"])` with `.in("status", ["approved"])`.

> Cutover note: any legacy rows still in `pending` (created before this change) will no
> longer be picked up. For a clean Phase-1 cutover, manually inspect/clear pre-existing
> `pending` rows in the DB before going live, or one-time migrate them to `approved`/`draft`.

- [ ] **Step 2: Change the transient-failure reset** (line ~106)

Replace `status: finalFailure ? "failed" : "pending",` with
`status: finalFailure ? "failed" : "approved",`
(already-approved posts retry without re-approval).

> Pre-existing caveat (not introduced here, do not fix in Phase 1): a post flipped to
> `running` then lost to a mid-publish crash stays `running` forever (never re-picked).
> Leave a `// TODO(phase-2): reclaim stale 'running' rows` comment near the pickup query.

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck` → PASS.
```bash
git add app/api/cron/auto-post/route.ts
git commit -m "feat(cron): publish only approved posts; retry resets to approved"
```

---

## Task 14: Operator-side draft + submit + invite

**Files:**
- Modify: `app/dashboard/compose/page.tsx`
- Modify: `app/dashboard/clients/[id]/page.tsx`

- [ ] **Step 1: compose inserts `draft`** — change `status: "pending"` to `status: "draft"` in `schedulePost`.

- [ ] **Step 2: Add operator actions to `clients/[id]`** — read the file first, then add two server actions consistent with its existing patterns. **Add `import { revalidatePath } from "next/cache";`** (the file currently imports `supabaseAdmin` but NOT `revalidatePath`). The existing actions bind `clientId` as the first arg — wire the new buttons the same way, e.g. `<form action={submitDraftsForApproval.bind(null, client.id)}>`. Also normalize email to lowercase if the page creates/edits client emails (0003 relies on lowercase).

```ts
// "顧客に提出": move this client's drafts to pending_approval
async function submitDraftsForApproval(clientId: string) {
  "use server";
  await supabaseAdmin().from("scheduled_posts")
    .update({ status: "pending_approval" })
    .eq("client_id", clientId).eq("status", "draft");
  // optional: notify customer via Resend/Slack
  revalidatePath(`/dashboard/clients/${clientId}`);
}

// "顧客を招待": mark invited so the customer can request a magic link
async function inviteClient(clientId: string) {
  "use server";
  await supabaseAdmin().from("clients")
    .update({ invited_at: new Date().toISOString() }).eq("id", clientId);
  revalidatePath(`/dashboard/clients/${clientId}`);
}
```
Wire two buttons (`提出` / `招待`) into the existing page UI. Match existing imports (`revalidatePath`, `supabaseAdmin`).

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck` → PASS.
```bash
git add app/dashboard/compose/page.tsx "app/dashboard/clients/[id]/page.tsx"
git commit -m "feat(dashboard): draft posts, submit-for-approval, invite client"
```

---

## Task 15: `.env.example` note

**Files:**
- Modify: `.env.example`

- [ ] **Step 1:** Add a public base-URL var and the Supabase Auth note:
```
# Public origin of the deployment — used to build the customer magic-link redirect.
# MUST be the real https URL in production (localhost fallback would email broken links).
APP_BASE_URL=http://localhost:3000

# Customer console (/app) uses Supabase Auth (magic link). No new secret needed —
# it reuses SUPABASE_URL + SUPABASE_ANON_KEY. In the Supabase dashboard: enable Email
# auth, and add `${APP_BASE_URL}/app/auth/callback` to the allowed redirect URLs.
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): note Supabase Auth setup for customer console"
```

---

## Task 16: Apply migrations + tenant-isolation verification (CRITICAL)

This is the security gate. Requires a Supabase project (or local stack).

- [ ] **Step 1: Apply migrations in order** — 0002 first (own transaction), then 0003.
  Via Supabase MCP `apply_migration` (one call per file) or `supabase db push`.

- [ ] **Step 2: Seed two test clients** (A and B) with distinct emails, set `invited_at`, and `post_history` + `scheduled_posts` rows (one `pending_approval`) for each.

- [ ] **Step 3: Create two Supabase Auth users** (A@, B@), link each to its client (log in once via magic link, or set `auth_user_id` manually for the test).

- [ ] **Step 4: Isolation assertions** — using each user's anon JWT (Supabase JS or REST):
  - A SELECT `post_history` / `scheduled_posts` / `clients` → only A's rows; B's rows absent.
  - A SELECT `x_accounts` / `instagram_accounts` / `error_logs` / `api_quota_usage` → 0 rows.
  - A attempts UPDATE / INSERT / DELETE on every table (incl. own `scheduled_posts`) → denied (no write policy).
  - Expected: all of the above hold. Record results.

- [ ] **Step 5: Approval flow assertions** (via the app, logged in as A):
  - Approve A's `pending_approval` post → status becomes `approved`.
  - Cron (`curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/auto-post`) picks it up.
  - Call `approvePost` with B's post id (e.g. crafted form) → throws "post not found" (ownership).
  - Call `approvePost` on a `draft` post → throws (transition guard).

- [ ] **Step 6: Regression** — operator `/dashboard`, `/generate`, and cron behave as before; operator login still works.

- [ ] **Step 7: Record verification results** in the PR description / a short note. Do not claim done until Steps 4–6 pass with observed output.

---

## Definition of Done

- [ ] `npm run typecheck` clean, `npm test` green.
- [ ] Migrations applied; tenant-isolation assertions (Task 16 Step 4) all pass.
- [ ] Approval flow end-to-end verified (Task 16 Step 5).
- [ ] No regression to operator console / legacy `/generate` / cron.
- [ ] Branch `feat/saas-phase1-tenant-foundation` ready for PR.
