"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PostCardProps {
  hashtags: string[];
  index: number;
  platform: "X" | "Instagram" | "Threads";
  post: string;
}

export default function PostCard({
  hashtags,
  index,
  platform,
  post,
}: PostCardProps) {
  const [copiedBody, setCopiedBody] = useState(false);
  const [copiedTags, setCopiedTags] = useState(false);

  const formatTag = (tag: string) => (tag.startsWith("#") ? tag : `#${tag}`);
  const tagText = hashtags.map(formatTag).join(" ");
  const fullText = `${post}\n${tagText}`;
  const charCount = post.length;
  const guideText =
    platform === "Instagram" ? "Instagramは改行とタグの見せ方重視" : platform === "Threads" ? "Threadsは会話調を推奨" : "Xは短文向け";

  const handleCopyBody = async () => {
    await navigator.clipboard.writeText(fullText);
    setCopiedBody(true);
    setTimeout(() => setCopiedBody(false), 2000);
  };

  const handleCopyTags = async () => {
    await navigator.clipboard.writeText(tagText);
    setCopiedTags(true);
    setTimeout(() => setCopiedTags(false), 2000);
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              #{index + 1}
            </span>
            <span className="text-xs text-muted-foreground">{platform}</span>
          </div>
          <span className="text-xs text-muted-foreground">{charCount}文字</span>
        </div>

        <p className="mb-3 text-sm leading-relaxed whitespace-pre-line">{post}</p>

        <div className="mb-3 flex flex-wrap gap-2">
          {hashtags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-blue-50 px-2 py-1 text-xs text-[#2563EB]"
            >
              {formatTag(tag)}
            </span>
          ))}
        </div>

        <p className="mb-4 text-xs text-muted-foreground">{guideText}</p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant="outline" size="sm" onClick={handleCopyBody}>
            {copiedBody ? "本文をコピー済み" : "本文とタグをコピー"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopyTags}>
            {copiedTags ? "タグをコピー済み" : "タグだけコピー"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
