# AutoSpark — Phase 1: 売れる縦スライス（テナント基盤 + 顧客承認）設計書

- Date: 2026-06-01
- Status: Draft (pending review)
- Author: haruto + Claude Code
- Scope: Phase 1 of the self-serve hybrid SaaS roadmap

---

## 1. 背景とゴール

AutoSpark は現状「運用者専用ツール」である。運用者（haruto / `ALLOWED_ADMIN_EMAILS`）のみが
NextAuth + Google でログインし、`clients` は単なるデータ行として扱われる。RLS は全テーブル
「deny + service-role でのみアクセス」になっている。

ゴールは **セルフサーブ + ハイブリッド運用の SaaS** だが、一気には作らない。本設計書は
その第1フェーズ＝**「最初の有料顧客に売れる最小の縦スライス」** のみを対象とする。

### Phase 1 が成立させる売り方
- 最初の数社は **haruto が手動でオンボード**（X/IG のアカウント連携・初期ペルソナ設定は
  運用者が `/dashboard` で実施）。
- お客さんは **自分のアカウントでログイン**し、`/app` で
  1. 運用者が作った投稿下書きを **承認 / 却下 / コメント**できる
  2. 自分の **投稿実績・分析を閲覧**できる（読み取り専用）
- 承認された投稿だけが既存の cron で実投稿される。
- 課金は最初は **Stripe Checkout リンクを手動発行**で足りる（自動 Portal は Phase 2）。

これにより「ログインして承認・実績が見られる代行 SaaS」として1社目に販売可能になる。
かつテナント分離（セキュリティの核）を最初から堅い方式で導入するため、Phase 2 以降の
積み増し（セルフ連携・セルフ課金）が安全に行える。

---

## 2. スコープ

### In（Phase 1 でやる）
1. **テナント分離基盤**
   - 顧客認証 = **Supabase Auth（メールのマジックリンク）**
   - `clients.auth_user_id` を追加し、ログインユーザー ↔ client を 1:1 紐付け
   - 全テナントテーブルに **顧客向け RLS ポリシー**（自分の `client_id` の行のみ）を追加
   - 既存の運用者 service-role 経路は維持（RLS をバイパスし続ける）
2. **顧客向けアプリ `/app`**（運用者の `/dashboard` とは別系統・別認可）
   - 投稿実績 / 分析の閲覧（読み取り専用）
   - 承認キュー（下書きの承認 / 却下 / コメント）
3. **承認ワークフロー（最小版）**
   - `scheduled_posts.status` に `draft` / `pending_approval` / `rejected` を追加
   - `approval_note`（顧客コメント）を追加
   - cron auto-post は `approved`（= 既存の `pending`）相当のみ投稿するようゲート
4. **課金（最小）**
   - `clients.plan` は既存のまま。Stripe Checkout リンクは手動運用。
   - Phase 1 では「課金 UI」は作らない（`/app` に現在のプラン表示のみ）。

### Out（Phase 2 以降に送る）
- 顧客セルフのサインアップ（公開登録フォーム）
- 顧客自身による X/IG の OAuth 連携
- Stripe Customer Portal / Checkout の自動化、プラン別 entitlement の厳密ゲート
- 利用規約・プライバシー・特商法などの法務一式（出荷直前の Phase 4=F）
- セルフモード（顧客が自分で下書き生成・投稿）

---

## 3. アーキテクチャ上の決定

### 決定1: テナント分離は Supabase Auth + RLS（DB レベル強制）
顧客データの分離をアプリ層の `where client_id=` に頼らず、**DB の RLS で強制**する。
アプリにバグがあっても他テナントの行は読めない。これが「お客さんに売る」ための非交渉要件。

### 決定2: 認証は二系統の共存（dual auth）
| 利用者 | 認証 | セッション | DB アクセス |
|---|---|---|---|
| 運用者 (haruto) | NextAuth + Google（既存・変更なし） | NextAuth JWT cookie | `supabaseAdmin()` (service-role, RLS バイパス) |
| 顧客 | **Supabase Auth（マジックリンク・新規）** | Supabase SSR cookie | anon client（RLS 強制, `auth.uid()` claim 付き） |

