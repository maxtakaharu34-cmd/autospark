import { NextRequest, NextResponse } from "next/server";

interface GenerateRequest {
  industry: string;
  purpose: string;
  target: string;
  tone: string;
  count: number;
}

interface PostItem {
  post: string;
  hashtags: string[];
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const MAX_REQUEST_BYTES = 4096;
const MAX_FIELD_LENGTH = 120;
const MAX_POST_LENGTH = 140;
const MAX_HASHTAGS = 5;
const DEFAULT_RATE_LIMIT_MAX = 5;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function jsonError(status: number, error: string, headers?: HeadersInit) {
  return NextResponse.json({ error }, { status, headers });
}

function parseIntegerEnv(name: string, fallback: number) {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

function cleanupExpiredRateLimits(now: number) {
  rateLimitStore.forEach((value, key) => {
    if (value.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  });
}

function applyRateLimit(request: NextRequest) {
  const now = Date.now();
  cleanupExpiredRateLimits(now);

  const windowMs = parseIntegerEnv(
    "GENERATE_RATE_LIMIT_WINDOW_MS",
    DEFAULT_RATE_LIMIT_WINDOW_MS
  );
  const maxRequests = parseIntegerEnv(
    "GENERATE_RATE_LIMIT_MAX",
    DEFAULT_RATE_LIMIT_MAX
  );
  const ip = getClientIp(request);
  const existingEntry = rateLimitStore.get(ip);

  if (!existingEntry || existingEntry.resetAt <= now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (existingEntry.count >= maxRequests) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existingEntry.resetAt - now) / 1000)
    );

    throw new HttpError(
      429,
      `Too many requests. Try again in ${retryAfterSeconds} seconds.`
    );
  }

  existingEntry.count += 1;
  rateLimitStore.set(ip, existingEntry);
}

function validateOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowList = new Set(
    (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

  allowList.add(request.nextUrl.origin);

  if (!origin) {
    if (process.env.NODE_ENV === "development") {
      return;
    }

    throw new HttpError(403, "Origin header is required.");
  }

  if (!allowList.has(origin)) {
    throw new HttpError(403, "Request origin is not allowed.");
  }
}

function validateStringField(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw new HttpError(400, `${fieldName} must be a string.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new HttpError(400, `${fieldName} is required.`);
  }

  if (normalized.length > MAX_FIELD_LENGTH) {
    throw new HttpError(
      400,
      `${fieldName} must be ${MAX_FIELD_LENGTH} characters or fewer.`
    );
  }

  return normalized;
}

function validateGenerateRequest(payload: unknown): GenerateRequest {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, "Invalid request body.");
  }

  const candidate = payload as Record<string, unknown>;
  const count = candidate.count;

  if (!Number.isInteger(count) || Number(count) < 1 || Number(count) > 7) {
    throw new HttpError(400, "count must be an integer between 1 and 7.");
  }

  return {
    industry: validateStringField(candidate.industry, "industry"),
    purpose: validateStringField(candidate.purpose, "purpose"),
    target: validateStringField(candidate.target, "target"),
    tone: validateStringField(candidate.tone, "tone"),
    count: Number(count),
  };
}

function parseRequestBody(rawBody: string) {
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

function extractTextResponse(data: unknown) {
  if (!data || typeof data !== "object") {
    throw new HttpError(502, "AI provider returned an invalid response.");
  }

  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    throw new HttpError(502, "AI provider returned an invalid response.");
  }

  const textBlock = content.find(
    (item): item is { type: string; text: string } =>
      Boolean(
        item &&
          typeof item === "object" &&
          (item as { type?: unknown }).type === "text" &&
          typeof (item as { text?: unknown }).text === "string"
      )
  );

  if (!textBlock) {
    throw new HttpError(502, "AI provider returned no text content.");
  }

  return textBlock.text.trim();
}

function parsePostPayload(text: string) {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = codeBlockMatch ? codeBlockMatch[1].trim() : text;

  try {
    return JSON.parse(jsonText) as unknown;
  } catch {
    throw new HttpError(502, "AI response was not valid JSON.");
  }
}

function normalizeHashtag(tag: string) {
  return tag.replace(/^#+/, "").trim();
}

function validateGeneratedPosts(payload: unknown, expectedCount: number): PostItem[] {
  if (!Array.isArray(payload)) {
    throw new HttpError(502, "AI response must be a JSON array.");
  }

  if (payload.length === 0 || payload.length > expectedCount) {
    throw new HttpError(502, "AI response returned an unexpected number of posts.");
  }

  return payload.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new HttpError(502, `Post ${index + 1} is invalid.`);
    }

    const candidate = item as { post?: unknown; hashtags?: unknown };

    if (typeof candidate.post !== "string" || !candidate.post.trim()) {
      throw new HttpError(502, `Post ${index + 1} is missing text.`);
    }

    if (candidate.post.trim().length > MAX_POST_LENGTH) {
      throw new HttpError(502, `Post ${index + 1} exceeds ${MAX_POST_LENGTH} characters.`);
    }

    if (!Array.isArray(candidate.hashtags)) {
      throw new HttpError(502, `Post ${index + 1} hashtags are invalid.`);
    }

    const hashtags = candidate.hashtags
      .filter((tag): tag is string => typeof tag === "string")
      .map(normalizeHashtag)
      .filter(Boolean);

    if (hashtags.length === 0 || hashtags.length > MAX_HASHTAGS) {
      throw new HttpError(
        502,
        `Post ${index + 1} must include between 1 and ${MAX_HASHTAGS} hashtags.`
      );
    }

    return {
      post: candidate.post.trim(),
      hashtags,
    };
  });
}

function buildSystemPrompt(input: GenerateRequest) {
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
    `- Include 1 to ${MAX_HASHTAGS} relevant hashtags for each post.`,
    "- Make each post concrete, engaging, and suitable for X.",
    "- Avoid markdown, numbering, commentary, and duplicate ideas.",
    "",
    'Return JSON only in this format: [{"post":"...","hashtags":["tag1","tag2"]}]',
  ].join("\n");
}

async function generatePosts(input: GenerateRequest, apiKey: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: buildSystemPrompt(input),
      messages: [
        {
          role: "user",
          content: "Return the result now.",
        },
      ],
    }),
  });

  const data = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    console.error("Anthropic API error", {
      status: response.status,
      body: data,
    });
    throw new HttpError(502, "Generation request failed.");
  }

  const text = extractTextResponse(data);
  const parsedPayload = parsePostPayload(text);
  return validateGeneratedPosts(parsedPayload, input.count);
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === "your_key_here") {
      console.error("Generation unavailable: missing ANTHROPIC_API_KEY");
      return jsonError(503, "The generation service is currently unavailable.");
    }

    validateOrigin(request);
    applyRateLimit(request);

    const rawBody = await request.text();
    if (!rawBody.trim()) {
      return jsonError(400, "Request body is required.");
    }

    if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BYTES) {
      return jsonError(413, "Request body is too large.");
    }

    const payload = parseRequestBody(rawBody);
    const input = validateGenerateRequest(payload);
    const posts = await generatePosts(input, apiKey);

    return NextResponse.json(
      { posts },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    if (error instanceof HttpError) {
      const headers =
        error.status === 429
          ? { "Retry-After": String(parseIntegerEnv("GENERATE_RATE_LIMIT_WINDOW_MS", DEFAULT_RATE_LIMIT_WINDOW_MS) / 1000) }
          : undefined;
      return jsonError(error.status, error.message, headers);
    }

    console.error("Generation error:", error);
    return jsonError(500, "Unexpected server error.");
  }
}
