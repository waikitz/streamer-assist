"use client";

import { useState, useCallback } from "react";
import { marked } from "marked";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface TodayItem {
  id: number;           // today_script.id
  content_id: number;
  title: string;
  body: string;
  summary: string;
  category_name: string;
  tags: string[];
  source_filename: string;
}

// ── Sortable card ──────────────────────────────────────────────────────────

function SortableCard({
  item,
  usedIds,
  expandedIds,
  copiedId,
  onToggleExpand,
  onToggleUsed,
  onCopy,
  onRemove,
}: {
  item: TodayItem;
  usedIds: Set<number>;
  expandedIds: Set<number>;
  copiedId: number | null;
  onToggleExpand: (id: number) => void;
  onToggleUsed: (id: number) => void;
  onCopy: (id: number, text: string) => void;
  onRemove: (id: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const isUsed = usedIds.has(item.id);
  const isExpanded = expandedIds.has(item.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-2xl shadow-sm border-2 transition-colors ${
        isUsed
          ? "opacity-60 border-green-200"
          : isExpanded
          ? "border-pink-200 shadow-md"
          : "border-transparent"
      }`}
    >
      {isExpanded ? (
        /* ── Expanded ── */
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            {/* Drag handle */}
            <button
              {...attributes}
              {...listeners}
              className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none p-1 -ml-1"
              aria-label="拖动排序"
            >
              ⠿
            </button>
            <h3 className="text-base font-semibold text-gray-800 leading-snug flex-1">
              {item.title}
            </h3>
            {isUsed && (
              <span className="flex-shrink-0 bg-green-100 text-green-600 text-xs px-2 py-0.5 rounded-full whitespace-nowrap font-medium">
                ✓ 已用
              </span>
            )}
          </div>

          {item.category_name && (
            <p className="text-xs text-pink-400 font-medium">{item.category_name}</p>
          )}

          {item.source_filename && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <span>📄</span>
              <span className="truncate">{item.source_filename}</span>
            </p>
          )}

          {item.body && (
            <div
              className="markdown-body text-sm border-t border-gray-50 pt-3"
              dangerouslySetInnerHTML={{ __html: marked(item.body) as string }}
            />
          )}

          <div className="flex items-center gap-2 pt-1 border-t border-gray-50 flex-wrap">
            <button
              onClick={() => onCopy(item.id, item.body)}
              className="flex items-center gap-1 bg-pink-50 hover:bg-pink-100 border border-pink-200 text-pink-600 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            >
              {copiedId === item.id ? "✅ 已复制" : "📋 复制"}
            </button>
            <button
              onClick={() => onToggleUsed(item.id)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {isUsed ? "↩ 取消已用" : "✓ 标记已用"}
            </button>
            <button
              onClick={() => onRemove(item.id)}
              className="text-xs text-red-400 hover:text-red-600 ml-auto"
            >
              移出
            </button>
            <button
              onClick={() => onToggleExpand(item.id)}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            >
              收起 <span className="text-base leading-none">↑</span>
            </button>
          </div>
        </div>
      ) : (
        /* ── Collapsed ── */
        <div className="flex items-stretch">
          {/* Drag handle strip */}
          <button
            {...attributes}
            {...listeners}
            className="flex-shrink-0 w-8 flex items-center justify-center text-gray-200 hover:text-gray-400 cursor-grab active:cursor-grabbing touch-none rounded-l-2xl border-r border-gray-50"
            aria-label="拖动排序"
          >
            ⠿
          </button>

          {/* Card content — click to expand */}
          <button
            className="flex-1 text-left p-3 flex items-center justify-between gap-2 min-w-0"
            onClick={() => onToggleExpand(item.id)}
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
              {item.source_filename && (
                <p className="text-xs text-gray-300 mt-0.5 flex items-center gap-0.5 truncate">
                  <span>📄</span>
                  <span className="truncate">{item.source_filename}</span>
                </p>
              )}
            </div>
            <span className="text-gray-300 text-lg flex-shrink-0">›</span>
          </button>

          {/* Quick remove */}
          <button
            onClick={() => onRemove(item.id)}
            className="flex-shrink-0 w-9 flex items-center justify-center text-gray-200 hover:text-red-400 transition-colors rounded-r-2xl border-l border-gray-50"
            aria-label="移出今日台本"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

const USED_IDS_KEY = "today_script_used_ids";

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
  } catch { /* ignore */ }
}

export default function BroadcastClient({
  initialItems,
}: {
  initialItems: TodayItem[];
}) {
  const [items, setItems] = useState<TodayItem[]>(initialItems);
  const [usedIds, setUsedIds] = useState<Set<number>>(() => {
    if (typeof window !== "undefined") return loadUsedIds();
    return new Set();
  });
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  // dnd-kit sensors — support both mouse and touch
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleUsed = (id: number) => {
    setUsedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      saveUsedIds(next);
      return next;
    });
  };

  const handleCopy = async (id: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* ignore */ }
  };

  // Remove a single item (optimistic update + API call)
  const handleRemove = useCallback(async (todayId: number) => {
    setItems((prev) => prev.filter((i) => i.id !== todayId));
    setExpandedIds((prev) => { const n = new Set(prev); n.delete(todayId); return n; });
    await fetch("/api/today-script", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [todayId] }),
    });
  }, []);

  // Clear all
  const handleClearAll = async () => {
    setClearing(true);
    try {
      await fetch("/api/today-script", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setItems([]);
      setExpandedIds(new Set());
    } finally {
      setClearing(false);
      setShowClearConfirm(false);
    }
  };

  // Drag end — reorder locally and persist
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setItems((prev) => {
        const oldIdx = prev.findIndex((i) => i.id === active.id);
        const newIdx = prev.findIndex((i) => i.id === over.id);
        const next = arrayMove(prev, oldIdx, newIdx);

        // Persist new order
        fetch("/api/today-script", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: next.map((i) => i.id) }),
        }).catch(() => {/* silent */});

        return next;
      });
    },
    []
  );

  const usedCount = items.filter((i) => usedIds.has(i.id)).length;

  // ── Empty state ────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <div className="sticky top-0 bg-pink-50 z-10 py-3">
          <h1 className="font-bold text-gray-700">🎙️ 今日台本</h1>
        </div>
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm space-y-3">
          <div className="text-4xl">🎙️</div>
          <p className="text-base font-medium text-gray-500">今日台本为空</p>
          <p className="text-sm text-gray-400 leading-relaxed">
            前往「分类」页面，进入管理条目模式，<br />
            选择条目后点击「🎙️ 今日台本」即可加入
          </p>
          <a
            href="/categories"
            className="inline-block mt-2 bg-pink-400 text-white px-6 py-2 rounded-full text-sm hover:bg-pink-500 transition-colors"
          >
            去添加内容
          </a>
        </div>
      </div>
    );
  }

  // ── Main ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="sticky top-0 bg-pink-50 z-10 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-gray-700">🎙️ 今日台本</h1>
          <button
            onClick={() => setShowClearConfirm(true)}
            className="text-xs text-red-400 hover:text-red-600 border border-red-200 px-2.5 py-1 rounded-lg"
          >
            🗑️ 清空
          </button>
        </div>
        <p className="text-xs text-gray-400">
          {items.length} 条 · 已用 {usedCount} · 拖动 ⠿ 可排序
        </p>
      </div>

      {/* Clear confirm */}
      {showClearConfirm && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
          <p className="text-sm text-gray-700 font-medium">⚠️ 清空今日台本？（不会删除数据库内容）</p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowClearConfirm(false)}
              className="flex-1 border border-gray-200 bg-white text-gray-500 rounded-lg py-2 text-sm font-medium"
            >
              取消
            </button>
            <button
              onClick={handleClearAll}
              disabled={clearing}
              className="flex-1 bg-red-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-600 disabled:opacity-60"
            >
              {clearing ? "清空中..." : "确认清空"}
            </button>
          </div>
        </div>
      )}

      {/* Sortable list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {items.map((item) => (
              <SortableCard
                key={item.id}
                item={item}
                usedIds={usedIds}
                expandedIds={expandedIds}
                copiedId={copiedId}
                onToggleExpand={toggleExpand}
                onToggleUsed={toggleUsed}
                onCopy={handleCopy}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
