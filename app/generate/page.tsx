"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import GenerateForm, {
  INITIAL_FORM_DATA,
  normalizeFormData,
  type FormData,
} from "@/components/GenerateForm";
import PostCard from "@/components/PostCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  generateHashtagGroups,
  generateSamplePosts,
  type HashtagGroup,
  type PostItem,
} from "@/lib/mock-posts";

interface HistoryEntry {
  createdAt: string;
  formData: FormData;
  id: string;
  posts: PostItem[];
  source: "api" | "sample";
}

const HISTORY_STORAGE_KEY = "autospark-history-v1";
const MAX_HISTORY_ITEMS = 5;

const formatTag = (tag: string) => (tag.startsWith("#") ? tag : `#${tag}`);

function createHistoryEntry(
  formData: FormData,
  posts: PostItem[],
  source: HistoryEntry["source"]
): HistoryEntry {
  return {
    createdAt: new Date().toISOString(),
    formData,
    id: `${Date.now()}-${source}`,
    posts,
    source,
  };
}

function normalizeHistoryEntry(value: unknown): HistoryEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as Partial<HistoryEntry> & { formData?: Partial<FormData> };
  if (!Array.isArray(entry.posts) || typeof entry.createdAt !== "string" || typeof entry.id !== "string") {
    return null;
  }

  return {
    createdAt: entry.createdAt,
    formData: normalizeFormData(entry.formData),
    id: entry.id,
    posts: entry.posts,
    source: entry.source === "api" ? "api" : "sample",
  };
}

function readHistory() {
  if (typeof window === "undefined") {
    return [] as HistoryEntry[];
  }

  try {
    const rawValue = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeHistoryEntry(item))
      .filter((item): item is HistoryEntry => item !== null);
  } catch {
    return [];
  }
}

