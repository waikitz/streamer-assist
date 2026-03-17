"use client";

import { usePathname, useRouter } from "next/navigation";
import { useUpload } from "../context/UploadContext";

const tabs = [
  { href: "/", icon: "🔍", label: "搜索" },
  { href: "/categories", icon: "📚", label: "分类" },
  { href: "/broadcast", icon: "🎙️", label: "今日台本" },
  { href: "/admin", icon: "⚙️", label: "管理" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { uploading } = useUpload();

  const handleNav = (href: string) => {
    if (uploading && href !== pathname) {
      const ok = window.confirm("文件正在分析中，离开此页面会中断分析过程，确定要离开吗？");
      if (!ok) return;
    }
    router.push(href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-pink-100 z-50">
      {/* Upload-in-progress banner */}
      {uploading && (
        <div className="bg-violet-500 text-white text-xs text-center py-1.5 flex items-center justify-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          AI 分析中，请勿切换页面
        </div>
      )}
      <div className="max-w-2xl mx-auto flex">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          return (
            <button
              key={tab.href}
              onClick={() => handleNav(tab.href)}
              className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors ${
                isActive ? "text-pink-500" : "text-gray-400"
              } ${uploading && tab.href !== "/admin" ? "opacity-50" : ""}`}
            >
              <span className="text-[22px] leading-none">{tab.icon}</span>
              <span className={`font-medium ${tab.label.length > 2 ? "text-[9px]" : "text-[10px]"}`}>{tab.label}</span>
            </button>
          );
        })}
      </div>
      <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
    </nav>
  );
}
