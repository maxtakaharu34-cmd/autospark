import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AutoSpark - AIがあなたのSNSを自動化する",
  description:
    "X（Twitter）向けの投稿文をAIで自動生成。業種・目的・ターゲットに合わせた最適な投稿を瞬時に作成します。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
