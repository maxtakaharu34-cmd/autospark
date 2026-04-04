import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

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

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const body: GenerateRequest = await request.json();
    const { industry, purpose, target, tone, count } = body;

    if (!industry || !purpose || !target || !tone || !count) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    const client = new Anthropic({ apiKey });

    const systemPrompt = `あなたはSNSマーケティングの専門家です。
以下の情報をもとに、X（Twitter）用の投稿文を${count}本生成してください。

業種：${industry}
目的：${purpose}
ターゲット：${target}
トーン：${tone}

条件：
- 各投稿は140文字以内
- 自然な日本語
- ハッシュタグを2〜3個つける
- 各投稿は内容が被らないようにする
- エンゲージメントを意識した構成にする

出力形式：
JSON配列で返してください。JSON以外のテキストは含めないでください。
[{"post": "投稿文", "hashtags": ["タグ1", "タグ2"]}]`;

    const message = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: "上記の条件に従って投稿文を生成してください。",
        },
      ],
      system: systemPrompt,
    });

    // Extract text content from response
    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json(
        { error: "No text response from AI" },
        { status: 500 }
      );
    }

    // Parse JSON from response - handle markdown code blocks
    let jsonText = textContent.text.trim();
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    }

    const posts: PostItem[] = JSON.parse(jsonText);

    if (!Array.isArray(posts)) {
      return NextResponse.json(
        { error: "Invalid response format from AI" },
        { status: 500 }
      );
    }

    return NextResponse.json({ posts });
  } catch (error) {
    console.error("Generation error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: `Generation failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
