import { z } from "zod";
import { withErrorBoundary, ok, fail } from "@/lib/api/response";
import { requireAdminApi } from "@/lib/api/auth-guard";
import { logError } from "@/lib/monitoring/logError";

const bodySchema = z.object({
  severity: z.enum(["info", "warning", "critical"]),
  kind: z.string().min(1).max(80),
  message: z.string().min(1).max(2000),
  clientId: z.string().uuid().nullable().optional(),
  meta: z.record(z.unknown()).optional(),
});

export const POST = withErrorBoundary(async (request) => {
  await requireAdminApi();
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid body.");
  await logError(parsed.data);
  return ok({ recorded: true });
});
