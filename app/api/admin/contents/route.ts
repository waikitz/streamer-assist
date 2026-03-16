import { NextRequest, NextResponse } from "next/server";
import { deleteContents, moveContents } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const ids: unknown = body?.ids;
    const category: unknown = body?.category;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "请提供要移动的条目 ID 列表" }, { status: 400 });
    }
    if (typeof category !== "string" || !category.trim()) {
      return NextResponse.json({ error: "请提供目标分类名称" }, { status: 400 });
    }

    const numIds = ids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (numIds.length === 0) {
      return NextResponse.json({ error: "ID 列表无效" }, { status: 400 });
    }

    const moved = moveContents(numIds, category.trim());
    return NextResponse.json({ success: true, moved });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Move contents error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const ids: unknown = body?.ids;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "请提供要删除的条目 ID 列表" }, { status: 400 });
    }

    const numIds = ids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (numIds.length === 0) {
      return NextResponse.json({ error: "ID 列表无效" }, { status: 400 });
    }

    const deleted = deleteContents(numIds);
    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Delete contents error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
