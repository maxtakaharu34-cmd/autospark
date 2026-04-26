import type { FormData } from "@/components/GenerateForm";

export interface PostItem {
  post: string;
  hashtags: string[];
}

export interface HashtagGroup {
  label: string;
  tags: string[];
}

const OPENERS = {
  プロフェッショナル: [
    "今見直したいポイントは",
    "成果につながりやすいのは",
    "まず伝えたいのは",
  ],
  フレンドリー: [
    "最近よく聞かれるのが",
    "気軽に試してほしいのが",
    "今のうちに知ってほしいのが",
  ],
  カジュアル: [
    "ちょっと気分を変えるなら",
    "ふと立ち寄りたくなるのは",
    "今日はこんな見方がおすすめ",
  ],
} as const;

const CTA_LINES = {
  集客: ["気になったら保存して、来店前に見返してみてください。", "まずは気軽にチェックしてみてください。"],
  採用: ["雰囲気が合いそうなら、募集内容も見てみてください。", "働き方のイメージが合う方はぜひチェックしてください。"],
  ブランディング: ["共感したら保存して、次の投稿も見てもらえるとうれしいです。", "ブランドの空気感として受け取ってもらえたらうれしいです。"],
} as const;

const INDUSTRY_LINES = {
  飲食店: "季節メニューや来店タイミングを想像しやすい切り口にしています。",
  美容院: "施術後のイメージが浮かびやすい言い回しを入れています。",
  整体院: "悩みの言語化と安心感が伝わる流れを意識しています。",
  不動産: "比較検討中でも相談しやすい入口を残しています。",
  アパレル: "着用シーンが浮かぶように見せ方を組んでいます。",
  その他: "短い文でもサービスの違いが伝わるように整えています。",
} as const;

const POST_TYPE_LINES = {
  商品紹介: "おすすめポイントが一目で伝わる順番にしています。",
  キャンペーン告知: "見逃しにくいように条件と行動導線を前に出しています。",
  お客様の声: "第三者目線の安心感が出る構成に寄せています。",
  豆知識: "読み終わったあとに誰かへ話したくなる情報量に寄せています。",
  舞台裏: "現場の温度感が伝わる見せ方を意識しています。",
} as const;

function hashText(value: string) {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }

  return hash;
}

function pick<T>(items: readonly T[], seed: number) {
  return items[seed % items.length];
}

function uniqueTags(tags: string[]) {
  return Array.from(new Set(tags.filter(Boolean)));
}

function normalizeTag(tag: string) {
  return tag.replace(/^#+/, "").replace(/\s+/g, "");
}

function extractTargetKeywords(target: string) {
  return target
    .split(/[、,/\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.slice(0, 18))
    .slice(0, 4);
}

function buildHashtags(formData: FormData, index: number) {
  const keywords = extractTargetKeywords(formData.target);
  const baseTags = [
    formData.industry,
    formData.postType,
    formData.purpose,
    formData.platform,
    formData.tone,
    keywords[index % Math.max(keywords.length, 1)] ?? "おすすめ",
  ];

  const maxTags = formData.platform === "Instagram" ? 8 : formData.platform === "Threads" ? 5 : 4;

  return uniqueTags(baseTags.map(normalizeTag)).slice(0, maxTags);
}

function buildCaption(formData: FormData, seed: number) {
  const opener =
    pick(
      OPENERS[formData.tone as keyof typeof OPENERS] ?? OPENERS.フレンドリー,
      seed
    );
  const industryLine =
    INDUSTRY_LINES[formData.industry as keyof typeof INDUSTRY_LINES] ?? INDUSTRY_LINES.その他;
  const typeLine =
    POST_TYPE_LINES[formData.postType as keyof typeof POST_TYPE_LINES] ?? POST_TYPE_LINES.商品紹介;
  const cta =
    pick(
      CTA_LINES[formData.purpose as keyof typeof CTA_LINES] ?? CTA_LINES.集客,
      seed + 11
    );

  if (formData.platform === "Instagram") {
    return [
      `${opener}、${formData.target}に向けた${formData.industry}の${formData.postType}投稿です。`,
      `${industryLine} ${typeLine}`,
      cta,
    ].join("\n\n");
  }

  if (formData.platform === "Threads") {
    return `${opener}、${formData.target}に向けた${formData.industry}の${formData.postType}投稿です。${industryLine} ${cta}`;
  }

  return `${opener}、${formData.target}に向けた${formData.industry}の${formData.postType}投稿です。${typeLine} ${cta}`;
}

export function generateHashtagGroups(formData: FormData): HashtagGroup[] {
  if (!formData.industry && !formData.postType && !formData.target && !formData.purpose) {
    return [
      { label: "定番タグ", tags: [] },
      { label: "検索タグ", tags: [] },
      { label: "行動タグ", tags: [] },
    ];
  }

  const keywords = extractTargetKeywords(formData.target);
  const broadTags = uniqueTags([
    formData.industry,
    formData.platform,
    formData.postType,
    formData.purpose,
  ]).map(normalizeTag);

  const nicheTags = uniqueTags([
    ...keywords,
    `${formData.industry}${formData.postType}`,
    formData.target ? `${formData.target.slice(0, 12)}向け` : "",
  ]).map(normalizeTag);

  const actionTags = uniqueTags([
    formData.tone,
    "保存推奨",
    "来店前チェック",
    formData.platform === "Instagram" ? "キャプション例" : "投稿例",
  ]).map(normalizeTag);

  return [
    { label: "定番タグ", tags: broadTags.slice(0, 4) },
    { label: "検索タグ", tags: nicheTags.slice(0, 4) },
    { label: "行動タグ", tags: actionTags.slice(0, 4) },
  ];
}

export function generateSamplePosts(formData: FormData): PostItem[] {
  const baseSeed = hashText(
    [
      formData.platform,
      formData.postType,
      formData.industry,
      formData.purpose,
      formData.target,
      formData.tone,
      String(formData.count),
    ].join(":")
  );

  return Array.from({ length: formData.count }, (_, index) => {
    const seed = baseSeed + index * 17;

    return {
      post: buildCaption(formData, seed),
      hashtags: buildHashtags(formData, index),
    };
  });
}
