import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "萌萌的直播助手",
  description: "直播口播和音乐信息搜索查询助手",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-pink-50 min-h-screen">
        <header className="bg-gradient-to-r from-pink-400 to-rose-400 text-white shadow-md">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 font-bold text-lg">
              <span className="text-2xl">🌸</span>
              <span>萌萌的直播助手</span>
            </a>
            <nav className="flex gap-4 text-sm">
              <a href="/" className="hover:text-pink-100 transition-colors">搜索</a>
              <a href="/categories" className="hover:text-pink-100 transition-colors">分类</a>
              <a href="/admin" className="hover:text-pink-100 transition-colors">上传</a>
            </nav>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">
          {children}
        </main>
        <footer className="text-center text-xs text-gray-400 py-6">
          萌萌的直播助手 · 为直播而生
        </footer>
      </body>
    </html>
  );
}
