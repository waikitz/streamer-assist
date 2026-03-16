import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./markdown.css";
import BottomNav from "./components/BottomNav";
import { UploadProvider } from "./context/UploadContext";

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
        <UploadProvider>
          <header className="bg-gradient-to-r from-pink-400 to-rose-400 text-white shadow-md">
            <div className="max-w-2xl mx-auto px-4 py-3">
              <a href="/" className="flex items-center gap-2 font-bold text-lg">
                <span className="text-2xl">🌸</span>
                <span>萌萌的直播助手</span>
              </a>
            </div>
          </header>
          <main className="max-w-2xl mx-auto px-4 pt-4 pb-28">
            {children}
          </main>
          <BottomNav />
        </UploadProvider>
      </body>
    </html>
  );
}
