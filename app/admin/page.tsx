"use client";

import { useState, useRef } from "react";

interface UploadResult {
  success: boolean;
  count: number;
  entries: Array<{
    id: number;
    title: string;
    category: string;
    tags: string[];
  }>;
}

export default function AdminPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string>("");
  const [progress, setProgress] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFileChange = (f: File | null) => {
    setFile(f);
    setResult(null);
    setError("");
    setProgress("");
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
    setError("");
    setResult(null);
    setProgress("正在解析文件...");

    try {
      const form = new FormData();
      form.append("file", file);

      setProgress("正在使用 AI 分析内容（可能需要 30-60 秒）...");
      const res = await fetch("/api/upload", {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "上传失败");
        return;
      }

      setResult(data);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setError("网络错误，请重试");
    } finally {
      setUploading(false);
      setProgress("");
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
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
            dragOver
              ? "border-pink-400 bg-pink-50"
              : file
              ? "border-pink-300 bg-pink-50"
              : "border-gray-200 hover:border-pink-300 hover:bg-pink-50"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.pdf,.docx"
            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
            className="hidden"
          />
          {file ? (
            <div>
              <div className="text-3xl mb-2">{getFileIcon(file.name)}</div>
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
              <p className="text-xs text-gray-400 mt-1">
                {(file.size / 1024).toFixed(1)} KB
              </p>
              <button
                onClick={(e) => { e.stopPropagation(); handleFileChange(null); }}
                className="mt-2 text-xs text-red-400 hover:text-red-600"
              >
                移除文件
              </button>
            </div>
          ) : (
            <div>
              <div className="text-4xl mb-3">☁️</div>
              <p className="text-base font-medium text-gray-500">点击或拖拽文件到这里</p>
              <p className="text-xs text-gray-400 mt-1">{SUPPORTED}</p>
            </div>
          )}
        </div>

        {/* Progress */}
        {progress && (
          <div className="flex items-center gap-3 bg-pink-50 rounded-xl p-4">
            <div className="animate-spin text-lg">⏳</div>
            <p className="text-sm text-pink-600">{progress}</p>
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
          {uploading ? "AI 分析中，请稍候..." : "🚀 上传并分析"}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✅</span>
            <h2 className="text-base font-bold text-gray-700">
              分析完成！共整理 {result.count} 条内容
            </h2>
          </div>

          <div className="space-y-2">
            {result.entries.map((entry) => (
              <a
                key={entry.id}
                href={`/content/${entry.id}`}
                className="block border border-pink-100 rounded-xl p-3 hover:bg-pink-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-gray-700 flex-1">
                    {entry.title}
                  </span>
                  <span className="flex-shrink-0 bg-pink-100 text-pink-600 text-xs px-2 py-0.5 rounded-full">
                    {entry.category}
                  </span>
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
            <span>分析过程约需 30-60 秒，请耐心等待</span>
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0">📏</span>
            <span>文件内容过长时会自动截取前 15000 字分析</span>
          </li>
        </ul>
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
