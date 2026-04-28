import "server-only";
import { decrypt } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/api/response";
import type { InstagramAccountRow } from "@/lib/supabase/types";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export interface IgAuth {
  account: InstagramAccountRow;
  accessToken: string;
}

export async function loadIgAuth(clientId: string): Promise<IgAuth> {
  const { data, error } = await supabaseAdmin()
    .from("instagram_accounts")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new HttpError(500, "Failed to load Instagram account.", "critical");
  if (!data) throw new HttpError(404, "Instagram account is not connected.", "warning");
  const account = data as InstagramAccountRow;
  return { account, accessToken: decrypt(account.access_token_enc) };
}

export async function igGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH_BASE}${path}?${qs}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new HttpError(502, `Instagram GET ${path} failed: ${res.status} ${body}`, "warning");
  }
  return (await res.json()) as T;
}

export async function igPost<T>(path: string, params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HttpError(502, `Instagram POST ${path} failed: ${res.status} ${text}`, "warning");
  }
  return (await res.json()) as T;
}

/**
 * Two-step container publish flow used by all Instagram media types.
 */
export async function publishContainer(
  igUserId: string,
  accessToken: string,
  creationId: string,
): Promise<string> {
  const res = await igPost<{ id: string }>(`/${igUserId}/media_publish`, {
    creation_id: creationId,
    access_token: accessToken,
  });
  return res.id;
}
