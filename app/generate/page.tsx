"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import GenerateForm, { type FormData } from "@/components/GenerateForm";
import PostCard from "@/components/PostCard";

interface PostItem {
  post: string;
  hashtags: string[];
}

export default function GeneratePage() {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [allCopied, setAllCopied] = useState(false);

  const handleGenerate = async (data: FormData) => {
    setIsLoading(true);
    setError("");
    setPosts([]);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to generate posts");
      }

      setPosts(result.posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyAll = async () => {
    const allText = posts
      .map((p) => `${p.post} ${p.hashtags.map((t) => `#${t}`).join(" ")}`)
      .join("\n\n---\n\n");
    await navigator.clipboard.writeText(allText);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <h1 className="text-2xl font-bold">
              <span className="text-[#2563EB]">Auto</span>
              <span className="text-[#F97316]">Spark</span>
            </h1>
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-4 py-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Form */}
          <div>
            <h2 className="text-2xl font-bold mb-6">投稿を生成する</h2>
            <GenerateForm onSubmit={handleGenerate} isLoading={isLoading} />
          </div>

          {/* Right: Results */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">生成結果</h2>
              {posts.length > 0 && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopyAll}>
                    {allCopied ? "✓ コピー済み" : "全部コピー"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPosts([]);
                      setError("");
                    }}
                  >
                    もう一度生成
                  </Button>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm mb-4">
                {error}
              </div>
            )}

            {isLoading && (
              <div className="flex flex-col items-center justify-center py-20">
                <svg
                  className="animate-spin h-10 w-10 text-[#2563EB] mb-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <p className="text-muted-foreground">AIが投稿文を生成しています...</p>
              </div>
            )}

            {!isLoading && posts.length === 0 && !error && (
              <div className="text-center py-20 text-muted-foreground">
                <p className="text-4xl mb-4">✨</p>
                <p>左のフォームに情報を入力して</p>
                <p>「投稿を生成する」をクリックしてください</p>
              </div>
            )}

            {posts.length > 0 && (
              <div className="space-y-4">
                {posts.map((post, i) => (
                  <PostCard
                    key={i}
                    post={post.post}
                    hashtags={post.hashtags}
                    index={i}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
