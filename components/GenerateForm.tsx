"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface GenerateFormProps {
  hasResults: boolean;
  isLoading: boolean;
  onChange: (data: FormData) => void;
  onReset: () => void;
  onSample: () => void;
  onSubmit: (data: FormData) => void;
  value: FormData;
}

export interface FormData {
  platform: "X" | "Instagram" | "Threads";
  postType: string;
  industry: string;
  purpose: string;
  target: string;
  tone: string;
  count: number;
}

const PLATFORM_OPTIONS: FormData["platform"][] = ["X", "Instagram", "Threads"];
const POST_TYPES = ["商品紹介", "キャンペーン告知", "お客様の声", "豆知識", "舞台裏"];
const INDUSTRIES = ["飲食店", "美容院", "整体院", "不動産", "アパレル", "その他"];
const PURPOSES = ["集客", "採用", "ブランディング"];
const TONES = ["プロフェッショナル", "フレンドリー", "カジュアル"];

const PRESETS: Array<{ label: string; value: FormData }> = [
  {
    label: "インスタ集客",
    value: {
      platform: "Instagram",
      postType: "商品紹介",
      industry: "飲食店",
      purpose: "集客",
      target: "20代後半から30代前半の会社員、ランチ需要が高い",
      tone: "フレンドリー",
      count: 3,
    },
  },
  {
    label: "リール告知",
    value: {
      platform: "Instagram",
      postType: "キャンペーン告知",
      industry: "美容院",
      purpose: "集客",
      target: "30代女性、落ち着いた美容院を探している",
      tone: "プロフェッショナル",
      count: 3,
    },
  },
  {
    label: "X短文",
    value: {
      platform: "X",
      postType: "豆知識",
      industry: "整体院",
      purpose: "ブランディング",
      target: "デスクワーク中心で肩こりに悩む会社員",
      tone: "カジュアル",
      count: 4,
    },
  },
];

export const INITIAL_FORM_DATA: FormData = {
  platform: "Instagram",
  postType: "",
  industry: "",
  purpose: "",
  target: "",
  tone: "",
  count: 3,
};

export function normalizeFormData(value?: Partial<FormData> | null): FormData {
  return {
    platform:
      value?.platform === "X" || value?.platform === "Threads"
        ? value.platform
        : "Instagram",
    postType: value?.postType ?? "",
    industry: value?.industry ?? "",
    purpose: value?.purpose ?? "",
    target: value?.target ?? "",
    tone: value?.tone ?? "",
    count:
      typeof value?.count === "number" && value.count >= 1 && value.count <= 7
        ? value.count
        : 3,
  };
}

export default function GenerateForm({
  hasResults,
  isLoading,
  onChange,
  onReset,
  onSample,
  onSubmit,
  value,
}: GenerateFormProps) {
  const updateField = <K extends keyof FormData>(key: K, nextValue: FormData[K]) => {
    onChange({ ...value, [key]: nextValue });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(value);
  };

  const isValid =
    value.platform &&
    value.postType &&
    value.industry &&
    value.purpose &&
    value.target &&
    value.tone;

  const platformHint =
    value.platform === "Instagram"
      ? "改行入りの長めキャプションとタグ候補を優先します。"
      : value.platform === "Threads"
        ? "会話調で柔らかい書き出しを優先します。"
        : "短文で流し読みされやすい構成を優先します。";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-lg border bg-blue-50/60 p-4 text-sm text-slate-700">
        APIがなくても、SNSごとのサンプル本文とハッシュタグ候補をこの画面だけで確認できます。
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>クイックプリセット</Label>
          <span className="text-xs text-muted-foreground">入力をまとめて反映</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>投稿先</Label>
          <span className="text-xs text-muted-foreground">{platformHint}</span>
        </div>
        <RadioGroup
          value={value.platform}
          onValueChange={(nextValue) =>
            updateField("platform", nextValue as FormData["platform"])
          }
          className="grid grid-cols-3 gap-3"
        >
          {PLATFORM_OPTIONS.map((item) => (
            <Label
              key={item}
              htmlFor={`platform-${item}`}
              className="flex cursor-pointer items-center justify-center rounded-md border px-3 py-3 text-sm font-medium"
            >
              <RadioGroupItem value={item} id={`platform-${item}`} className="sr-only" />
              {item}
            </Label>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label htmlFor="postType">投稿タイプ</Label>
        <Select value={value.postType} onValueChange={(nextValue) => updateField("postType", nextValue)}>
          <SelectTrigger id="postType">
            <SelectValue placeholder="投稿タイプを選択してください" />
          </SelectTrigger>
          <SelectContent>
            {POST_TYPES.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="industry">業種</Label>
        <Select value={value.industry} onValueChange={(nextValue) => updateField("industry", nextValue)}>
          <SelectTrigger id="industry">
            <SelectValue placeholder="業種を選択してください" />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRIES.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>アカウントの目的</Label>
        <RadioGroup
          value={value.purpose}
          onValueChange={(nextValue) => updateField("purpose", nextValue)}
          className="flex flex-wrap gap-4"
        >
          {PURPOSES.map((item) => (
            <div key={item} className="flex items-center space-x-2">
              <RadioGroupItem value={item} id={`purpose-${item}`} />
              <Label htmlFor={`purpose-${item}`} className="cursor-pointer">
                {item}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="target">ターゲット層</Label>
          <span className="text-xs text-muted-foreground">{value.target.length}/120</span>
        </div>
        <Input
          id="target"
          maxLength={120}
          placeholder="例：30代女性、落ち着いた空間で通いやすい店を探している"
          value={value.target}
          onChange={(e) => updateField("target", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tone">トーン</Label>
        <Select value={value.tone} onValueChange={(nextValue) => updateField("tone", nextValue)}>
          <SelectTrigger id="tone">
            <SelectValue placeholder="トーンを選択してください" />
          </SelectTrigger>
          <SelectContent>
            {TONES.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>生成本数: {value.count}本</Label>
        <Slider
          value={[value.count]}
          onValueChange={(nextValue) => updateField("count", nextValue[0] ?? 1)}
          min={1}
          max={7}
          step={1}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1本</span>
          <span>7本</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button
          type="submit"
          disabled={!isValid || isLoading}
          className="w-full bg-[#2563EB] py-6 text-base hover:bg-[#1d4ed8]"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg
                className="h-5 w-5 animate-spin"
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
              生成中...
            </span>
          ) : (
            "APIで生成する"
          )}
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={!isValid || isLoading}
          onClick={onSample}
          className="w-full py-6 text-base"
        >
          サンプルを表示
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" onClick={onReset}>
          入力をクリア
        </Button>
        {hasResults && (
          <span className="self-center text-xs text-muted-foreground">
            直近の結果は履歴に保存されます
          </span>
        )}
      </div>
    </form>
  );
}
