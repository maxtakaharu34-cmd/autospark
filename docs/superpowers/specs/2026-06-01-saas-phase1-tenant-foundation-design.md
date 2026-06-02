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

### 4.1 `clients` への追加列（マイグレーション 0003）
```sql
alter table clients
  add column auth_user_id uuid unique references auth.users(id) on delete set null,
  add column invited_at timestamptz;   -- 運用者が招待を送った時刻（招待制ゲート）
-- ログインユーザーと client の 1:1 紐付け。未連携の client は NULL（運用者が後で招待）。

-- email を一意化（email→client を一意に解決するため。既存重複があれば事前クリーンが必要）
create unique index clients_email_unique on clients (lower(email)) where email is not null;
```

### 4.2 `scheduled_posts` の状態拡張（**承認状態は専用の `approved` を新設**）
レビュー指摘により、承認状態を既存 `pending` に流用するのは**廃止**する。理由:
cron は transient 失敗時に `status` を `pending` へ戻す（`auto-post/route.ts:106`）ため、
`pending` を「承認済み」に流用すると「承認済み・初回待ち」「運用者が直接作った pending」
「失敗してリトライ中」が区別できず、承認ゲートを迂回する経路が生まれる。

そこで **`approved` を新しい enum 値として追加**し、cron は `approved` のみを拾うよう変更する。

```sql
-- (マイグレーション 0002: enum 値追加のみ。下記 4.4 参照)
alter type scheduled_status add value 'draft';
alter type scheduled_status add value 'pending_approval';
alter type scheduled_status add value 'approved';
alter type scheduled_status add value 'rejected';

-- (マイグレーション 0003: 列追加・ポリシー)
alter table scheduled_posts
  add column approval_note text,        -- 顧客のコメント（却下理由を含む）
  add column approved_at timestamptz,
  add column approved_by uuid;          -- auth.users(id)（顧客）
```

#### 状態遷移
```
draft ──(運用者が提出)──► pending_approval ──(顧客 承認)──► approved ──(cron が拾う)──► running
                                          │                                            │
                                          └─(顧客 却下)──► rejected                   ├─► succeeded
                                                            │                          ├─► failed (attempts>=3)
                                                            └─(運用者が修正)─► pending_approval
                                                                                       └─► approved (transient失敗でリトライ; 再承認不要)
running 失敗(attempts<3) ──► approved  （※ pending ではなく approved に戻す = 既に承認済みのため）
```

#### cron への変更（最小・1 行）
- `auto-post/route.ts:63` の `.in("status", ["pending"])` を **`.in("status", ["approved"])`** に変更。
- transient 失敗時のリセット先（同 :106 `status: finalFailure ? "failed" : "pending"`）を
  **`"approved"`** に変更（承認済みなので再承認なしでリトライ）。
- これだけで「承認済みのみ実投稿」が **DB の状態で保証**される。運用者が直接 `approved` を
  作らない限り（UI 上はそうしない）、承認ゲートは迂回されない。
- 既存の `pending` は Phase 1 では未使用化（または運用者直投稿用に温存だが UI からは作らない）。

### 4.3 RLS: 顧客向けは **読み取り専用**（書き込みはサーバ側 Server Action）
ヘルパー関数で「現在のログインユーザーの client_id 群」を解決する。
**`security definer` には `search_path` を固定**する（権限昇格対策・Supabase 必須慣行）。
```sql
create or replace function current_client_ids()
returns setof uuid
language sql stable security definer
set search_path = ''        -- 重要: 検索パス固定。schema 修飾で参照する
as $$
  select id from public.clients where auth_user_id = (select auth.uid());
$$;
```

各テーブルに **authenticated ロール限定の SELECT ポリシーのみ**を追加（anon は引き続き全拒否）:
```sql
-- post_history（顧客は自分の実績を閲覧のみ）
create policy client_select_post_history on post_history
  for select to authenticated
  using (client_id in (select current_client_ids()));

-- clients 自身（自分の行のみ閲覧）
create policy client_select_self on clients
  for select to authenticated
  using (id in (select current_client_ids()));

-- scheduled_posts（顧客は自分の行を閲覧のみ）
create policy client_select_scheduled on scheduled_posts
  for select to authenticated
  using (client_id in (select current_client_ids()));
```

#### 書き込み（承認/却下）は **顧客の anon JWT に UPDATE 権限を与えない**
レビュー指摘の通り、`authenticated` に UPDATE 権限を与えると、顧客は PostgREST に直接
アクセスして自分の行の `status` を `succeeded`/`running` 等の任意値に書き換えたり
`approved_by` を偽装でき、承認/cron の状態機械が壊れる（RLS だけでは列・遷移を縛れない）。

→ **承認/却下の書き込みは Server Action 内で service-role を用い、アプリ側で遷移を厳密検証**する
（許可遷移: `pending_approval → approved` / `pending_approval → rejected` のみ。`client_id`
が現在の顧客のものか、元状態が `pending_approval` か、を必ず確認）。
顧客の anon クライアントには **INSERT / UPDATE / DELETE ポリシーを一切作らない**。
これにより「RLS は読み取りの DB レベル backstop、書き込みは検証済み Server Action のみ」
という一貫した不変条件になる。

