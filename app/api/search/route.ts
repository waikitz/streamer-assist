import { NextRequest, NextResponse } from "next/server";
import { searchContents } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";
  const category = searchParams.get("category") || "";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  try {
    const results = searchContents(
      query.trim(),
      category.trim() || undefined,
      limit
    );
    return NextResponse.json({ results, total: results.length });
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json({ error: "搜索失败" }, { status: 500 });
  }
}