- `/dashboard/**` と `/api/**`（運用者・cron）は **今まで通り**。
- `/app/**` は **Supabase セッション**で動き、RLS が効いた anon クライアントでデータアクセス。
- 2つのセッション cookie は名前空間が異なり衝突しない。同一ブラウザで運用者が両方に
  入ることも可能（テスト時に有用）。

### 決定3: 顧客ログイン手段はマジックリンク
中小企業オーナー向けに Google 前提を避ける。パスワード管理も不要。Supabase Auth 標準機能。

---

## 4. データモデル変更（新規マイグレーション `0002_tenant_phase1.sql`）

### 4.1 `clients` への追加列
```sql
alter table clients
  add column auth_user_id uuid unique references auth.users(id) on delete set null;
-- ログインユーザーと client の 1:1 紐付け。未連携の client は NULL（運用者が後で招待）。
```

### 4.2 `scheduled_posts` の状態拡張
```sql
alter type scheduled_status add value 'draft';
alter type scheduled_status add value 'pending_approval';
alter type scheduled_status add value 'rejected';

alter table scheduled_posts
  add column approval_note text,        -- 顧客の却下理由・コメント
  add column approved_at timestamptz,
  add column approved_by uuid;          -- auth.users(id)（顧客）
```
> 注: `alter type ... add value` は別トランザクションでのコミットが必要。マイグレーションは
> enum 追加と列追加を分割実行する（Supabase migration の慣例に従う）。

#### 状態遷移
```
draft ──(運用者が提出)──► pending_approval ──(顧客 承認)──► approved(=pending) ──(cron)──► running ─► succeeded/failed
                                          └─(顧客 却下)──► rejected ──(運用者が修正)─► pending_approval
```
- 「approved」は既存の `pending` を流用する（cron は `pending` を拾うため改修最小）。
  → 承認＝`status` を `pending` にし `approved_at/by` を埋める。
- これにより **cron auto-post の本体ロジックはほぼ無改修**（拾う条件は現状維持）。
  唯一の変更は、運用者が直接 `pending` を作っていた箇所を `draft`/`pending_approval`
  経由にする運用フロー側。

### 4.3 RLS: 顧客向け読み取り + 限定書き込みポリシー
ヘルパー関数で「現在のログインユーザーの client_id 群」を解決する。
```sql
create or replace function current_client_ids()
returns setof uuid language sql stable security definer as $$
  select id from clients where auth_user_id = auth.uid();
$$;
```

各テーブルに **authenticated ロール限定**のポリシーを追加（anon は引き続き全拒否）:
```sql
-- 例: post_history（顧客は自分の実績を閲覧のみ）
create policy client_select_post_history on post_history
  for select to authenticated
  using (client_id in (select current_client_ids()));

-- clients 自身（自分の行のみ閲覧）
create policy client_select_self on clients
  for select to authenticated
  using (id in (select current_client_ids()));

-- scheduled_posts: 顧客は pending_approval の自分の行を閲覧 + 承認/却下の update のみ
create policy client_select_scheduled on scheduled_posts
  for select to authenticated
  using (client_id in (select current_client_ids()));

create policy client_update_approval on scheduled_posts
  for update to authenticated
  using (client_id in (select current_client_ids()))
  with check (client_id in (select current_client_ids()));
```
- **書き込みは承認/却下の update に限定**。INSERT/DELETE は顧客に与えない。
- `x_accounts` / `instagram_accounts`（暗号化トークン）は **顧客ポリシーを一切作らない**
  → 顧客の anon クライアントからは決して読めない。連携情報は運用者 service-role のみ。
