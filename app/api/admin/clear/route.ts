import { NextRequest, NextResponse } from "next/server";
import { clearDatabase, clearFileCache } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  try {
    if (body?.action === "clear_database") {
      if (body?.confirm !== "DELETE_ALL") {
        return NextResponse.json({ error: "缺少确认参数" }, { status: 400 });
      }
      const result = clearDatabase();
      return NextResponse.json({ success: true, ...result });
    }

    if (body?.action === "clear_cache") {
      if (body?.confirm !== "DELETE_ALL") {
        return NextResponse.json({ error: "缺少确认参数" }, { status: 400 });
      }
      const result = clearFileCache();
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json({ error: "无效的操作类型" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Clear error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
