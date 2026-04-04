"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PostCardProps {
  post: string;
  hashtags: string[];
  index: number;
}

export default function PostCard({ post, hashtags, index }: PostCardProps) {
  const [copied, setCopied] = useState(false);

  const fullText = `${post} ${hashtags.map((t) => `#${t}`).join(" ")}`;
  const charCount = fullText.length;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
            #{index + 1}
          </span>
          <span
            className={`text-xs ${charCount > 140 ? "text-red-500" : "text-muted-foreground"}`}
          >
            {charCount}/140文字
          </span>
        </div>

        <p className="text-sm leading-relaxed mb-3">{post}</p>

        <div className="flex flex-wrap gap-2 mb-4">
          {hashtags.map((tag) => (
            <span
              key={tag}
              className="text-xs text-[#2563EB] bg-blue-50 px-2 py-1 rounded"
            >
              #{tag}
            </span>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="w-full"
        >
          {copied ? "✓ コピーしました" : "コピー"}
        </Button>
      </CardContent>
    </Card>
  );
}
