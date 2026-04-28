import { z } from "zod";
import { ok, fail, withErrorBoundary, HttpError } from "@/lib/api/response";
import { requireAdminApi } from "@/lib/api/auth-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { userXClient } from "@/lib/x/client";
import { callClaudeText } from "@/lib/ai/anthropic";
import { buildPersonaSystemPrompt } from "@/lib/ai/persona";
import { trackApiCall } from "@/lib/rate-limit/quota";
import { logError } from "@/lib/monitoring/logError";
import type { ClientRow } from "@/lib/supabase/types";

const bodySchema = z.discriminatedUnion("actionType", [
  z.object({
    actionType: z.literal("post"),
    clientId: z.string().uuid(),
    text: z.string().min(1).max(280).optional(),
    aiPromptHint: z.string().max(500).optional(),
  }),
  z.object({
    actionType: z.literal("thread"),
    clientId: z.string().uuid(),
    tweets: z.array(z.string().min(1).max(280)).min(2).max(10),
  }),
  z.object({
    actionType: z.literal("quote_rt"),
    clientId: z.string().uuid(),
    targetTweetId: z.string().min(5),
    aiPromptHint: z.string().max(500).optional(),
  }),
  z.object({
    actionType: z.literal("reply"),
    clientId: z.string().uuid(),
    targetTweetId: z.string().min(5),
    aiPromptHint: z.string().max(500).optional(),
  }),
  z.object({
    actionType: z.literal("like"),
    clientId: z.string().uuid(),
    targetTweetId: z.string().min(5),
  }),
]);

async function loadClient(clientId: string): Promise<ClientRow> {
  const { data, error } = await supabaseAdmin()
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw new HttpError(500, "Failed to load client.", "critical");
  if (!data) throw new HttpError(404, "Client not found.", "warning");
  if (data.suspend_at && new Date(data.suspend_at).getTime() <= Date.now()) {
    throw new HttpError(402, "Client is suspended (billing).", "warning");
  }
  return data as ClientRow;
}

async function generateText(
  client: ClientRow,
  task: string,
  hint: string | undefined,
): Promise<string> {
  const system = buildPersonaSystemPrompt(client.persona, task);
  const text = await callClaudeText({
    system,
    userMessage:
      hint
        ? `Generate a single tweet (Japanese, max 140 chars, no quotes, no markdown). Hint: ${hint}`
        : `Generate a single tweet (Japanese, max 140 chars, no quotes, no markdown).`,
    maxTokens: 400,
  });
  return text.replace(/^["「『]|["」』]$/g, "").slice(0, 280);
}

export const POST = withErrorBoundary(async (request) => {
  await requireAdminApi();
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid body.");
  const body = parsed.data;

  const client = await loadClient(body.clientId);
  const { client: x } = await userXClient(body.clientId);

  await trackApiCall(client.id, "x");

  try {
    let externalId: string | null = null;
    let textForRecord: string | null = null;

    switch (body.actionType) {
      case "post": {
        const text = body.text ?? (await generateText(client, "Write a single standalone X post.", body.aiPromptHint));
        const res = await x.v2.tweet(text);
        externalId = res.data.id;
        textForRecord = text;
        break;
      }
      case "thread": {
        const res = await x.v2.tweetThread(body.tweets);
        externalId = res[0]?.data.id ?? null;
        textForRecord = body.tweets.join("\n---\n");
        break;
      }
      case "quote_rt": {
        const text = await generateText(client, "Write a quote-tweet comment for the linked viral post.", body.aiPromptHint);
        const res = await x.v2.tweet(text, { quote_tweet_id: body.targetTweetId });
        externalId = res.data.id;
        textForRecord = text;
        break;
      }
      case "reply": {
        const text = await generateText(client, "Write a friendly reply to the target tweet.", body.aiPromptHint);
        const res = await x.v2.reply(text, body.targetTweetId);
        externalId = res.data.id;
        textForRecord = text;
        break;
      }
      case "like": {
        const me = await x.v2.me();
        await x.v2.like(me.data.id, body.targetTweetId);
        externalId = body.targetTweetId;
        break;
      }
    }

    await supabaseAdmin().from("post_history").insert({
      client_id: client.id,
      platform: "x",
      external_id: externalId,
      action: body.actionType,
      text: textForRecord,
    });

    return ok({ externalId, action: body.actionType });
  } catch (error) {
    await logError({
      severity: "warning",
      clientId: client.id,
      kind: `x_action_${body.actionType}`,
      message: error instanceof Error ? error.message : String(error),
      meta: { body },
    });
    throw error;
  }
});
