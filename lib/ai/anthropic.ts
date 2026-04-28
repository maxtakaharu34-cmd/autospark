import { HttpError } from "@/lib/api/response";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export interface AnthropicCallOptions {
  system: string;
  userMessage?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/** Calls the Anthropic Messages API and returns the first text block. */
export async function callClaudeText(opts: AnthropicCallOptions): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    throw new HttpError(503, "Generation service is unavailable.", "critical");
  }

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature,
      system: opts.system,
      messages: [
        { role: "user", content: opts.userMessage ?? "Return the result now." },
      ],
    }),
  });

  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    console.error("Anthropic API error", { status: response.status, body: data });
    throw new HttpError(502, "Generation request failed.", "warning");
  }
  return extractText(data);
}

/** Parse a JSON body from a Claude text response, tolerating markdown fences. */
export function parseJsonFromClaude<T>(text: string): T {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const json = match ? match[1].trim() : text;
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new HttpError(502, "AI response was not valid JSON.", "warning");
  }
}

function extractText(data: unknown): string {
  if (!data || typeof data !== "object") {
    throw new HttpError(502, "AI provider returned an invalid response.", "warning");
  }
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    throw new HttpError(502, "AI provider returned an invalid response.", "warning");
  }
  const block = content.find(
    (item): item is { type: string; text: string } =>
      Boolean(
        item &&
          typeof item === "object" &&
          (item as { type?: unknown }).type === "text" &&
          typeof (item as { text?: unknown }).text === "string",
      ),
  );
  if (!block) {
    throw new HttpError(502, "AI provider returned no text content.", "warning");
  }
  return block.text.trim();
}
