import type { PersonaConfig } from "@/lib/supabase/types";

const MAX_POST_LENGTH = 140;

/** Build the system prompt for a Claude call that must respect a client persona. */
export function buildPersonaSystemPrompt(
  persona: PersonaConfig,
  task: string,
): string {
  const forbidden = persona.forbidden_words.length
    ? `Forbidden words (never include): ${persona.forbidden_words.join(", ")}`
    : "Forbidden words: (none)";
  return [
    "You are a Japanese social media copywriter writing on behalf of a client.",
    `Voice: ${persona.voice}`,
    `Character traits: ${persona.character}`,
    forbidden,
    persona.notes ? `Additional notes: ${persona.notes}` : "",
    "",
    "Hard rules:",
    `- Output natural Japanese, no longer than ${MAX_POST_LENGTH} characters per post (excluding hashtags).`,
    "- No markdown fences, no numbering, no commentary outside the JSON payload.",
    "- Never include any forbidden word.",
    "",
    `Task: ${task}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** System prompt for the legacy public /api/generate endpoint (no persona). */
export function buildLegacyGeneratePrompt(input: {
  industry: string;
  purpose: string;
  target: string;
  tone: string;
  count: number;
}): string {
  return [
    "You are a Japanese social media copywriter.",
    `Generate ${input.count} distinct Japanese X posts for the following campaign.`,
    `Industry: ${input.industry}`,
    `Purpose: ${input.purpose}`,
    `Target audience: ${input.target}`,
    `Tone: ${input.tone}`,
    "",
    "Rules:",
    `- Each post must be natural Japanese and no longer than ${MAX_POST_LENGTH} characters before hashtags.`,
    "- Include 1 to 5 relevant hashtags for each post.",
    "- Make each post concrete, engaging, and suitable for X.",
    "- Avoid markdown, numbering, commentary, and duplicate ideas.",
    "",
    'Return JSON only in this format: [{"post":"...","hashtags":["tag1","tag2"]}]',
  ].join("\n");
}
