import { z } from "zod";
import { ok, fail, withErrorBoundary, HttpError } from "@/lib/api/response";
import { requireAdminApi } from "@/lib/api/auth-guard";
import { loadIgAuth, igGet, igPost } from "@/lib/instagram/client";
import { callClaudeText } from "@/lib/ai/anthropic";
import { buildPersonaSystemPrompt } from "@/lib/ai/persona";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ClientRow } from "@/lib/supabase/types";

const bodySchema = z.object({
  clientId: z.string().uuid(),
  // Optional: limit reply to comments matching at least one of these substrings.
  keywords: z.array(z.string().min(1)).max(20).optional(),
  // Maximum number of replies to send per invocation.
  maxReplies: z.number().int().min(1).max(20).optional(),
});

interface IgComment {
  id: string;
  text: string;
  username: string;
}
interface IgMediaList {
  data: Array<{
    id: string;
    comments?: { data: IgComment[] };
  }>;
}

const SPAM_PATTERNS = [/follow\s*4\s*follow/i, /https?:\/\/bit\.ly/i, /sub\s*to/i];

function looksLikeSpam(text: string): boolean {
  if (text.length < 2) return true;
  return SPAM_PATTERNS.some((re) => re.test(text));
}

export const POST = withErrorBoundary(async (request) => {
  await requireAdminApi();
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid body.");
  const { clientId, keywords, maxReplies = 5 } = parsed.data;

  const { data: clientRow } = await supabaseAdmin().from("clients").select("*").eq("id", clientId).maybeSingle();
  if (!clientRow) throw new HttpError(404, "Client not found.", "warning");
  const client = clientRow as ClientRow;

  const { account, accessToken } = await loadIgAuth(clientId);

  // Fetch the 5 most recent media + their top-level comments.
  const media = await igGet<IgMediaList>(`/${account.ig_user_id}/media`, {
    fields: "id,comments{id,text,username}",
    limit: "5",
    access_token: accessToken,
  });

  const candidates: IgComment[] = [];
  for (const m of media.data) {
    for (const c of m.comments?.data ?? []) {
      if (looksLikeSpam(c.text)) continue;
      if (keywords && !keywords.some((k) => c.text.includes(k))) continue;
      candidates.push(c);
      if (candidates.length >= maxReplies) break;
    }
    if (candidates.length >= maxReplies) break;
  }

  const replies: Array<{ commentId: string; reply: string }> = [];
  for (const c of candidates) {
    const reply = await callClaudeText({
      system: buildPersonaSystemPrompt(client.persona, "Reply warmly to an Instagram comment in Japanese."),
      userMessage: `Comment: ${c.text}\nReply (max 80 chars, no quotes):`,
      maxTokens: 200,
    });
    const trimmed = reply.trim().slice(0, 200);
    await igPost(`/${c.id}/replies`, { message: trimmed, access_token: accessToken });
    replies.push({ commentId: c.id, reply: trimmed });
  }

  return ok({ replied: replies.length, items: replies });
});
