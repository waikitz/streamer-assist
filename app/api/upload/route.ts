import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { parseFile } from "@/lib/fileParser";
import { analyzeContent } from "@/lib/aiAnalyzer";
import { insertContent } from "@/lib/db";

export async function POST(request: NextRequest) {
  const tempPath = path.join(tmpdir(), `upload-${Date.now()}`);

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "请选择文件" }, { status: 400 });
    }

    const allowedExts = [".txt", ".md", ".pdf", ".docx"];
    const ext = path.extname(file.name).toLowerCase();
    if (!allowedExts.includes(ext)) {
      return NextResponse.json(
        { error: `不支持的文件类型: ${ext}。支持: ${allowedExts.join(", ")}` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    await writeFile(tempPath, Buffer.from(bytes));

    // Parse file content
    const rawText = await parseFile(tempPath, file.name);
    if (!rawText.trim()) {
      return NextResponse.json({ error: "文件内容为空" }, { status: 400 });
    }

    // AI analysis
    const analysis = await analyzeContent(rawText, file.name);

    // Save to database
    const savedIds: number[] = [];
    for (const entry of analysis.entries) {
      const id = insertContent({
        title: entry.title,
        body: entry.body,
        summary: entry.summary,
        category_name: entry.category,
        tags: entry.tags,
        source_filename: file.name,
      });
      savedIds.push(id);
    }

    return NextResponse.json({
      success: true,
      count: savedIds.length,
      entries: analysis.entries.map((e, i) => ({
        id: savedIds[i],
        title: e.title,
        category: e.category,
        tags: e.tags,
      })),
    });
  } catch (err) {
    console.error("Upload error:", err);
    const message = err instanceof Error ? err.message : "处理失败";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    try {
      await unlink(tempPath);
    } catch {
      // ignore
    }
  }
}
