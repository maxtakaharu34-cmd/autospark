/**
 * Hand-written type definitions mirroring `supabase/migrations/0001_init.sql`.
 * Replace this with `supabase gen types typescript` output once the project is
 * linked to a remote Supabase instance.
 */

export type Plan = "starter" | "growth" | "enterprise" | "trial" | "suspended";
export type Platform = "x" | "instagram";
export type ScheduledStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";
export type Severity = "info" | "warning" | "critical";

export interface ClientRow {
  id: string;
  name: string;
  email: string | null;
  plan: Plan;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  suspend_at: string | null;
  persona: PersonaConfig;
  created_at: string;
  updated_at: string;
}

export interface PersonaConfig {
  voice: string;
  character: string;
  forbidden_words: string[];
  preferred_post_hours: number[]; // 0-23 in JST
  notes?: string;
}

export interface XAccountRow {
  id: string;
  client_id: string;
  handle: string;
  user_id: string;
  access_token_enc: string;
  access_secret_enc: string;
  scopes: string[];
  created_at: string;
  updated_at: string;
}

export interface InstagramAccountRow {
  id: string;
  client_id: string;
  ig_user_id: string;
  username: string;
  access_token_enc: string;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduledPostRow {
  id: string;
  client_id: string;
  platform: Platform;
  payload: ScheduledPostPayload;
  scheduled_at: string;
  status: ScheduledStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduledPostPayload {
  action: "post" | "thread" | "quote_rt" | "reply" | "ig_feed" | "ig_story" | "ig_reel" | "ig_carousel";
  text?: string;
  thread?: string[];
  target_tweet_id?: string;
  reply_to_tweet_id?: string;
  media_urls?: string[];
  caption?: string;
  hashtags?: string[];
}

export interface PostHistoryRow {
  id: string;
  client_id: string;
  platform: Platform;
  external_id: string | null;
  action: string;
  text: string | null;
  impressions: number;
  likes: number;
  retweets: number;
  replies: number;
  measured_at: string | null;
  posted_at: string;
}

export interface ErrorLogRow {
  id: string;
  client_id: string | null;
  severity: Severity;
  kind: string;
  message: string;
  meta: Record<string, unknown> | null;
  resolved: boolean;
  created_at: string;
}

export interface ApiQuotaUsageRow {
  id: string;
  client_id: string;
  platform: Platform;
  period_start: string;
  call_count: number;
  monthly_limit: number;
  updated_at: string;
}
