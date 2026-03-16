import { NextRequest, NextResponse } from "next/server";
import { renameCategory } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const oldName: unknown = body?.oldName;
    const newName: unknown = body?.newName;

    if (typeof oldName !== "string" || !oldName.trim()) {
      return NextResponse.json({ error: "请提供原分类名称" }, { status: 400 });
    }
    if (typeof newName !== "string" || !newName.trim()) {
      return NextResponse.json({ error: "请提供新分类名称" }, { status: 400 });
    }
    if (oldName.trim() === newName.trim()) {
      return NextResponse.json({ error: "新名称与原名称相同" }, { status: 400 });
    }

    const result = renameCategory(oldName.trim(), newName.trim());
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Rename category error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
