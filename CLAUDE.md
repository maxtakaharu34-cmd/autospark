# AutoSpark — Project Instructions for Claude Code

## Project Overview

AutoSpark is a SaaS platform for managing social media accounts (X / Instagram) on behalf of multiple clients. The operator (haruto / SparkTwo) takes custody of client accounts and uses AI to schedule posts, quote-RT viral tweets, auto-reply, and produce analytics reports.

The repository started as a small Next.js 14 app with a single public `/generate` endpoint that creates Japanese X copy via the Claude API. The SaaS layer is being built additively on top of that — the original public flow must keep working.

## Architecture

| Layer | Stack |
|---|---|
| Runtime | Next.js 14 App Router + TypeScript (strict) |
| DB | Supabase (Postgres) — migrations in `supabase/migrations/` |
| Auth | NextAuth.js v5 + Google + email whitelist (`ALLOWED_ADMIN_EMAILS`) |
| AI | Claude (Anthropic Messages API) — `lib/ai/anthropic.ts` |
| X | `twitter-api-v2` — OAuth 1.0a per-client |
| Instagram | Meta Graph API (fetch-based) |
| Payments | Stripe subscriptions + webhook |
| Scheduling | Vercel Cron Jobs (see `vercel.json`) |
| Notifications | Slack incoming webhook + Resend email |
| Encryption | AES-256-GCM for stored OAuth tokens — `lib/crypto.ts` |

## Boundary Rules

1. **Service role key never reaches the client.** `lib/supabase/admin.ts` (service role) is importable only from `app/api/**` and server-only modules. RSC and Server Actions should use `lib/supabase/server.ts` (anon key).
2. **All cron endpoints** (`app/api/cron/**`) must call `requireCronSecret(request)` from `lib/api/cron-guard.ts` before doing anything.
3. **All `/dashboard/**` server code** must verify the NextAuth session and the email whitelist via `lib/api/auth-guard.ts`.
4. **All API responses follow `{ success: boolean, data?: T, error?: string }`** — use helpers in `lib/api/response.ts`.
5. **All API route handlers wrap their body in `withErrorBoundary()`** so errors are logged to `error_logs` and Slack-notified per severity.
6. **Stored OAuth tokens are encrypted** with `encrypt()` from `lib/crypto.ts` before insert and decrypted only at use time.
7. **Zod validates every external input** (request body, query params, webhook payload).

## Coding Conventions

- TypeScript: `strict: true`, `any` is forbidden. Use `unknown` + Zod refinement at boundaries.
- File comments and identifiers in **English**. Commit messages in **English**.
- Prefer Server Components and Server Actions; only use `"use client"` where interactivity demands it.
- Reuse `lib/ai/anthropic.ts` for every Claude call — do not call `fetch("https://api.anthropic.com/...")` directly from route handlers.
- The legacy `/api/generate` endpoint must remain backward-compatible (existing landing page form depends on it).

## Directory Map (high level)

```
app/
  page.tsx                          # marketing landing
  generate/                         # legacy public form (do not break)
  dashboard/                        # operator-only SaaS UI
  api/
    generate/                       # legacy
    auth/                           # NextAuth
    x/ instagram/ stripe/ cron/ monitoring/
lib/
  api/        # response, auth-guard, cron-guard, error boundary
  ai/         # anthropic client + persona prompt builders
  crypto.ts   # AES-256-GCM
  supabase/   # server (anon) + admin (service role)
  x/ instagram/ stripe/ notify/ monitoring/ rate-limit/
supabase/
  migrations/ # SQL schema
```

## Testing / Verification

- Type check: `npm run typecheck`
- Local dev: `npm run dev`
- Cron locally: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/auto-post`
- Stripe webhook locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`

## Communication

- Reply to the user (haruto) in Japanese.
- Code, comments, identifiers, and commit messages remain in English.
- Never commit `.env.local`, real API keys, or OAuth tokens.
