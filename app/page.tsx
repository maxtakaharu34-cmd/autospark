import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            <span className="text-[#2563EB]">Auto</span>
            <span className="text-[#F97316]">Spark</span>
          </h1>
          <Link href="/generate">
            <Button>無料で試す</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center">
        <div className="max-w-3xl mx-auto px-4 text-center py-24">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
            AIがあなたの
            <br />
            <span className="text-[#2563EB]">SNS</span>を
            <span className="text-[#F97316]">自動化</span>する
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto">
            業種・目的・ターゲットを入力するだけで、
            X（Twitter）向けの投稿文をAIが瞬時に生成します。
          </p>
          <Link href="/generate">
            <Button size="lg" className="text-lg px-8 py-6 bg-[#2563EB] hover:bg-[#1d4ed8]">
              無料で試す →
            </Button>
          </Link>

          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-20 text-left">
            <div className="p-6 rounded-lg border bg-card">
              <div className="text-3xl mb-3">⚡</div>
              <h3 className="font-semibold mb-2">瞬時に生成</h3>
              <p className="text-sm text-muted-foreground">
                数秒で最大7本の投稿文を自動生成。毎日の投稿作成にかかる時間を大幅に削減します。
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-card">
              <div className="text-3xl mb-3">🎯</div>
              <h3 className="font-semibold mb-2">ターゲット最適化</h3>
              <p className="text-sm text-muted-foreground">
                業種・目的・ターゲット層に合わせた投稿文を生成。エンゲージメントを最大化します。
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-card">
              <div className="text-3xl mb-3">📋</div>
              <h3 className="font-semibold mb-2">ワンクリックコピー</h3>
              <p className="text-sm text-muted-foreground">
                生成された投稿をワンクリックでコピー。そのままXに投稿できます。
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        &copy; 2024 AutoSpark. All rights reserved.
      </footer>
    </div>
  );
}