- `error_logs` / `api_quota_usage` も顧客ポリシーなし（運用者専用）。
- 承認 update の列レベル制御（顧客が `status` を `pending`/`rejected` 以外に変えられない）は
  RLS だけでは表現しづらいため、**書き込みは Server Action 経由**にして
  アプリ側で許可された遷移のみ実行する（下記 6.3）。直接の table update 権限は
  「将来のため」に残すが Phase 1 の UI は Server Action のみを使う。

---

## 5. ルーティングと認可

```
app/
  app/                      # 顧客コンソール（新規, Supabase Auth）
    layout.tsx              # requireClient() で Supabase セッション検証 + client 解決
    page.tsx                # ダッシュボード（実績サマリ）
    approvals/page.tsx      # 承認キュー
    login/page.tsx          # マジックリンク送信フォーム
    auth/callback/route.ts  # Supabase マジックリンク着地 → セッション確立
  dashboard/                # 運用者コンソール（既存, 変更最小）
  api/                      # 既存（運用者 + cron）
```

### 認可ガード（新規 `lib/api/client-guard.ts`）
```ts
// requireClient(): /app 用。Supabase セッション必須 + clients 行を解決して返す。
//   未ログイン → /app/login へ redirect。
//   ログイン済みだが client 未連携 → 専用の「準備中」画面へ。
export async function requireClient(): Promise<{ userId: string; client: ClientRow }>;
```
- 既存の `requireAdminPage()`（運用者）とは独立。
- `/app` の Supabase クライアントは **cookie 書き込み可能**な SSR クライアントが必要
  （現状の `supabaseServer()` は setAll が no-op）。`/app` 用に
  `lib/supabase/client-session.ts`（route handler / middleware で cookie 設定可能版）を追加。

### middleware
- `middleware.ts` を追加し、`/app/**` で Supabase セッション cookie のリフレッシュを行う
  （`@supabase/ssr` の標準パターン）。`/dashboard` と `/api` は対象外。

---

## 6. コンポーネント設計

### 6.1 顧客ログイン（`/app/login` + `/app/auth/callback`）
- メール入力 → `supabase.auth.signInWithOtp({ email })` でマジックリンク送信。
- リンク着地 → callback route でセッション確立 → `/app` へ。
- **重要**: マジックリンクでログインできるのは、その email が `clients.email` に存在し
  かつ運用者が「招待済み」の場合のみ。未知の email がサインアップしても `client` に
  紐付かない（= データは一切見えない / 「準備中」画面）。これで公開登録を作らずに
  招待制を実現する。

### 6.2 顧客の招待（運用者側、`/dashboard/clients/[id]`）
- 運用者が client 詳細で「顧客を招待」→ `clients.email` 宛にマジックリンク送付。
- 初回ログイン時に `clients.auth_user_id` を当該 `auth.users.id` で埋める
  （callback で email 一致 client を探して紐付け。1:1 制約で二重紐付け防止）。

### 6.3 承認キュー（`/app/approvals`）
- `pending_approval` の自分の `scheduled_posts` を一覧表示（本文プレビュー + 予定日時）。
- アクション = Server Action:
  - `approvePost(id)`: 状態 `pending_approval → pending`、`approved_at/by` 記録。
  - `rejectPost(id, note)`: 状態 `pending_approval → rejected`、`approval_note` 記録。
- Server Action 内で **遷移の妥当性を検証**（元が `pending_approval` か、自分の client か）。
- 承認/却下時に運用者へ Slack 通知（既存 `postToSlack` 再利用）。

### 6.4 実績ダッシュボード（`/app`）
- `post_history`（自分の client）から直近の投稿・エンゲージメント集計を表示。
- 既存の運用者ダッシュボードの集計ロジックを流用しつつ client scope。

### 6.5 運用者フローの変更（最小）
- 運用者が下書きを作る既存導線（`/dashboard/compose` 等）で、保存時の初期 status を
  `draft` にし、「顧客に提出」操作で `pending_approval` にする。
- 「提出」で顧客へ通知（メール via 既存 Resend or Slack）。

---

## 7. セキュリティ考慮

