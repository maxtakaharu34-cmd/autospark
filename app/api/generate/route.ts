import { NextRequest, NextResponse } from "next/server";
import { callClaudeText, parseJsonFromClaude } from "@/lib/ai/anthropic";
import { buildLegacyGeneratePrompt } from "@/lib/ai/persona";
import { HttpError } from "@/lib/api/response";

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
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getClientIp(request: NextRequest) {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

function applyRateLimit(request: NextRequest) {
  const now = Date.now();
  rateLimitStore.forEach((v, k) => {
    if (v.resetAt <= now) rateLimitStore.delete(k);
  });
  const windowMs = parseIntegerEnv("GENERATE_RATE_LIMIT_WINDOW_MS", DEFAULT_RATE_LIMIT_WINDOW_MS);
  const maxRequests = parseIntegerEnv("GENERATE_RATE_LIMIT_MAX", DEFAULT_RATE_LIMIT_MAX);
  const ip = getClientIp(request);
  const entry = rateLimitStore.get(ip);
  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (entry.count >= maxRequests) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    throw new HttpError(429, `Too many requests. Try again in ${retryAfter} seconds.`);
  }
  entry.count += 1;
  rateLimitStore.set(ip, entry);
}

function validateOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allow = new Set(
    (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );
  allow.add(request.nextUrl.origin);
  if (!origin) {
    if (process.env.NODE_ENV === "development") return;
    throw new HttpError(403, "Origin header is required.");
  }
  if (!allow.has(origin)) throw new HttpError(403, "Request origin is not allowed.");
}

function validateStringField(value: unknown, name: string) {
  if (typeof value !== "string") throw new HttpError(400, `${name} must be a string.`);
  const v = value.trim();
  if (!v) throw new HttpError(400, `${name} is required.`);
  if (v.length > MAX_FIELD_LENGTH) {
    throw new HttpError(400, `${name} must be ${MAX_FIELD_LENGTH} characters or fewer.`);
  }
  return v;
}

function validateGenerateRequest(payload: unknown): GenerateRequest {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, "Invalid request body.");
  }
  const c = payload as Record<string, unknown>;
  const count = c.count;
  if (!Number.isInteger(count) || Number(count) < 1 || Number(count) > 7) {
    throw new HttpError(400, "count must be an integer between 1 and 7.");
  }
  return {
    industry: validateStringField(c.industry, "industry"),
    purpose: validateStringField(c.purpose, "purpose"),
    target: validateStringField(c.target, "target"),
    tone: validateStringField(c.tone, "tone"),
    count: Number(count),
  };
}

function normalizeHashtag(tag: string) {
  return tag.replace(/^#+/, "").trim();
}

function validateGeneratedPosts(payload: unknown, expected: number): PostItem[] {
  if (!Array.isArray(payload)) throw new HttpError(502, "AI response must be a JSON array.");
  if (payload.length === 0 || payload.length > expected) {
    throw new HttpError(502, "AI response returned an unexpected number of posts.");
  }
  return payload.map((item, i) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new HttpError(502, `Post ${i + 1} is invalid.`);
    }
    const c = item as { post?: unknown; hashtags?: unknown };
    if (typeof c.post !== "string" || !c.post.trim()) {
      throw new HttpError(502, `Post ${i + 1} is missing text.`);
    }
    if (c.post.trim().length > MAX_POST_LENGTH) {
      throw new HttpError(502, `Post ${i + 1} exceeds ${MAX_POST_LENGTH} characters.`);
    }
    if (!Array.isArray(c.hashtags)) {
      throw new HttpError(502, `Post ${i + 1} hashtags are invalid.`);
    }
    const hashtags = c.hashtags
      .filter((t): t is string => typeof t === "string")
      .map(normalizeHashtag)
      .filter(Boolean);
    if (hashtags.length === 0 || hashtags.length > MAX_HASHTAGS) {
      throw new HttpError(502, `Post ${i + 1} must include between 1 and ${MAX_HASHTAGS} hashtags.`);
    }
    return { post: c.post.trim(), hashtags };
  });
}

export async function POST(request: NextRequest) {
  try {
    validateOrigin(request);
    applyRateLimit(request);

    const raw = await request.text();
    if (!raw.trim()) return jsonError(400, "Request body is required.");
    if (Buffer.byteLength(raw, "utf8") > MAX_REQUEST_BYTES) {
      return jsonError(413, "Request body is too large.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Request body must be valid JSON.");
    }
    const input = validateGenerateRequest(parsed);

    const text = await callClaudeText({
      system: buildLegacyGeneratePrompt(input),
      maxTokens: 2048,
    });
    const posts = validateGeneratedPosts(parseJsonFromClaude<unknown>(text), input.count);

    return NextResponse.json({ posts }, { headers: { "Cache-Control": "no-store" } });
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
