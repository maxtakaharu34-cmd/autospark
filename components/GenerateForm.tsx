"use client";

import { useState } from "react";
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
  onSubmit: (data: FormData) => void;
  isLoading: boolean;
}

export interface FormData {
  industry: string;
  purpose: string;
  target: string;
  tone: string;
  count: number;
}

const INDUSTRIES = [
  "飲食店",
  "美容院",
  "整体院",
  "不動産",
  "アパレル",
  "その他",
];

const PURPOSES = ["集客", "採用", "ブランディング"];

const TONES = ["プロフェッショナル", "フレンドリー", "カジュアル"];

export default function GenerateForm({ onSubmit, isLoading }: GenerateFormProps) {
  const [industry, setIndustry] = useState("");
  const [purpose, setPurpose] = useState("");
  const [target, setTarget] = useState("");
  const [tone, setTone] = useState("");
  const [count, setCount] = useState(3);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ industry, purpose, target, tone, count });
  };

  const isValid = industry && purpose && target && tone;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Industry */}
      <div className="space-y-2">
        <Label htmlFor="industry">業種</Label>
        <Select value={industry} onValueChange={setIndustry}>
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

      {/* Purpose */}
      <div className="space-y-2">
        <Label>アカウントの目的</Label>
        <RadioGroup value={purpose} onValueChange={setPurpose} className="flex gap-4">
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

      {/* Target */}
      <div className="space-y-2">
        <Label htmlFor="target">ターゲット層</Label>
        <Input
          id="target"
          placeholder="例：30代女性、健康意識が高い"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
      </div>

      {/* Tone */}
      <div className="space-y-2">
        <Label htmlFor="tone">トーン</Label>
        <Select value={tone} onValueChange={setTone}>
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

      {/* Count */}
      <div className="space-y-2">
        <Label>生成本数: {count}本</Label>
        <Slider
          value={[count]}
          onValueChange={(value) => setCount(value[0])}
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

      {/* Submit */}
      <Button
        type="submit"
        disabled={!isValid || isLoading}
        className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] py-6 text-base"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg
              className="animate-spin h-5 w-5"
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
          "投稿を生成する"
        )}
      </Button>
    </form>
  );
}