- **テナント分離は RLS で DB 強制**。`/app` は anon クライアント（service-role を絶対に使わない）。
  `lib/supabase/admin.ts` は `server-only` + `app/api/**` 限定の既存ルールを維持。
- 暗号化トークン（`*_accounts`）には顧客ポリシーを作らない＝顧客経路から不可視。
- 承認の書き込みは Server Action で遷移を検証。RLS は「自分の client の行のみ」を担保。
- マジックリンクは招待制（未知 email は client 未連携で何も見えない）。
- middleware は `/app` のみセッション処理。`/dashboard`・`/api` の既存挙動は不変。
- **回帰防止**: 既存の運用者フロー（NextAuth + service-role + cron）は一切壊さない。
  cron は `pending` を拾う条件を変えないため、承認済みのみ流れる。

---

## 8. テスト / 検証

- **型チェック**: `npm run typecheck`（strict, any 禁止を維持）。
- **テナント分離テスト（最重要）**: 顧客 A のセッションで顧客 B のデータ
  （post_history / scheduled_posts / clients / *_accounts）が読めない・書けないことを確認。
  - Supabase の anon クライアント + 各 JWT で SELECT/UPDATE を試行し 0 件 / 拒否を検証。
- **承認フロー**: draft → 提出 → 顧客承認 → cron が `pending` を拾って投稿、を疎通
  （cron はローカルで `curl -H "Authorization: Bearer $CRON_SECRET"`）。
- **却下フロー**: 却下 → 運用者が修正 → 再提出。
- **回帰**: 既存 `/dashboard`・`/generate`・cron が従来通り動くこと。
- **ローカル起動**: `npm run dev`、`/app/login` でマジックリンク（Supabase ローカル or
  実プロジェクトの test メール）。

---

## 9. 影響範囲（既存コードへの変更）

| ファイル/領域 | 変更 |
|---|---|
| `supabase/migrations/0002_*.sql` | 新規（列追加・enum 拡張・RLS ポリシー・ヘルパー関数） |
| `middleware.ts` | 新規（/app のセッション維持） |
| `lib/supabase/client-session.ts` | 新規（cookie 書込可能な SSR クライアント） |
| `lib/api/client-guard.ts` | 新規（requireClient） |
| `app/app/**` | 新規（login, callback, layout, page, approvals） |
| `app/dashboard/clients/[id]` | 招待ボタン + 提出フロー追加 |
| `app/dashboard/compose` 等 | 下書き初期 status を draft に |
| `lib/supabase/types.ts` | 型追加（auth_user_id, 新 status, approval 列） |
| `app/api/cron/auto-post/route.ts` | 原則無改修（`pending` のみ拾う既存挙動を維持） |
| `.env.example` | 必要なら Supabase Auth 関連の追記 |

---

## 10. リスクと未決事項

- **enum 値追加のマイグレーション**: `alter type add value` はトランザクション分割が必要。
  Supabase の `apply_migration` での実行手順を確認する。
- **Supabase Auth と NextAuth の共存**: cookie / middleware の干渉がないか実機確認。
- **マジックリンクのメール到達**: Supabase 標準メール or Resend SMTP 設定のどちらを使うか
  （Phase 1 は Supabase 標準で可、ブランドメールは後）。
- **承認の列レベル制御**: Phase 1 は Server Action に寄せる方針で確定。直接 update 権限の
  扱いは Phase 2 で再検討。
- **既存 compose UI の実装状況**: `/dashboard/compose` の現状を実装時に精査し、提出フロー
  との接続点を確定する。

---

## 11. 次フェーズ参照（このスライスの先）

```
Phase 1 (本書): テナント基盤 + 顧客承認/閲覧            ← 1社目に売れる
Phase 2: 顧客セルフ OAuth 連携 + セルフ課金(Checkout/Portal/entitlement)
Phase 3: セルフモード（顧客が下書き生成・投稿）+ 分析強化
Phase 4: 本番ハードニング（法務・監視・レート制限・障害対応）
```
各フェーズは独立した spec → 実装計画 → 実装サイクルで進める。
