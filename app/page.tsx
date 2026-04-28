import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/40">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            <span className="text-[#2563EB]">Auto</span>
            <span className="text-[#F97316]">Spark</span>
          </h1>
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">
              運営者ログイン
            </Link>
            <Link href="/generate">
              <Button>無料で試す</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-4xl mx-auto px-6 text-center pt-24 pb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-background text-xs font-medium text-muted-foreground mb-6">
            <span className="size-1.5 rounded-full bg-emerald-500"></span>
            SNS運用代行 SaaS — Beta
          </div>
          <h2 className="text-4xl sm:text-6xl font-bold tracking-tight mb-6">
            AIがあなたの
            <br />
            <span className="text-[#2563EB]">SNS</span>を
            <span className="text-[#F97316]">自動化</span>する
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
            業種・目的・ターゲットを入力するだけで、X や Instagram 向けの投稿文を AI が瞬時に生成。
            複数クライアントの予約投稿・引用RT・コメント返信までまとめて運用できます。
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/generate">
              <Button size="lg" className="text-base px-8 bg-[#2563EB] hover:bg-[#1d4ed8]">
                無料で試す →
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button size="lg" variant="outline" className="text-base px-8">
                ダッシュボードへ
              </Button>
            </Link>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-6 pb-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
            <Feature icon="⚡" title="瞬時に生成">
              数秒で最大7本の投稿文を自動生成。毎日の投稿作成にかかる時間を大幅に削減します。
            </Feature>
            <Feature icon="🎯" title="ターゲット最適化">
              業種・目的・ターゲット層に合わせた投稿文を生成。エンゲージメントを最大化します。
            </Feature>
            <Feature icon="📅" title="予約投稿 & 自動運用">
              X・Instagramの予約投稿、引用RT、コメント返信を Cron で自動化。Slack で日次レポート。
            </Feature>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        &copy; 2026 AutoSpark. All rights reserved.
      </footer>
    </div>
  );
}

function Feature({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="p-6 rounded-xl border bg-card hover:shadow-md transition">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}
