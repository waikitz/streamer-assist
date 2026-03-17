"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { marked } from "marked";

interface ContentResult {
  id: number;
  title: string;
  summary: string;
  body: string;
  category_name: string;
  tags: string[];
  source_filename: string;
  created_at: string;
}

interface SearchHistory {
  query: string;
  category?: string;
  timestamp: number;
  results: ContentResult[];
}

const HISTORY_KEY = "streamer_search_history";
const MAX_HISTORY = 20;

function loadHistory(): SearchHistory[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: SearchHistory[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {
    // ignore
  }
}

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [results, setResults] = useState<ContentResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [history, setHistory] = useState<SearchHistory[]>([]);
  const [inScriptIds, setInScriptIds] = useState<Set<number>>(new Set());
  const [scriptToast, setScriptToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories?.map((c: { name: string }) => c.name) || []);
      })
      .catch(() => {});
    fetch("/api/today-script?ids_only=1")
      .then((r) => r.json())
      .then((d: { contentIds?: number[] }) => {
        if (Array.isArray(d.contentIds)) setInScriptIds(new Set(d.contentIds));
      })
      .catch(() => {});
  }, []);

  const doSearch = useCallback(async (q: string, cat: string) => {
    if (!q.trim() && !cat) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (cat) params.set("category", cat);
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      const newResults: ContentResult[] = data.results || [];
      setResults(newResults);

      if (q.trim() || cat) {
        const entry: SearchHistory = {
          query: q.trim(),
          category: cat || undefined,
          timestamp: Date.now(),
          results: newResults,
        };
        const updatedHistory = loadHistory();
        const filtered = [
          entry,
          ...updatedHistory.filter(
            (h) => !(h.query === entry.query && h.category === entry.category)
          ),
        ];
        setHistory(filtered);
        saveHistory(filtered);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced auto-search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query && !category) {
      setResults(null);
      return;
    }
    if (query.length === 0 && !category) return;
    debounceRef.current = setTimeout(() => {
      doSearch(query, category);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, category, doSearch]);

  const restoreHistory = (h: SearchHistory) => {
    setQuery(h.query);
    setCategory(h.category || "");
    setResults(h.results);
  };

  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCopy = async (id: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleToggleScript = useCallback(async (id: number) => {
    const alreadyIn = inScriptIds.has(id);
    setInScriptIds((prev) => {
      const next = new Set(prev);
      alreadyIn ? next.delete(id) : next.add(id);
      return next;
    });
    try {
      if (alreadyIn) {
        await fetch("/api/today-script", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentIds: [id] }),
        });
        setScriptToast("✅ 已从今日台本移出");
      } else {
        await fetch("/api/today-script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentIds: [id] }),
        });
        setScriptToast("✅ 已加入今日台本");
      }
    } catch {
      setInScriptIds((prev) => {
        const next = new Set(prev);
        alreadyIn ? next.add(id) : next.delete(id);
        return next;
      });
      setScriptToast("❌ 操作失败，请重试");
    }
    setTimeout(() => setScriptToast(null), 2500);
  }, [inScriptIds]);

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入关键词搜索..."
          className="w-full border border-pink-200 rounded-2xl px-4 py-3 pr-10 text-base focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white shadow-sm"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-pink-400 text-sm animate-spin">
            ◌
          </span>
        )}
        {query && !loading && (
          <button
            type="button"
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Category chips */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            onClick={() => setCategory("")}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              category === ""
                ? "bg-pink-400 text-white"
                : "bg-white border border-pink-200 text-pink-600"
            }`}
          >
            全部
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === c
                  ? "bg-pink-400 text-white"
                  : "bg-white border border-pink-200 text-pink-600"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Search history chips */}
      {query === "" && results === null && history.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium">历史搜索</span>
            <button
              onClick={clearHistory}
              className="text-xs text-red-400 hover:text-red-600"
            >
              清除历史
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {history.slice(0, 8).map((h, i) => (
              <button
                key={i}
                onClick={() => restoreHistory(h)}
                className="flex-shrink-0 bg-white border border-pink-100 text-pink-600 text-xs px-3 py-1.5 rounded-full hover:bg-pink-50 transition-colors shadow-sm"
              >
                🕐 {(h.query || `[${h.category}]`).slice(0, 10)}
                {(h.query || `[${h.category || ""}]`).length > 10 ? "…" : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Script toast */}
      {scriptToast && (
        <div className={`text-xs text-center px-3 py-2 rounded-xl font-medium sticky top-0 z-10 ${
          scriptToast.startsWith("❌") ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600"
        }`}>
          {scriptToast}
        </div>
      )}

      {/* Results */}
      {results !== null && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500">
              找到 {results.length} 条结果
            </h2>
            <button
              onClick={() => { setResults(null); setQuery(""); setCategory(""); }}
              className="text-xs text-pink-400 hover:text-pink-600"
            >
              清除结果
            </button>
          </div>

          {results.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-base">没有找到相关内容</p>
              <p className="text-sm mt-1">试试其他关键词吧</p>
            </div>
          ) : (
            results.map((item) => {
              const inScript = inScriptIds.has(item.id);
              const isExpanded = expandedIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`relative rounded-2xl shadow-sm border-2 transition-all ${
                    isExpanded
                      ? "bg-white border-pink-200 shadow-md"
                      : inScript
                        ? "bg-green-50 border-green-200 hover:border-green-300 cursor-pointer"
                        : "bg-white border-transparent hover:border-pink-100 hover:shadow-sm cursor-pointer"
                  }`}
                  onClick={() => { if (!isExpanded) toggleExpand(item.id); }}
                >
                  {isExpanded ? (
                    /* ── Expanded ── */
                    <div className="p-4">
                      {/* Title row with top-right collapse button */}
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-base font-semibold text-gray-800 leading-snug flex-1">
                          {item.title}
                        </h3>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
                          className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5 border border-gray-200 px-2 py-1 rounded-lg -mt-0.5"
                        >
                          收起 <span className="text-sm leading-none">↑</span>
                        </button>
                      </div>
                      {/* Category badge */}
                      {item.category_name && (
                        <p className="text-xs text-pink-400 font-medium mt-1">{item.category_name}</p>
                      )}
                      {/* Source filename */}
                      {item.source_filename && (
                        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                          <span>📄</span>
                          <span className="truncate">{item.source_filename}</span>
                        </p>
                      )}
                      {/* Tags */}
                      {item.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {item.tags.slice(0, 4).map((tag) => (
                            <span key={tag} className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Body */}
                      {item.body && (
                        <div className="border-t border-gray-50 mt-3 pt-3">
                          <div
                            className="markdown-body text-sm"
                            dangerouslySetInnerHTML={{ __html: marked(item.body) as string }}
                          />
                        </div>
                      )}
                      {/* Action row */}
                      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-50 flex-wrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCopy(item.id, item.body); }}
                          className="flex items-center gap-1.5 text-sm text-pink-500 hover:text-pink-700 font-medium"
                        >
                          {copiedId === item.id ? "✅ 已复制" : "📋 复制全文"}
                        </button>
                        {inScript ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleScript(item.id); }}
                            className="flex items-center gap-1 text-xs bg-green-100 hover:bg-red-50 border border-green-300 hover:border-red-300 text-green-700 hover:text-red-500 rounded-lg px-2.5 py-1.5 font-medium transition-colors"
                          >
                            ✅ 移出今日台本
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleScript(item.id); }}
                            className="flex items-center gap-1 text-xs bg-pink-50 hover:bg-pink-100 border border-pink-200 text-pink-600 rounded-lg px-2.5 py-1.5 font-medium transition-colors"
                          >
                            🎙️ 加入今日台本
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
                          className="ml-auto text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                        >
                          收起 <span className="text-base leading-none">↑</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Collapsed ── */
                    <div className="p-3 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-1.5">
                          <h3 className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2 flex-1">
                            {item.title}
                          </h3>
                          {inScript && (
                            <span className="flex-shrink-0 mt-0.5 text-[10px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full font-medium border border-green-200 whitespace-nowrap">
                              🎙️ 台本
                            </span>
                          )}
                        </div>
                        {item.summary && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{item.summary}</p>
                        )}
                        {item.source_filename && (
                          <p className="text-xs text-gray-300 mt-0.5 flex items-center gap-0.5 truncate">
                            <span>📄</span>
                            <span className="truncate">{item.source_filename}</span>
                          </p>
                        )}
                        {item.category_name && (
                          <p className="text-[10px] text-pink-400 mt-0.5 font-medium">{item.category_name}</p>
                        )}
                      </div>
                      <span className="text-gray-300 text-lg flex-shrink-0">›</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Empty / welcome state */}
      {results === null && !loading && categories.length === 0 && (
        <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm">
          <div className="text-5xl mb-4">🌸</div>
          <p className="text-base font-medium text-gray-500">欢迎使用萌萌的直播助手</p>
          <p className="text-sm mt-2">请先在「管理」页面上传内容文件</p>
          <a
            href="/admin"
            className="inline-block mt-4 bg-pink-400 text-white px-6 py-2 rounded-full text-sm hover:bg-pink-500 transition-colors"
          >
            去上传内容
          </a>
        </div>
      )}
    </div>
  );
}
