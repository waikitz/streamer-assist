"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useUpload } from "../context/UploadContext";

interface UploadResult {
  success: boolean;
  duplicate?: boolean;
  message?: string;
  count: number;
  mergedCount?: number;
  insertedCount?: number;
  entries: Array<{
    id: number;
    title: string;
    category: string;
    tags: string[];
    merged?: boolean;
  }>;
}

interface ProgressState {
  stage: "parsing" | "analyzing" | "saving" | "done";
  message: string;
  percent: number;
  chunk?: number;
  total?: number;
}

const STAGE_LABELS: Record<ProgressState["stage"], string> = {
  parsing: "解析文件",
  analyzing: "AI 分析",
  saving: "保存数据",
  done: "完成",
};

const STAGE_COLORS: Record<ProgressState["stage"], string> = {
  parsing: "bg-blue-400",
  analyzing: "bg-violet-500",
  saving: "bg-emerald-500",
  done: "bg-pink-400",
};

export default function AdminPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string>("");
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const { setUploading: setGlobalUploading } = useUpload();
  const [showDbConfirm, setShowDbConfirm] = useState(false);
  const [showCacheConfirm, setShowCacheConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<string>("");

  // Backup / restore state
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoreResult, setRestoreResult] = useState<string>("");
  const restoreRef = useRef<HTMLInputElement>(null);

  // Tunnel state
  const [tunnelRunning, setTunnelRunning] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelError, setTunnelError] = useState("");
  const [tunnelCopied, setTunnelCopied] = useState(false);

  const fetchTunnelStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tunnel");
      const data = await res.json();
      setTunnelRunning(data.running ?? false);
      setTunnelUrl(data.url ?? null);
    } catch {
      setTunnelRunning(false);
    }
  }, []);

  // Poll tunnel status every 5s
  useEffect(() => {
    fetchTunnelStatus();
    const id = setInterval(fetchTunnelStatus, 5000);
    return () => clearInterval(id);
  }, [fetchTunnelStatus]);

  const handleTunnelStart = async () => {
    setTunnelLoading(true);
    setTunnelError("");
    try {
      const res = await fetch("/api/admin/tunnel", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setTunnelError(data.error || "启动失败"); return; }
      setTunnelUrl(data.url ?? null);
      setTunnelRunning(true);
    } catch {
      setTunnelError("网络错误，请重试");
    } finally {
      setTunnelLoading(false);
    }
  };

  const handleTunnelStop = async () => {
    setTunnelLoading(true);
    setTunnelError("");
    try {
      await fetch("/api/admin/tunnel", { method: "DELETE" });
      setTunnelRunning(false);
      setTunnelUrl(null);
    } catch {
      setTunnelError("网络错误，请重试");
    } finally {
      setTunnelLoading(false);
    }
  };

  const copyTunnelUrl = async () => {
    if (!tunnelUrl) return;
    await navigator.clipboard.writeText(tunnelUrl).catch(() => {});
    setTunnelCopied(true);
    setTimeout(() => setTunnelCopied(false), 2000);
  };

  const handleFileChange = (f: File | null) => {
    setFile(f);
    setResult(null);
    setError("");
    setProgress(null);
  };

  const handleClearDatabase = async () => {
    setClearing(true);
    setClearResult("");
    try {
      const res = await fetch("/api/admin/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_database", confirm: "DELETE_ALL" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "清空失败");
      setClearResult(`✅ 已清空 ${data.deletedContents} 条内容、${data.deletedCategories} 个分类`);
      setResult(null);
    } catch (e) {
      setClearResult(`❌ ${e instanceof Error ? e.message : "清空失败"}`);
    } finally {
      setClearing(false);
      setShowDbConfirm(false);
    }
  };

  const handleClearCache = async () => {
    setClearing(true);
    setClearResult("");
    try {
      const res = await fetch("/api/admin/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_cache", confirm: "DELETE_ALL" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "清空失败");
      setClearResult(`✅ 已清空 ${data.deletedFiles} 个缓存文件`);
    } catch (e) {
      setClearResult(`❌ ${e instanceof Error ? e.message : "清空失败"}`);
    } finally {
      setClearing(false);
      setShowCacheConfirm(false);
    }
  };

  const handleBackupDownload = async () => {
    setBackupLoading(true);
    try {
      const res = await fetch("/api/admin/backup");
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "备份失败");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "streamer-backup.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("网络错误，请重试");
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    setRestoreResult("");
    try {
      const text = await restoreFile.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const data = await res.json();
      if (!res.ok) {
        setRestoreResult(`❌ ${data.error || "恢复失败"}`);
        return;
      }
      setRestoreResult(`✅ 恢复成功，共导入 ${data.restoredCount} 条内容`);
      setRestoreFile(null);
      if (restoreRef.current) restoreRef.current.value = "";
    } catch (e) {
      setRestoreResult(`❌ ${e instanceof Error ? e.message : "文件解析失败"}`);
    } finally {
      setRestoring(false);
      setShowRestoreConfirm(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileChange(dropped);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setGlobalUploading(true);
    setError("");
    setResult(null);
    setProgress({ stage: "parsing", message: "正在准备上传...", percent: 0 });

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/upload", { method: "POST", body: form });

      if (!res.body) {
        throw new Error("服务器未返回数据流");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as {
              type: string;
              stage?: ProgressState["stage"];
              message?: string;
              percent?: number;
              chunk?: number;
              total?: number;
              error?: string;
              result?: UploadResult;
            };

            if (event.type === "progress" && event.stage) {
              setProgress({
                stage: event.stage,
                message: event.message ?? "",
                percent: event.percent ?? 0,
                chunk: event.chunk,
                total: event.total,
              });
            } else if (event.type === "done" && event.result) {
              setProgress({ stage: "done", message: "处理完成！", percent: 100 });
              setResult(event.result);
              setFile(null);
              if (fileRef.current) fileRef.current.value = "";
            } else if (event.type === "error") {
              setError(event.error ?? "上传失败");
              setProgress(null);
            }
          } catch {
            // skip malformed SSE line
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误，请重试");
      setProgress(null);
    } finally {
      setUploading(false);
      setGlobalUploading(false);
    }
  };

  const SUPPORTED = ".txt, .md, .pdf, .docx";

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-700">📤 上传内容文件</h1>

      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
        <p className="text-sm text-gray-500 leading-relaxed">
          上传内容文件后，AI 会自动分析并整理内容，方便主播搜索使用。
          支持格式：<span className="font-medium text-pink-500">{SUPPORTED}</span>
        </p>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => !uploading && fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
            uploading
              ? "border-gray-200 bg-gray-50 cursor-default"
              : dragOver
              ? "border-pink-400 bg-pink-50 cursor-pointer"
              : file
              ? "border-pink-300 bg-pink-50 cursor-pointer"
              : "border-gray-200 hover:border-pink-300 hover:bg-pink-50 cursor-pointer"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.pdf,.docx"
            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
            className="hidden"
            disabled={uploading}
          />
          {file ? (
            <div>
              <div className="text-3xl mb-2">{getFileIcon(file.name)}</div>
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
              <p className="text-xs text-gray-400 mt-1">
                {(file.size / 1024).toFixed(1)} KB
              </p>
              {!uploading && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleFileChange(null); }}
                  className="mt-2 text-xs text-red-400 hover:text-red-600"
                >
                  移除文件
                </button>
              )}
            </div>
          ) : (
            <div>
              <div className="text-4xl mb-3">☁️</div>
              <p className="text-base font-medium text-gray-500">点击或拖拽文件到这里</p>
              <p className="text-xs text-gray-400 mt-1">{SUPPORTED}</p>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {uploading && progress && (
          <div className="space-y-2">
            {/* Stage pills */}
            <div className="flex gap-1.5 justify-between text-xs">
              {(["parsing", "analyzing", "saving", "done"] as ProgressState["stage"][]).map((s) => {
                const isActive = progress.stage === s;
                const stageOrder = ["parsing", "analyzing", "saving", "done"];
                const isDone = stageOrder.indexOf(s) < stageOrder.indexOf(progress.stage);
                return (
                  <span
                    key={s}
                    className={`flex-1 text-center py-1 rounded-full font-medium transition-all ${
                      isActive
                        ? "bg-violet-100 text-violet-700"
                        : isDone
                        ? "bg-green-100 text-green-600"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {isDone ? "✓ " : ""}{STAGE_LABELS[s]}
                  </span>
                );
              })}
            </div>

            {/* Bar */}
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${STAGE_COLORS[progress.stage]}`}
                style={{ width: `${progress.percent}%` }}
              />
            </div>

            {/* Message + percent */}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                {progress.message}
              </span>
              <span className="font-mono font-medium text-violet-600">{progress.percent}%</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm text-red-600">❌ {error}</p>
          </div>
        )}

        {/* Upload button */}
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full bg-gradient-to-r from-pink-400 to-rose-400 text-white rounded-xl py-3 text-base font-semibold hover:from-pink-500 hover:to-rose-500 transition-all disabled:opacity-50 shadow-sm"
        >
          {uploading ? "处理中，请稍候..." : "🚀 上传并分析"}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{result.duplicate ? "♻️" : "✅"}</span>
            <h2 className="text-base font-bold text-gray-700">
              {result.duplicate
                ? `重复文件，已有 ${result.count} 条内容`
                : (result.mergedCount ?? 0) > 0
                ? `分析完成！新增 ${result.insertedCount ?? 0} 条，合并更新 ${result.mergedCount} 条`
                : `分析完成！共整理 ${result.count} 条内容`}
            </h2>
          </div>
          {result.message && (
            <p className="text-sm text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
              {result.message}
            </p>
          )}

          <div className="space-y-2">
            {result.entries.map((entry) => (
              <a
                key={entry.id}
                href={`/content/${entry.id}`}
                className="block border border-pink-100 rounded-xl p-3 hover:bg-pink-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-gray-700 flex-1">
                    {entry.merged && <span className="mr-1">↩️</span>}
                    {entry.title}
                  </span>
                  {entry.merged ? (
                    <span className="flex-shrink-0 bg-amber-100 text-amber-600 text-xs px-2 py-0.5 rounded-full">
                      已合并
                    </span>
                  ) : (
                    <span className="flex-shrink-0 bg-pink-100 text-pink-600 text-xs px-2 py-0.5 rounded-full">
                      {entry.category}
                    </span>
                  )}
                </div>
                {entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {entry.tags.slice(0, 3).map((t) => (
                      <span key={t} className="text-xs text-gray-400">#{t}</span>
                    ))}
                  </div>
                )}
              </a>
            ))}
          </div>

          <div className="flex gap-3">
            <a
              href="/"
              className="flex-1 text-center border border-pink-300 text-pink-500 rounded-xl py-2.5 text-sm font-medium hover:bg-pink-50 transition-colors"
            >
              去搜索
            </a>
            <a
              href="/categories"
              className="flex-1 text-center bg-pink-400 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-pink-500 transition-colors"
            >
              查看分类
            </a>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-600 mb-3">💡 使用提示</h3>
        <ul className="space-y-2 text-sm text-gray-500">
          <li className="flex gap-2">
            <span className="flex-shrink-0">📝</span>
            <span>支持上传 TXT、Markdown、PDF、Word 文档</span>
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0">🤖</span>
            <span>AI 会自动识别内容类型并整理分类</span>
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0">⏱️</span>
            <span>分析过程约需 30-60 秒，进度条会实时更新</span>
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0">📏</span>
            <span>文件内容过长时会自动分段分析，不遗漏任何内容</span>
          </li>
        </ul>
      </div>

      {/* Tunnel */}
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-600">🌐 公网 Tunnel</h3>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${tunnelRunning ? "bg-green-400" : "bg-gray-300"}`} />
            <span className="text-xs text-gray-400">{tunnelRunning ? "运行中" : "未运行"}</span>
          </div>
        </div>

        {tunnelError && (
          <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{tunnelError}</p>
        )}

        {tunnelRunning && tunnelUrl ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
              <span className="text-xs font-mono text-green-700 flex-1 truncate">{tunnelUrl}</span>
              <button
                onClick={copyTunnelUrl}
                className="shrink-0 text-xs text-green-600 hover:text-green-800 font-medium"
              >
                {tunnelCopied ? "✅" : "复制"}
              </button>
            </div>
            <div className="flex gap-2">
              <a
                href={tunnelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center text-xs border border-green-300 text-green-600 rounded-xl py-2 font-medium hover:bg-green-50 transition-colors"
              >
                🔗 打开
              </a>
              <button
                onClick={handleTunnelStop}
                disabled={tunnelLoading}
                className="flex-1 text-xs border border-red-300 text-red-500 rounded-xl py-2 font-medium hover:bg-red-50 transition-colors disabled:opacity-60"
              >
                {tunnelLoading ? "停止中..." : "⏹ 停止 Tunnel"}
              </button>
            </div>
          </div>
        ) : tunnelRunning ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 animate-pulse">正在获取公网地址...</p>
            <button
              onClick={fetchTunnelStatus}
              className="text-xs text-violet-500 hover:text-violet-700 font-medium"
            >
              刷新状态
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">启动后可通过公网访问本网站</p>
            <button
              onClick={handleTunnelStart}
              disabled={tunnelLoading}
              className="w-full bg-gradient-to-r from-violet-400 to-purple-400 text-white rounded-xl py-2.5 text-sm font-semibold hover:from-violet-500 hover:to-purple-500 transition-all disabled:opacity-50"
            >
              {tunnelLoading ? "启动中..." : "🚀 启动 Tunnel"}
            </button>
          </div>
        )}
      </div>

      {/* Backup & Restore */}
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-600">💾 备份与恢复</h3>

        {/* Export */}
        <div className="space-y-1">
          <p className="text-xs text-gray-400">将当前数据库所有内容导出为 JSON 文件</p>
          <button
            onClick={handleBackupDownload}
            disabled={backupLoading}
            className="w-full border border-blue-300 text-blue-600 rounded-xl py-2.5 text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {backupLoading ? "生成中..." : "⬇️ 导出备份"}
          </button>
        </div>

        <div className="border-t border-gray-100" />

        {/* Import */}
        <div className="space-y-2">
          <p className="text-xs text-gray-400">从备份文件恢复数据（<span className="text-orange-500 font-medium">将覆盖现有全部数据</span>）</p>

          {restoreResult && (
            <div className={`text-sm px-3 py-2 rounded-lg ${restoreResult.startsWith("❌") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
              {restoreResult}
            </div>
          )}

          <div
            onClick={() => !restoring && restoreRef.current?.click()}
            className={`border-2 border-dashed rounded-xl px-4 py-4 text-center transition-all ${
              restoring
                ? "border-gray-200 bg-gray-50 cursor-default"
                : restoreFile
                ? "border-orange-300 bg-orange-50 cursor-pointer"
                : "border-gray-200 hover:border-orange-300 hover:bg-orange-50 cursor-pointer"
            }`}
          >
            <input
              ref={restoreRef}
              type="file"
              accept=".json"
              className="hidden"
              disabled={restoring}
              onChange={(e) => {
                setRestoreFile(e.target.files?.[0] ?? null);
                setRestoreResult("");
                setShowRestoreConfirm(false);
              }}
            />
            {restoreFile ? (
              <div>
                <p className="text-sm font-medium text-gray-700">📄 {restoreFile.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{(restoreFile.size / 1024).toFixed(1)} KB</p>
                {!restoring && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setRestoreFile(null); setShowRestoreConfirm(false); if (restoreRef.current) restoreRef.current.value = ""; }}
                    className="mt-1 text-xs text-red-400 hover:text-red-600"
                  >
                    移除文件
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">点击选择备份文件 (.json)</p>
            )}
          </div>

          {restoreFile && !showRestoreConfirm && (
            <button
              onClick={() => setShowRestoreConfirm(true)}
              className="w-full border border-orange-400 text-orange-600 rounded-xl py-2.5 text-sm font-medium hover:bg-orange-50 transition-colors"
            >
              ⬆️ 恢复此备份
            </button>
          )}

          {showRestoreConfirm && (
            <div className="border border-orange-200 rounded-xl p-3 space-y-2 bg-orange-50">
              <p className="text-sm text-gray-700 font-medium">
                ⚠️ 恢复将清空现有全部内容后导入备份，确认继续？
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRestoreConfirm(false)}
                  className="flex-1 border border-gray-200 bg-white text-gray-500 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleRestore}
                  disabled={restoring}
                  className="flex-1 bg-orange-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-60"
                >
                  {restoring ? "恢复中..." : "确认恢复"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-2xl shadow-sm p-5 border border-red-100">
        <h3 className="text-sm font-bold text-red-500 mb-3">⚠️ 危险操作</h3>

        {clearResult && (
          <div className={`mb-3 text-sm px-3 py-2 rounded-lg ${clearResult.startsWith("❌") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
            {clearResult}
          </div>
        )}

        <div className="space-y-3">
          {/* Clear database */}
          {!showDbConfirm ? (
            <button
              onClick={() => { setShowDbConfirm(true); setShowCacheConfirm(false); setClearResult(""); }}
              className="w-full border border-red-300 text-red-500 rounded-xl py-2.5 text-sm font-medium hover:bg-red-50 transition-colors"
            >
              🗑️ 清空数据库内容
            </button>
          ) : (
            <div className="border border-red-200 rounded-xl p-3 space-y-2 bg-red-50">
              <p className="text-sm text-gray-600 font-medium">
                确定清空全部内容和分类吗？此操作不可恢复！
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDbConfirm(false)}
                  className="flex-1 border border-gray-200 bg-white text-gray-500 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleClearDatabase}
                  disabled={clearing}
                  className="flex-1 bg-red-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-60"
                >
                  {clearing ? "清空中..." : "确认清空"}
                </button>
              </div>
            </div>
          )}

          {/* Clear file cache */}
          {!showCacheConfirm ? (
            <button
              onClick={() => { setShowCacheConfirm(true); setShowDbConfirm(false); setClearResult(""); }}
              className="w-full border border-orange-300 text-orange-500 rounded-xl py-2.5 text-sm font-medium hover:bg-orange-50 transition-colors"
            >
              🗂️ 清空文件缓存
            </button>
          ) : (
            <div className="border border-orange-200 rounded-xl p-3 space-y-2 bg-orange-50">
              <p className="text-sm text-gray-600 font-medium">
                确定清空所有已缓存的上传文件吗？清空后相同文件将重新分析。
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCacheConfirm(false)}
                  className="flex-1 border border-gray-200 bg-white text-gray-500 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleClearCache}
                  disabled={clearing}
                  className="flex-1 bg-orange-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-60"
                >
                  {clearing ? "清空中..." : "确认清空"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  const icons: Record<string, string> = {
    txt: "📄",
    md: "📝",
    pdf: "📕",
    docx: "📘",
  };
  return icons[ext || ""] || "📄";
}
