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
