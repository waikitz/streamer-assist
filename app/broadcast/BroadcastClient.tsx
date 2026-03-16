"use client";

import { useState, useEffect } from "react";
import { marked } from "marked";
import Link from "next/link";

interface Script {
  id: number;
  title: string;
  body: string;
  summary: string;
  tags: string[];
}

const USED_IDS_KEY = "broadcast_used_ids";

function loadUsedIds(): Set<number> {
  try {
    const raw = localStorage.getItem(USED_IDS_KEY);
    return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveUsedIds(ids: Set<number>) {
  try {
    localStorage.setItem(USED_IDS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

export default function BroadcastClient({ scripts }: { scripts: Script[] }) {
  const [usedIds, setUsedIds] = useState<Set<number>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "unused">("all");
  const [mounted, setMounted] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  useEffect(() => {
    setUsedIds(loadUsedIds());
    setMounted(true);
  }, []);

  const handleCopy = async (id: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  const toggleUsed = (id: number) => {
    setUsedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      saveUsedIds(next);
      return next;
    });
  };

  const resetUsed = () => {
    const empty = new Set<number>();
    setUsedIds(empty);
    saveUsedIds(empty);
  };

  const filtered = filter === "unused"
    ? scripts.filter((s) => !usedIds.has(s.id))
    : scripts;

  if (scripts.length === 0) {
    return (
      <div className="space-y-4">
        <div className="sticky top-0 bg-pink-50 z-10 py-3">
          <h1 className="font-bold text-gray-700">🎙️ 台本</h1>
        </div>
        <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm">
          <div className="text-4xl mb-3">🎙️</div>
          <p className="text-base font-medium text-gray-500">暂无口播稿</p>
          <p className="text-sm mt-1">请先在管理页上传分类为「口播稿」的内容</p>
          <Link
            href="/admin"
            className="inline-block mt-4 bg-pink-400 text-white px-6 py-2 rounded-full text-sm hover:bg-pink-500 transition-colors"
          >
            去上传内容
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="sticky top-0 bg-pink-50 z-10 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-gray-700">🎙️ 台本</h1>
          <div className="flex items-center gap-2">
            {/* Filter pills */}
            <div className="flex rounded-full border border-pink-200 overflow-hidden text-xs font-medium">
              <button
                onClick={() => setFilter("all")}
                className={`px-3 py-1.5 transition-colors ${
                  filter === "all" ? "bg-pink-400 text-white" : "bg-white text-pink-600"
                }`}
              >
                全部
              </button>
              <button
                onClick={() => setFilter("unused")}
                className={`px-3 py-1.5 transition-colors ${
                  filter === "unused" ? "bg-pink-400 text-white" : "bg-white text-pink-600"
                }`}
              >
                未用
              </button>
            </div>
            <button
              onClick={resetUsed}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              重置
            </button>
          </div>
        </div>
        {mounted && (
          <p className="text-xs text-gray-400">
            {scripts.length} 条口播稿 · 已用 {usedIds.size} 条
          </p>
        )}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-base font-medium text-gray-500">全部已用完</p>
          <button
            onClick={resetUsed}
            className="inline-block mt-4 bg-pink-400 text-white px-6 py-2 rounded-full text-sm hover:bg-pink-500 transition-colors"
          >
            重置已用标记
          </button>
        </div>
      ) : (
        filtered.map((item) => {
          const isUsed = usedIds.has(item.id);
          const isExpanded = expandedIds.has(item.id);
          return (
            <div
              key={item.id}
              className={`bg-white rounded-2xl shadow-sm border-2 transition-all ${
                isUsed
                  ? "opacity-60 border-green-200"
                  : isExpanded
                    ? "border-pink-200 shadow-md"
                    : "border-transparent hover:border-pink-100 hover:shadow-sm"
              }`}
            >
              {isExpanded ? (
                /* ── Expanded ── */
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-gray-800 leading-snug flex-1">
                      {item.title}
                    </h3>
                    {isUsed && (
                      <span className="flex-shrink-0 bg-green-100 text-green-600 text-xs px-2 py-0.5 rounded-full whitespace-nowrap font-medium">
                        ✓ 已用
                      </span>
                    )}
                  </div>

                  {item.body && (
                    <div
                      className="markdown-body text-sm"
                      dangerouslySetInnerHTML={{ __html: marked(item.body) as string }}
                    />
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-50">
                    <button
                      onClick={() => handleCopy(item.id, item.body)}
                      className="flex items-center gap-1 bg-pink-50 hover:bg-pink-100 border border-pink-200 text-pink-600 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                    >
                      {copiedId === item.id ? "✅ 已复制" : "📋 复制"}
                    </button>
                    <button
                      onClick={() => toggleUsed(item.id)}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      {isUsed ? "↩ 取消已用" : "✓ 标记已用"}
                    </button>
                    <button
                      onClick={() => toggleExpand(item.id)}
                      className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                    >
                      收起 <span className="text-base leading-none">↑</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Collapsed ── */
                <button
                  className="w-full text-left p-3 flex items-center justify-between gap-2"
                  onClick={() => toggleExpand(item.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2 flex-1">
                        {item.title}
                      </h3>
                      {isUsed && (
                        <span className="flex-shrink-0 bg-green-100 text-green-600 text-xs px-1.5 py-0.5 rounded-full font-medium">
                          ✓
                        </span>
                      )}
                    </div>
                    {item.summary && (
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{item.summary}</p>
                    )}
                  </div>
                  <span className="text-gray-300 text-lg flex-shrink-0">›</span>
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
