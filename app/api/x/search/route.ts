import { z } from "zod";
import { appOnlyXClient } from "@/lib/x/client";
import { ok, fail, withErrorBoundary } from "@/lib/api/response";
import { requireAdminApi } from "@/lib/api/auth-guard";

const CATEGORY_KEYWORDS: Record<string, string> = {
  ai: "(AI OR ChatGPT OR Claude OR LLM)",
  sns: "(SNS OR バズ OR フォロワー)",
  business: "(ビジネス OR マーケ OR 経営)",
  startup: "(起業 OR スタートアップ)",
  side: "(副業 OR 収益化)",
  life: "(人生 OR 生き方 OR 自己啓発)",
};

const querySchema = z.object({
  category: z.string().optional(),
  minFaves: z.coerce.number().int().positive().max(100_000).optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

export const GET = withErrorBoundary(async (request: Request) => {
  await requireAdminApi();
  const url = new URL(request.url);
  const params = querySchema.safeParse({
    category: url.searchParams.get("category") ?? undefined,
    minFaves: url.searchParams.get("minFaves") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!params.success) return fail(400, "Invalid query parameters.");

  const minFaves = params.data.minFaves ?? 3000;
  const limit = params.data.limit ?? 20;
  const category = params.data.category;
  const categoryClause = category && CATEGORY_KEYWORDS[category]
    ? ` ${CATEGORY_KEYWORDS[category]}`
    : "";

  const query = `min_faves:${minFaves} lang:ja -is:retweet${categoryClause}`;

  const client = appOnlyXClient();
  const result = await client.v2.search(query, {
    "tweet.fields": ["public_metrics", "created_at", "author_id"],
    max_results: Math.min(100, Math.max(10, limit)),
  });

  const tweets = (result.data?.data ?? [])
    .map((t) => ({
      id: t.id,
      text: t.text,
      created_at: t.created_at,
      author_id: t.author_id,
      metrics: t.public_metrics,
    }))
    .sort((a, b) => (b.metrics?.impression_count ?? b.metrics?.like_count ?? 0)
      - (a.metrics?.impression_count ?? a.metrics?.like_count ?? 0))
    .slice(0, limit);

  return ok({ query, tweets });
});
