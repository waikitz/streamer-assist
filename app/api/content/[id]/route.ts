import { NextRequest, NextResponse } from "next/server";
import { getContentById } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contentId = parseInt(id);

  if (isNaN(contentId)) {
    return NextResponse.json({ error: "无效的ID" }, { status: 400 });
  }

  try {
    const content = getContentById(contentId);
    if (!content) {
      return NextResponse.json({ error: "内容不存在" }, { status: 404 });
    }
    return NextResponse.json({ content });
  } catch (err) {
    console.error("Content fetch error:", err);
    return NextResponse.json({ error: "获取内容失败" }, { status: 500 });
  }
}