- `x_accounts` / `instagram_accounts`（暗号化トークン）は **顧客ポリシーを一切作らない**
  → 顧客の anon クライアントからは決して読めない。連携情報は運用者 service-role のみ。
- `error_logs` / `api_quota_usage` も顧客ポリシーなし（運用者専用）。

#### 読み取り時の列露出について（Phase 1 の判断）
顧客 SELECT ポリシーは **行全体**を返す。`scheduled_posts.payload`（`target_tweet_id` 等の
運用内部値）や `post_history.external_id` も含まれる。Phase 1 では許容するが、実装時に
「顧客に見せる列だけを返す view または select 列の限定」を行い、内部運用フィールドを
露出しない。これは実装計画のタスクに含める。

### 4.4 マイグレーションの分割（enum 追加の制約に対応）
Postgres では `alter type ... add value` で追加した enum 値は、**同一トランザクション内では
使用できない**（`apply_migration` はファイル単位で 1 トランザクション）。新値を参照する
ポリシー/CHECK/default は別マイグレーションに分ける必要がある。本 Phase では：

- **`0002_scheduled_status_values.sql`**: `alter type scheduled_status add value ...` のみ（4 値）。
- **`0003_tenant_phase1.sql`**: `clients.auth_user_id`、`scheduled_posts` の承認列、
  `current_client_ids()` 関数、SELECT ポリシー群。新 enum 値を**文字列として参照**するのは
  この 0003 以降（別トランザクション）なので安全。
- 実装時、cron の `["approved"]` 参照は TypeScript 側であり DB トランザクションとは無関係。

> 代替案として「enum を mutate せず `text + CHECK` 列に置き換える」も検討したが、既存
> `0001` の enum 資産と cron の型を活かすため、分割マイグレーション方式を採用する。

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
- 現状 `middleware.ts` は **存在せず、NextAuth も middleware を使っていない**ことを確認済み。
  Next.js は `middleware.ts` を **1 ファイルしか持てない**ため、新規追加で衝突しない。
- `middleware.ts` を新規追加し、**`matcher` で `/app/**` のみ**を対象に Supabase セッション
  cookie をリフレッシュ（`@supabase/ssr` 標準パターン）。`/dashboard`・`/api` はマッチさせず
  既存挙動を完全に温存する。
- 将来 NextAuth 側で middleware が必要になった場合は、単一の middleware 内で
  パスプレフィックスにより分岐する設計に統合する（Phase 1 では不要）。

---

## 6. コンポーネント設計

### 6.1 顧客ログイン（`/app/login` + `/app/auth/callback`）
- メール入力 → `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })`。
  - **`shouldCreateUser: false`** にし、未知 email でのアカウント自動作成・メール濫用
    （送信クォータ消費）を防ぐ。送信前にサーバ側で「招待済み（`clients.invited_at IS NOT NULL`
    かつ email 一致）」を確認し、未招待ならリンクを送らない。
- リンク着地 → callback route でセッション確立 → `/app` へ。
- ログイン済みでも `client` 未連携なら「準備中」画面（データは RLS でゼロ件）。

### 6.2 顧客の招待（運用者側、`/dashboard/clients/[id]`）
- `clients` に **`invited_at timestamptz`** を追加（招待の明示フラグ。0003 に含める）。
- 運用者が client 詳細で「顧客を招待」→ `invited_at` を記録し、`clients.email` 宛に
  マジックリンク（または Supabase invite）を送付。
- 初回ログイン時の紐付け（callback、service-role で実行）:
  - email 一致 client を検索し、**`auth_user_id IS NULL` の場合のみ**当該 `auth.users.id` を設定。
    既に設定済みなら上書きしない（取り違え・乗っ取り防止）。
  - `clients.email` に **unique 制約**を追加（0003）し、email→client が一意に定まることを保証。
  - `auth_user_id` の unique 制約と併せ、1 auth ユーザー ↔ 1 client を両側から担保。

### 6.3 承認キュー（`/app/approvals`）
- `pending_approval` の自分の `scheduled_posts` を一覧表示（本文プレビュー + 予定日時）。
- アクション = **Server Action（service-role を使用し、サーバ側で厳密検証）**:
  - `approvePost(id)`: `pending_approval → approved`、`approved_at` = now, `approved_by` = 現在の auth uid。
  - `rejectPost(id, note)`: `pending_approval → rejected`、`approval_note` 記録。
- Server Action 内で必ず検証:
  1. `requireClient()` で現在の顧客 client を解決
  2. 対象 `scheduled_posts.client_id` が **その顧客のもの**であること
  3. 現在の `status` が **`pending_approval`** であること（不正遷移を拒否）
