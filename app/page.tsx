"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface ContentResult {
  id: number;
  title: string;
  summary: string;
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
  const [history, setHistory] = useState<SearchHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHistory(loadHistory());
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories?.map((c: { name: string }) => c.name) || []);
      })
      .catch(() => {});
  }, []);

  const doSearch = useCallback(
    async (q: string, cat: string) => {
      if (!q.trim() && !cat) return;
      setLoading(true);
      setShowHistory(false);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (cat) params.set("category", cat);
        const res = await fetch(`/api/search?${params}`);
        const data = await res.json();
        const newResults: ContentResult[] = data.results || [];
        setResults(newResults);

        const entry: SearchHistory = {
          query: q.trim(),
          category: cat || undefined,
          timestamp: Date.now(),
          results: newResults,
        };
        const updatedHistory = loadHistory();
        const filtered = [entry, ...updatedHistory.filter(
          (h) => !(h.query === entry.query && h.category === entry.category)
        )];
        setHistory(filtered);
        saveHistory(filtered);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query, category);
  };

  const restoreHistory = (h: SearchHistory) => {
    setQuery(h.query);
    setCategory(h.category || "");
    setResults(h.results);
    setShowHistory(false);
  };

  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h1 className="text-xl font-bold text-gray-700 mb-4 text-center">
          🌸 搜索直播内容
        </h1>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => history.length > 0 && setShowHistory(true)}
              onBlur={() => setTimeout(() => setShowHistory(false), 200)}
              placeholder="输入关键词搜索..."
              className="w-full border border-pink-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-pink-300 bg-pink-50"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            )}
          </div>

          {categories.length > 0 && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-pink-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-pink-300 bg-pink-50 text-gray-600"
            >
              <option value="">全部分类</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-pink-400 to-rose-400 text-white rounded-xl py-3 text-base font-semibold hover:from-pink-500 hover:to-rose-500 transition-all disabled:opacity-60 shadow-sm"
          >
            {loading ? "搜索中..." : "🔍 搜索"}
          </button>
        </form>

        {showHistory && history.length > 0 && (
          <div className="mt-3 border border-pink-100 rounded-xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-2 bg-pink-50 border-b border-pink-100">
              <span className="text-xs text-gray-500 font-medium">历史搜索</span>
              <button
                onClick={clearHistory}
                className="text-xs text-red-400 hover:text-red-600"
              >
                清除
              </button>
            </div>
            {history.slice(0, 8).map((h, i) => (
              <button
                key={i}
                onMouseDown={() => restoreHistory(h)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-pink-50 text-left border-b border-pink-50 last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-gray-400 text-sm flex-shrink-0">🕐</span>
                  <span className="text-sm text-gray-700 truncate">
                    {h.query || `[${h.category}]`}
                    {h.category && h.query && (
                      <span className="ml-1 text-xs text-pink-400">· {h.category}</span>
                    )}
                  </span>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{formatTime(h.timestamp)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {categories.length > 0 && !results && (
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => { setCategory(c); doSearch("", c); }}
              className="bg-white border border-pink-200 rounded-full px-4 py-1.5 text-sm text-pink-600 hover:bg-pink-50 transition-colors shadow-sm"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {results !== null && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500">
              找到 {results.length} 条结果
            </h2>
            <button
              onClick={() => setResults(null)}
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
              <a
                key={item.id}
                href={`/content/${item.id}`}
                className="block bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow border border-transparent hover:border-pink-100"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-gray-800 leading-snug flex-1">
                    {item.title}
                  </h3>
                  <span className="flex-shrink-0 bg-pink-100 text-pink-600 text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                    {item.category_name}
                  </span>
                </div>
                {item.summary && (
                  <p className="text-sm text-gray-500 mt-1.5 line-clamp-2">
                    {item.summary}
                  </p>
                )}
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
              </a>
            ))
          )}
        </div>
      )}

      {results === null && !loading && categories.length === 0 && (
        <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm">
          <div className="text-5xl mb-4">🌸</div>
          <p className="text-base font-medium text-gray-500">欢迎使用萌萌的直播助手</p>
          <p className="text-sm mt-2">请先在「上传」页面上传内容文件</p>
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