function persistHistory(entries: HistoryEntry[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function GeneratePage() {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [error, setError] = useState("");
  const [allCopied, setAllCopied] = useState(false);
  const [tagsCopied, setTagsCopied] = useState(false);

  useEffect(() => {
    setHistory(readHistory());
  }, []);

  const allText = useMemo(
    () =>
      posts
        .map((post) => `${post.post}\n${post.hashtags.map(formatTag).join(" ")}`)
        .join("\n\n---\n\n"),
    [posts]
  );

  const hashtagGroups = useMemo<HashtagGroup[]>(
    () => generateHashtagGroups(formData),
    [formData]
  );

  const allTagsText = useMemo(
    () =>
      hashtagGroups
        .flatMap((group) => group.tags)
        .map(formatTag)
        .join(" "),
    [hashtagGroups]
  );

  const averageChars = useMemo(() => {
    if (posts.length === 0) {
      return 0;
    }

    const totalChars = posts.reduce((sum, post) => {
      return sum + post.post.length;
    }, 0);

    return Math.round(totalChars / posts.length);
  }, [posts]);

  const pushHistory = (entry: HistoryEntry) => {
    setHistory((currentHistory) => {
      const nextHistory = [entry, ...currentHistory].slice(0, MAX_HISTORY_ITEMS);
      persistHistory(nextHistory);
      return nextHistory;
    });
  };

  const applyResults = (
    nextFormData: FormData,
    nextPosts: PostItem[],
    source: HistoryEntry["source"]
  ) => {
    setFormData(nextFormData);
    setPosts(nextPosts);
    setError("");
    pushHistory(createHistoryEntry(nextFormData, nextPosts, source));
  };

  const handleGenerate = async (nextFormData: FormData) => {
    setIsLoading(true);
    setError("");
    setPosts([]);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextFormData),
      });

      const result = (await response.json()) as { error?: string; posts?: PostItem[] };

      if (!response.ok || !result.posts) {
        throw new Error(result.error || "Failed to generate posts");
      }

      applyResults(nextFormData, result.posts, "api");
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateSample = () => {
    const nextPosts = generateSamplePosts(formData);
    applyResults(formData, nextPosts, "sample");
  };

  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(allText);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  };

  const handleCopyTags = async () => {
    await navigator.clipboard.writeText(allTagsText);
    setTagsCopied(true);
    setTimeout(() => setTagsCopied(false), 2000);
  };

  const handleDownloadText = () => {
    downloadFile("autospark-posts.txt", allText, "text/plain;charset=utf-8");
  };

  const handleDownloadJson = () => {
    downloadFile(
      "autospark-posts.json",
      JSON.stringify(posts, null, 2),
      "application/json;charset=utf-8"
    );
  };

  const handleRestoreHistory = (entry: HistoryEntry) => {
    setFormData(entry.formData);
    setPosts(entry.posts);
    setError("");
  };

  const handleReset = () => {
    setFormData(INITIAL_FORM_DATA);
    setPosts([]);
    setError("");
  };

  const handleClearHistory = () => {
    setHistory([]);
    persistHistory([]);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/">
            <h1 className="text-2xl font-bold">
              <span className="text-[#2563EB]">Auto</span>
              <span className="text-[#F97316]">Spark</span>
            </h1>
          </Link>
          <span className="text-sm text-muted-foreground">
            Instagram と X の文面検討に対応
          </span>
        </div>
      </header>

      <main className="mx-auto flex-1 max-w-6xl w-full px-4 py-8">
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="space-y-6">
            <div>
              <h2 className="mb-2 text-2xl font-bold">投稿案を作る</h2>
              <p className="text-sm text-muted-foreground">
                プラットフォームと投稿タイプを選ぶと、本文だけでなくタグ候補もまとめて確認できます。
              </p>
            </div>

            <GenerateForm
              hasResults={posts.length > 0}
              isLoading={isLoading}
              onChange={setFormData}
              onReset={handleReset}
              onSample={handleGenerateSample}
              onSubmit={handleGenerate}
              value={formData}
            />

            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">ハッシュタグ候補</h3>
                    <p className="text-sm text-muted-foreground">
                      プラットフォームとターゲットに合わせて自動でまとめています。
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCopyTags}>
                    {tagsCopied ? "タグをコピー済み" : "タグだけコピー"}
                  </Button>
                </div>

                <div className="space-y-3">
                  {hashtagGroups.map((group) => (
                    <div key={group.label} className="rounded-lg border p-4">
                      <p className="mb-3 text-sm font-medium">{group.label}</p>
                      {group.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {group.tags.map((tag) => (
                            <span
                              key={`${group.label}-${tag}`}
                              className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-[#2563EB]"
                            >
                              {formatTag(tag)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          フォーム入力後に候補を表示します。
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {history.length > 0 && (
              <Card>
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">最近の生成履歴</h3>
                      <p className="text-sm text-muted-foreground">
                        直近 {history.length} 件をこのブラウザに保存しています。
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleClearHistory}>
                      履歴を消去
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {history.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium">{entry.formData.platform}</span>
                            <span className="text-muted-foreground">/</span>
                            <span>{entry.formData.postType}</span>
                            <span className="text-muted-foreground">/</span>
                            <span>{entry.formData.industry}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{entry.formData.target}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(entry.createdAt).toLocaleString("ja-JP")} ・
                            {entry.source === "api" ? " API生成" : " サンプル"} ・
                            {entry.posts.length}本
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestoreHistory(entry)}
                        >
                          復元
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold">生成結果</h2>
                <p className="text-sm text-muted-foreground">
                  本文、タグ、履歴を分けて扱えるようにしています。
                </p>
              </div>
              {posts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopyAll}>
                    {allCopied ? "本文をコピー済み" : "本文をまとめてコピー"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadText}>
                    TXT保存
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadJson}>
                    JSON保存
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPosts([]);
                      setError("");
                    }}
                  >
                    結果をクリア
                  </Button>
                </div>
              )}
            </div>

            {posts.length > 0 && (
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">投稿先</p>
                    <p className="mt-1 text-xl font-semibold">{formData.platform}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">投稿タイプ</p>
                    <p className="mt-1 text-base font-semibold">{formData.postType}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">平均本文文字数</p>
                    <p className="mt-1 text-xl font-semibold">{averageChars}</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            {isLoading && (
              <div className="flex flex-col items-center justify-center py-20">
                <svg
                  className="mb-4 h-10 w-10 animate-spin text-[#2563EB]"
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
                <p className="text-muted-foreground">投稿案を生成しています...</p>
              </div>
            )}

            {!isLoading && posts.length === 0 && !error && (
              <div className="rounded-lg border border-dashed py-20 text-center text-muted-foreground">
                <p className="mb-4 text-4xl">✨</p>
                <p>左のフォームから投稿先と投稿タイプを選んでください。</p>
                <p>サンプル生成だけでも、本文とタグ候補の検討まで進められます。</p>
              </div>
            )}

            {posts.length > 0 && (
              <div className="space-y-4">
                {posts.map((post, i) => (
                  <PostCard
                    key={`${post.post}-${i}`}
                    index={i}
                    platform={formData.platform}
                    post={post.post}
                    hashtags={post.hashtags}
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
