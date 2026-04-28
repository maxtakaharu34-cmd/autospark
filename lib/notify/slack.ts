import type { Severity } from "@/lib/supabase/types";

export interface SlackPayload {
  text: string;
  channel?: "default" | "errors";
}

/** Posts a message to the configured Slack incoming webhook. Never throws. */
export async function postToSlack({ text, channel = "default" }: SlackPayload): Promise<void> {
  const url =
    channel === "errors"
      ? process.env.SLACK_ERROR_WEBHOOK_URL ?? process.env.SLACK_WEBHOOK_URL
      : process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (error) {
    console.error("Slack webhook failed:", error);
  }
}

export function severityEmoji(severity: Severity): string {
  switch (severity) {
    case "critical":
      return ":rotating_light:";
    case "warning":
      return ":warning:";
    default:
      return ":information_source:";
  }
}
