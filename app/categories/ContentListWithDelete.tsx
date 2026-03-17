"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { marked } from "marked";

interface ContentItem {
  id: number;
  title: string;
  summary: string;
  tags: string[];
  body: string;
  source_filename: string;
}

export default function ContentListWithDelete({
  contents,
  category,
  allCategories,
}: {
  contents: ContentItem[];
  category: string;
  allCategories: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Delete state
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Move state
  const [showMoveSheet, setShowMoveSheet] = useState(false);
  const [moving, setMoving] = useState(false);

  // Add to today's script
  const [addingScript, setAddingScript] = useState(false);
  const [scriptToast, setScriptToast] = useState<string | null>(null);

  // Source-file selector
  const [showSourceSheet, setShowSourceSheet] = useState(false);

  // Rename state
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(category);
  const [renameError, setRenameError] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus input when rename mode opens
  useEffect(() => {
    if (renaming) {
      setRenameValue(category);
      setRenameError("");
      setTimeout(() => renameInputRef.current?.focus(), 50);
    }
  }, [renaming, category]);

  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Other categories (exclude current)
  const otherCategories = allCategories.filter((c) => c !== category);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === contents.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(contents.map((c) => c.id)));
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
    setConfirmDelete(false);
    setShowMoveSheet(false);
    setShowSourceSheet(false);
  };

  // Unique non-empty source filenames present in this category
  const uniqueSources = Array.from(
    new Set(contents.map((c) => c.source_filename).filter(Boolean))
  );

  // Toggle-select all items from a given source file
  const toggleSelectBySource = (filename: string) => {
    const ids = contents.filter((c) => c.source_filename === filename).map((c) => c.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/contents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "删除失败");
        return;
      }
      exitSelectMode();
      startTransition(() => router.refresh());
    } catch {
      alert("网络错误，请重试");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleMove = async (targetCategory: string) => {
    if (selected.size === 0 || moving) return;
    setMoving(true);
    setShowMoveSheet(false);
    try {
      const res = await fetch("/api/admin/contents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), category: targetCategory }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "移动失败");
        return;
      }
      exitSelectMode();
      startTransition(() => router.refresh());
    } catch {
      alert("网络错误，请重试");
    } finally {
      setMoving(false);
    }
  };

  const handleRename = async () => {
    const newName = renameValue.trim();
    if (!newName) { setRenameError("分类名称不能为空"); return; }
    if (newName === category) { setRenaming(false); return; }
    setRenameSaving(true);
    setRenameError("");
    try {
      const res = await fetch("/api/admin/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName: category, newName }),
      });
      const data = await res.json();
      if (!res.ok) { setRenameError(data.error || "重命名失败"); return; }
      setRenaming(false);
      // Navigate to the new category URL so the page reflects the change
      startTransition(() => {
        router.replace(`/categories?cat=${encodeURIComponent(newName)}`);
        router.refresh();
      });
    } catch {
      setRenameError("网络错误，请重试");
    } finally {
      setRenameSaving(false);
    }
  };

  const handleAddToScript = async () => {
    if (selected.size === 0 || addingScript) return;
    setAddingScript(true);
    try {
      const res = await fetch("/api/today-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScriptToast(`❌ ${data.error || "添加失败"}`);
      } else {
        const added = data.added as number;
        const skipped = selected.size - added;
        if (added === 0) {
          setScriptToast("⚠️ 所选条目已全部在今日台本中");
        } else if (skipped > 0) {
          setScriptToast(`✅ 已加入 ${added} 条（${skipped} 条已存在）`);
        } else {
          setScriptToast(`✅ 已加入今日台本 ${added} 条`);
        }
        exitSelectMode();
      }
    } catch {
      setScriptToast("❌ 网络错误，请重试");
    } finally {
      setAddingScript(false);
      setTimeout(() => setScriptToast(null), 3000);
    }
  };

  const handleAddSingleToScript = async (id: number) => {
    try {
      const res = await fetch("/api/today-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentIds: [id] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScriptToast(`❌ ${data.error || "添加失败"}`);
      } else {
        setScriptToast(data.added === 0 ? "⚠️ 已在今日台本中" : "✅ 已加入今日台本");
      }
    } catch {
      setScriptToast("❌ 网络错误，请重试");
    }
    setTimeout(() => setScriptToast(null), 2500);
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

  if (contents.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 text-center text-gray-400 shadow-sm">
        该分类暂无内容
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Category name / rename row */}
      {!selectMode && (
        <div className="flex items-center gap-2">
          {renaming ? (
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => { setRenameValue(e.target.value); setRenameError(""); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename();
                    if (e.key === "Escape") setRenaming(false);
                  }}
                  className="flex-1 text-sm font-semibold border border-violet-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300"
                  placeholder="输入新分类名称"
                  maxLength={20}
                  disabled={renameSaving}
                />
                <button
                  onClick={handleRename}
                  disabled={renameSaving}
                  className="text-xs bg-violet-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-violet-600 disabled:opacity-60 transition-colors"
                >
                  {renameSaving ? "保存中..." : "保存"}
                </button>
                <button
                  onClick={() => setRenaming(false)}
                  disabled={renameSaving}
                  className="text-xs text-gray-400 hover:text-gray-600 px-1"
                >
                  取消
                </button>
              </div>
              {renameError && (
                <p className="text-xs text-red-500 pl-1">{renameError}</p>
              )}
            </div>
          ) : (
            <>
              <span className="text-sm font-semibold text-gray-700 flex-1 truncate">
                {category}
              </span>
              <button
                onClick={() => setRenaming(true)}
                className="text-xs text-gray-400 hover:text-violet-500 transition-colors border border-gray-200 px-2.5 py-1 rounded-lg flex items-center gap-1"
                title="重命名分类"
              >
                ✏️ 重命名
              </button>
            </>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 min-h-[32px]">
        {selectMode ? (
          <>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={toggleAll}
                className="text-xs text-violet-600 font-medium hover:text-violet-800"
              >
                {selected.size === contents.length ? "取消全选" : `全选 (${contents.length})`}
              </button>
              {uniqueSources.length > 0 && (
                <button
                  onClick={() => setShowSourceSheet(true)}
                  className="text-xs text-blue-500 font-medium hover:text-blue-700 border border-blue-200 px-2 py-0.5 rounded-lg"
                >
                  📁 按文件
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              {selected.size > 0 && (
                <>
                  {/* Add to today's script — only show when not in delete confirm */}
                  {!confirmDelete && (
                    <button
                      onClick={handleAddToScript}
                      disabled={addingScript}
                      className="text-xs bg-pink-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-pink-600 transition-colors disabled:opacity-60"
                    >
                      {addingScript ? "添加中..." : `🎙️ 今日台本`}
                    </button>
                  )}

                  {/* Move button — only show when not in delete confirm */}
                  {!confirmDelete && (
                    <button
                      onClick={() => setShowMoveSheet(true)}
                      disabled={moving}
                      className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-60"
                    >
                      {moving ? "移动中..." : `↗️ 移到 (${selected.size})`}
                    </button>
                  )}

                  {/* Delete button */}
                  {!confirmDelete ? (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-red-600 transition-colors"
                    >
                      🗑️ 删除 ({selected.size})
                    </button>
                  ) : (
                    <>
                      <span className="text-xs text-red-600 font-medium">确认删除？</span>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-red-600 disabled:opacity-60 transition-colors"
                      >
                        {deleting ? "删除中..." : "确认"}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                      >
                        取消
                      </button>
                    </>
                  )}
                </>
              )}

              <button
                onClick={exitSelectMode}
                className="text-xs text-gray-400 hover:text-gray-600 px-2"
              >
                退出
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="text-xs text-gray-400">{contents.length} 条内容</span>
            <button
              onClick={() => setSelectMode(true)}
              className="text-xs text-gray-400 hover:text-violet-500 transition-colors border border-gray-200 px-2.5 py-1 rounded-lg"
            >
              ✏️ 管理条目
            </button>
          </>
        )}
      </div>

      {/* Script toast */}
      {scriptToast && (
        <div className={`text-xs text-center px-3 py-2 rounded-xl font-medium ${
          scriptToast.startsWith("❌") ? "bg-red-50 text-red-500" :
          scriptToast.startsWith("⚠️") ? "bg-amber-50 text-amber-600" :
          "bg-green-50 text-green-600"
        }`}>
          {scriptToast}
        </div>
      )}

      {/* Pending / moving hint */}
      {(isPending || moving) && (
        <div className="text-xs text-center text-gray-400 animate-pulse">正在刷新...</div>
      )}

      {/* Content list */}
      {contents.map((item) => {
        const isSelected = selected.has(item.id);
        const isExpanded = expandedIds.has(item.id);
        return (
          <div
            key={item.id}
            className={`relative bg-white rounded-2xl shadow-sm border-2 transition-all ${
              selectMode
                ? isSelected
                  ? "border-blue-400 bg-blue-50"
                  : "border-transparent hover:border-gray-200 cursor-pointer"
                : isExpanded
                  ? "border-pink-200 shadow-md"
                  : "border-transparent hover:border-pink-100 hover:shadow-sm cursor-pointer"
            }`}
            onClick={() => {
              if (selectMode) toggleSelect(item.id);
              else if (!isExpanded) toggleExpand(item.id);
            }}
          >
            {/* Checkbox */}
            {selectMode && (
              <div className="absolute top-3 right-3">
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    isSelected
                      ? "bg-blue-500 border-blue-500"
                      : "border-gray-300 bg-white"
                  }`}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </div>
            )}

            {/* Card content */}
            {selectMode ? (
              /* ── Select mode: compact ── */
              <div className="p-3 pr-10">
                <h3 className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">
                  {item.title}
                </h3>
                {item.source_filename && (
                  <p className="text-xs text-blue-400 mt-0.5 flex items-center gap-0.5 truncate">
                    <span>📄</span>
                    <span className="truncate">{item.source_filename}</span>
                  </p>
                )}
              </div>
            ) : isExpanded ? (
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
                {item.source_filename && (
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    <span>📄</span>
                    <span className="truncate">{item.source_filename}</span>
                  </p>
                )}
                {item.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {item.tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
                {item.body && (
                  <div className="border-t border-gray-50 mt-3 pt-3">
                    <div
                      className="markdown-body text-sm"
                      dangerouslySetInnerHTML={{ __html: marked(item.body) as string }}
                    />
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-50 flex-wrap">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCopy(item.id, item.body); }}
                    className="flex items-center gap-1.5 text-sm text-pink-500 hover:text-pink-700 font-medium"
                  >
                    {copiedId === item.id ? "✅ 已复制" : "📋 复制全文"}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAddSingleToScript(item.id); }}
                    className="flex items-center gap-1 text-xs bg-pink-50 hover:bg-pink-100 border border-pink-200 text-pink-600 rounded-lg px-2.5 py-1.5 font-medium transition-colors"
                  >
                    🎙️ 今日台本
                  </button>
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
                  <h3 className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">
                    {item.title}
                  </h3>
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
              </div>
            )}
          </div>
        );
      })}

      {/* Select by source file — bottom sheet */}
      {showSourceSheet && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setShowSourceSheet(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-700">按来源文件选择</h3>
              <button
                onClick={() => setShowSourceSheet(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-3 py-2">
              {uniqueSources.map((src) => {
                const srcIds = contents.filter((c) => c.source_filename === src).map((c) => c.id);
                const allChecked = srcIds.every((id) => selected.has(id));
                const someChecked = srcIds.some((id) => selected.has(id));
                return (
                  <button
                    key={src}
                    onClick={() => toggleSelectBySource(src)}
                    className="w-full text-left px-4 py-3.5 rounded-xl hover:bg-blue-50 active:bg-blue-100 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                        allChecked
                          ? "bg-blue-500 border-blue-500"
                          : someChecked
                            ? "bg-blue-200 border-blue-400"
                            : "border-gray-300 bg-white"
                      }`}>
                        {(allChecked || someChecked) && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm text-gray-700 truncate">📄 {src}</span>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">{srcIds.length} 条</span>
                  </button>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-gray-100">
              <button
                onClick={() => setShowSourceSheet(false)}
                className="w-full bg-blue-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors"
              >
                完成（已选 {selected.size} 条）
              </button>
            </div>
            <div style={{ height: "env(safe-area-inset-bottom, 12px)" }} />
          </div>
        </>
      )}

      {/* Move to category — bottom sheet */}
      {showMoveSheet && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setShowMoveSheet(false)}
          />
          {/* Sheet */}
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-700">
                移动 {selected.size} 条到...
              </h3>
              <button
                onClick={() => setShowMoveSheet(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center"
              >
                ×
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-3 py-2">
              {otherCategories.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  没有其他分类可以移动到
                </p>
              ) : (
                otherCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => handleMove(cat)}
                    className="w-full text-left px-4 py-3.5 rounded-xl hover:bg-pink-50 active:bg-pink-100 text-gray-700 text-sm font-medium transition-colors flex items-center justify-between"
                  >
                    <span>{cat}</span>
                    <span className="text-gray-300 text-xl">›</span>
                  </button>
                ))
              )}
            </div>

            {/* iOS safe area */}
            <div style={{ height: "env(safe-area-inset-bottom, 12px)" }} />
          </div>
        </>
      )}
    </div>
  );
}
