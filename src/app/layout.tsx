import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./farm.css";

export const metadata: Metadata = {
  title: "Mikan · 農繁期の業務アシスタント",
  description: "注文、収穫、配送をつなぎ、農繁期の仕事をスムーズに。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
