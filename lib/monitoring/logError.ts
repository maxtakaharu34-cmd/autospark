import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { postToSlack, severityEmoji } from "@/lib/notify/slack";
import type { Severity } from "@/lib/supabase/types";

export interface LogErrorInput {
  severity: Severity;
  kind: string;
  message: string;
  clientId?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Insert into `error_logs` and (for warning/critical) post to Slack #error-alerts.
 * This must NEVER throw — it is invoked from error boundaries.
 */
export async function logError(input: LogErrorInput): Promise<void> {
  try {
    await supabaseAdmin().from("error_logs").insert({
      client_id: input.clientId ?? null,
      severity: input.severity,
      kind: input.kind,
      message: input.message,
      meta: input.meta ?? null,
      resolved: false,
    });
  } catch (e) {
    console.error("Failed to write error_logs:", e);
  }

  if (input.severity === "critical") {
    await postToSlack({
      channel: "errors",
      text: `${severityEmoji(input.severity)} *[${input.kind}]* ${input.message}` +
        (input.clientId ? `\nclient: \`${input.clientId}\`` : ""),
    });
  }
}
