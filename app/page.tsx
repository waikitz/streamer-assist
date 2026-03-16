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
            results.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl shadow-sm p-4 border-2 border-transparent"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-gray-800 leading-snug flex-1">
                    {item.title}
                  </h3>
                  <span className="flex-shrink-0 bg-pink-100 text-pink-600 text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                    {item.category_name}
                  </span>
                </div>

                {/* Summary */}
                {item.summary && (
                  <p className="text-sm text-gray-500 mt-1.5 line-clamp-2">
                    {item.summary}
                  </p>
                )}

                {/* Tags */}
                {item.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {item.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Action row */}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    onClick={() => toggleExpand(item.id)}
                    className="text-sm text-pink-500 font-medium"
                  >
                    {expandedIds.has(item.id) ? "收起 ▴" : "展开全文 ▾"}
                  </button>
                  <button
                    onClick={() => handleCopy(item.id, item.body)}
                    className="flex items-center gap-1 bg-pink-50 hover:bg-pink-100 border border-pink-200 text-pink-600 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                  >
                    {copiedId === item.id ? "✅ 已复制" : "📋 复制"}
                  </button>
                </div>

                {/* Expanded body */}
                {expandedIds.has(item.id) && (
                  <div className="mt-3 pt-3 border-t border-pink-50">
                    <div
                      className="markdown-body text-sm"
                      dangerouslySetInnerHTML={{
                        __html: marked(item.body) as string,
                      }}
                    />
                  </div>
                )}
              </div>
            ))
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
