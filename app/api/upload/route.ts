import { NextRequest } from "next/server";
import { writeFile, unlink, copyFile, mkdir } from "fs/promises";
import { createHash } from "crypto";
import { tmpdir } from "os";
import path from "path";
import { parseFile } from "@/lib/fileParser";
import { analyzeContent, ProgressCallback } from "@/lib/aiAnalyzer";
import { insertContent, findSimilarContent, mergeContentBody, findUploadByMd5, recordUpload, getContentsBySourceMd5 } from "@/lib/db";

export const dynamic = "force-dynamic";

const CACHE_DIR = path.join(process.cwd(), "data", "uploads");

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const tempPath = path.join(tmpdir(), `upload-${Date.now()}`);

      try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
          send({ type: "error", error: "请选择文件" });
          return;
        }

        const allowedExts = [".txt", ".md", ".pdf", ".docx"];
        const ext = path.extname(file.name).toLowerCase();
        if (!allowedExts.includes(ext)) {
          send({ type: "error", error: `不支持的文件类型: ${ext}。支持: ${allowedExts.join(", ")}` });
          return;
        }

        // Step 1 — read & hash
        send({ type: "progress", stage: "parsing", message: "正在读取文件...", percent: 5 });
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const md5 = createHash("md5").update(buffer).digest("hex");

        // Step 2 — duplicate check
        send({ type: "progress", stage: "parsing", message: "检查是否重复...", percent: 10 });
        const existing = findUploadByMd5(md5);
        if (existing) {
          const cached = getContentsBySourceMd5(md5);
          send({
            type: "done",
            result: {
              success: true,
              duplicate: true,
              count: cached.length,
              message: `检测到重复文件（与"${existing.original_name}"相同），直接返回已有的 ${cached.length} 条内容`,
              entries: cached.map((c) => ({
                id: c.id,
                title: c.title,
                category: c.category_name,
                tags: c.tags,
              })),
            },
          });
          return;
        }

        // Step 3 — parse file
        send({ type: "progress", stage: "parsing", message: "正在解析文件内容...", percent: 15 });
        await writeFile(tempPath, buffer);
        const rawText = await parseFile(tempPath, file.name);
        if (!rawText.trim()) {
          send({ type: "error", error: "文件内容为空" });
          return;
        }
        send({ type: "progress", stage: "parsing", message: "文件解析完成，开始 AI 分析...", percent: 20 });

        // Step 4 — AI analysis with progress callbacks
        const onProgress: ProgressCallback = (info) => {
          send({ type: "progress", ...info });
        };
        const analysis = await analyzeContent(rawText, file.name, onProgress);

        // Step 5 — save to database
        send({ type: "progress", stage: "saving", message: `正在保存 ${analysis.entries.length} 条内容...`, percent: 88 });
        const savedEntries: { id: number; merged: boolean }[] = [];
        let mergedCount = 0;
        let insertedCount = 0;
        for (const entry of analysis.entries) {
          const existing = findSimilarContent(entry.title, entry.category);
          if (existing) {
            mergeContentBody(existing.id, entry.body);
            savedEntries.push({ id: existing.id, merged: true });
            mergedCount++;
          } else {
            const id = insertContent({
              title: entry.title,
              body: entry.body,
              summary: entry.summary,
              category_name: entry.category,
              tags: entry.tags,
              source_filename: file.name,
            });
            savedEntries.push({ id, merged: false });
            insertedCount++;
          }
        }

        // Step 6 — cache file
        send({ type: "progress", stage: "saving", message: "正在缓存文件...", percent: 95 });
        await mkdir(CACHE_DIR, { recursive: true });
        const cachedPath = path.join(CACHE_DIR, `${md5}${ext}`);
        await copyFile(tempPath, cachedPath);
        recordUpload({ md5, original_name: file.name, cached_path: cachedPath, entry_count: savedEntries.length });

        // Done
        send({
          type: "done",
          result: {
            success: true,
            duplicate: false,
            count: savedEntries.length,
            mergedCount,
            insertedCount,
            entries: analysis.entries.map((e, i) => ({
              id: savedEntries[i].id,
              title: e.title,
              category: e.category,
              tags: e.tags,
              merged: savedEntries[i].merged,
            })),
          },
        });
      } catch (err) {
        console.error("Upload error:", err);
        send({ type: "error", error: err instanceof Error ? err.message : "处理失败" });
      } finally {
        controller.close();
        try { await unlink(tempPath); } catch { /* ignore */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
