import { z } from "zod";
import { ok, fail, withErrorBoundary, HttpError } from "@/lib/api/response";
import { requireAdminApi } from "@/lib/api/auth-guard";
import { loadIgAuth, igPost, publishContainer } from "@/lib/instagram/client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { trackApiCall } from "@/lib/rate-limit/quota";
import { logError } from "@/lib/monitoring/logError";

const bodySchema = z.discriminatedUnion("mediaType", [
  z.object({
    mediaType: z.literal("feed"),
    clientId: z.string().uuid(),
    imageUrl: z.string().url(),
    caption: z.string().max(2200).optional(),
  }),
  z.object({
    mediaType: z.literal("story"),
    clientId: z.string().uuid(),
    imageUrl: z.string().url(),
  }),
  z.object({
    mediaType: z.literal("reel"),
    clientId: z.string().uuid(),
    videoUrl: z.string().url(),
    caption: z.string().max(2200).optional(),
  }),
  z.object({
    mediaType: z.literal("carousel"),
    clientId: z.string().uuid(),
    imageUrls: z.array(z.string().url()).min(2).max(10),
    caption: z.string().max(2200).optional(),
  }),
]);

export const POST = withErrorBoundary(async (request) => {
  await requireAdminApi();
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid body.");
  const body = parsed.data;

  const { account, accessToken } = await loadIgAuth(body.clientId);
  await trackApiCall(body.clientId, "instagram");

  try {
    let creationId: string | null = null;
    if (body.mediaType === "feed") {
      const created = await igPost<{ id: string }>(`/${account.ig_user_id}/media`, {
        image_url: body.imageUrl,
        caption: body.caption ?? "",
        access_token: accessToken,
      });
      creationId = created.id;
    } else if (body.mediaType === "story") {
      const created = await igPost<{ id: string }>(`/${account.ig_user_id}/media`, {
        image_url: body.imageUrl,
        media_type: "STORIES",
        access_token: accessToken,
      });
      creationId = created.id;
    } else if (body.mediaType === "reel") {
      const created = await igPost<{ id: string }>(`/${account.ig_user_id}/media`, {
        media_type: "REELS",
        video_url: body.videoUrl,
        caption: body.caption ?? "",
        access_token: accessToken,
      });
      creationId = created.id;
    } else {
      // carousel
      const childIds: string[] = [];
      for (const url of body.imageUrls) {
        const child = await igPost<{ id: string }>(`/${account.ig_user_id}/media`, {
          image_url: url,
          is_carousel_item: "true",
          access_token: accessToken,
        });
        childIds.push(child.id);
      }
      const carousel = await igPost<{ id: string }>(`/${account.ig_user_id}/media`, {
        media_type: "CAROUSEL",
        children: childIds.join(","),
        caption: body.caption ?? "",
        access_token: accessToken,
      });
      creationId = carousel.id;
    }

    if (!creationId) throw new HttpError(502, "IG creation failed.", "warning");

    const externalId = await publishContainer(account.ig_user_id, accessToken, creationId);

    await supabaseAdmin().from("post_history").insert({
      client_id: body.clientId,
      platform: "instagram",
      external_id: externalId,
      action: `ig_${body.mediaType}`,
      text: "caption" in body ? body.caption ?? null : null,
    });

    return ok({ externalId, mediaType: body.mediaType });
  } catch (error) {
    await logError({
      severity: "warning",
      clientId: body.clientId,
      kind: `instagram_post_${body.mediaType}`,
      message: error instanceof Error ? error.message : String(error),
      meta: { body },
    });
    throw error;
  }
});