- 顧客の anon JWT には書き込み権限が無い（4.3）ため、PostgREST 直叩きでの改ざんは不可能。
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
- 顧客 RLS は **SELECT のみ**（INSERT/UPDATE/DELETE ポリシー無し）。承認の書き込みは
  service-role の Server Action で遷移・所有権を検証。顧客 anon JWT では PostgREST 直叩きでも
  書き込み不可。`current_client_ids()` は `search_path` 固定で権限昇格を防止。
- マジックリンクは招待制（未知 email は client 未連携で何も見えない）。
- middleware は `/app` のみセッション処理。`/dashboard`・`/api` の既存挙動は不変。
- **回帰防止**: 既存の運用者フロー（NextAuth + service-role）は壊さない。cron は拾う状態を
  `pending` → `approved` に変更するため、**承認済みのみ**が実投稿される（承認ゲートの担保）。

---

## 8. テスト / 検証

- **型チェック**: `npm run typecheck`（strict, any 禁止を維持）。
- **テナント分離テスト（最重要）**: 顧客 A のセッションで顧客 B のデータ
  （post_history / scheduled_posts / clients / *_accounts）が読めないことを確認。
  - 顧客 anon クライアント + 各 JWT で **SELECT** → 自分の行のみ / 他テナント 0 件。
  - 顧客 anon クライアントで **UPDATE / INSERT / DELETE を直叩き** → 全テーブルで拒否
    （承認 update も含む。書き込みポリシーが無いことの確認）。
  - `*_accounts`（暗号化トークン）は自テナント分も含め顧客経路で **0 件**であること。
  - 承認 Server Action に **他テナントの post id** を渡して拒否されること（所有権検証）。
  - 承認 Server Action に **`pending_approval` 以外**の post を渡して拒否されること（遷移検証）。
- **承認フロー**: draft → 提出 → 顧客承認 → cron が `approved` を拾って投稿、を疎通
  （cron はローカルで `curl -H "Authorization: Bearer $CRON_SECRET"`）。
- **却下フロー**: 却下 → 運用者が修正 → 再提出。
- **回帰**: 既存 `/dashboard`・`/generate`・cron が従来通り動くこと。
- **ローカル起動**: `npm run dev`、`/app/login` でマジックリンク（Supabase ローカル or
  実プロジェクトの test メール）。

---

## 9. 影響範囲（既存コードへの変更）

| ファイル/領域 | 変更 |
|---|---|
| `supabase/migrations/0002_scheduled_status_values.sql` | 新規（enum 値追加のみ: draft/pending_approval/approved/rejected） |
| `supabase/migrations/0003_tenant_phase1.sql` | 新規（clients 列追加・email unique・承認列・current_client_ids()・SELECT ポリシー） |
| `middleware.ts` | 新規（/app のセッション維持） |
| `lib/supabase/client-session.ts` | 新規（cookie 書込可能な SSR クライアント） |
| `lib/api/client-guard.ts` | 新規（requireClient） |
| `app/app/**` | 新規（login, callback, layout, page, approvals） |
| `app/dashboard/clients/[id]` | 招待ボタン + 提出フロー追加 |
| `app/dashboard/compose` 等 | 下書き初期 status を draft に |
| `lib/supabase/types.ts` | 型追加（auth_user_id, 新 status, approval 列） |
| `app/api/cron/auto-post/route.ts` | 2 箇所変更（拾う状態を `approved` に / 失敗リトライのリセット先を `approved` に） |
| `.env.example` | 必要なら Supabase Auth 関連の追記 |

---

## 10. リスクと未決事項

- **enum 値追加のマイグレーション**: 4.4 の通り 0002（値追加）/ 0003（参照）に分割で解決。
  実装時 `apply_migration` を 2 本に分けて流す。
- **Supabase Auth と NextAuth の共存**: middleware 未使用を確認済み（5 章）。cookie 名前空間が
  別で衝突しない想定だが、実機で両ログイン同時保持を確認する。
- **マジックリンクのメール到達**: Phase 1 は Supabase 標準メールで可（ブランドメールは後）。
  `shouldCreateUser: false` + `invited_at` ゲートで濫用を防止（6.1）。
- **既存 clients.email の重複**: unique index 追加前に重複が無いか確認・クリーン（4.1）。
- **既存 compose UI の実装状況**: `/dashboard/compose` の現状を実装時に精査し、提出フロー
  （初期 status=draft → 提出で pending_approval）との接続点を確定する。
- **読み取り列露出**: 顧客 SELECT は行全体を返すため、実装時に view か select 列限定で
  内部運用フィールド（payload 内部値・external_id 等）を露出しない（4.3）。

---

## 11. 次フェーズ参照（このスライスの先）

```
Phase 1 (本書): テナント基盤 + 顧客承認/閲覧            ← 1社目に売れる
Phase 2: 顧客セルフ OAuth 連携 + セルフ課金(Checkout/Portal/entitlement)
Phase 3: セルフモード（顧客が下書き生成・投稿）+ 分析強化
Phase 4: 本番ハードニング（法務・監視・レート制限・障害対応）
```
各フェーズは独立した spec → 実装計画 → 実装サイクルで進める。
