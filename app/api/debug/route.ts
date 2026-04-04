import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return NextResponse.json({
    hasKey: !!apiKey,
    keyPrefix: apiKey ? apiKey.substring(0, 12) + "..." : "not set",
    keyLength: apiKey ? apiKey.length : 0,
  });
}
