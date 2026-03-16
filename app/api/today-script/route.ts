import { NextRequest, NextResponse } from "next/server";
import {
  getTodayScript,
  addToTodayScript,
  removeFromTodayScript,
  clearTodayScript,
  reorderTodayScript,
} from "@/lib/db";

export const dynamic = "force-dynamic";

// GET — list today's script items in order
export async function GET() {
  try {
    const items = getTodayScript();
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST — add content items by content_id array
// body: { contentIds: number[] }
export async function POST(req: NextRequest) {
  try {
    const { contentIds } = (await req.json()) as { contentIds: number[] };
    if (!Array.isArray(contentIds) || contentIds.length === 0) {
      return NextResponse.json({ error: "contentIds 不能为空" }, { status: 400 });
    }
    const added = addToTodayScript(contentIds);
    return NextResponse.json({ success: true, added });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE — remove entries or clear all
// body: { ids: number[] } to remove specific entries (today_script.id)
// body: { all: true }    to clear everything
export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json()) as { ids?: number[]; all?: boolean };
    if (body.all) {
      const count = clearTodayScript();
      return NextResponse.json({ success: true, removed: count });
    }
    if (Array.isArray(body.ids) && body.ids.length > 0) {
      const removed = removeFromTodayScript(body.ids);
      return NextResponse.json({ success: true, removed });
    }
    return NextResponse.json({ error: "请提供 ids 或 all:true" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PATCH — reorder items
// body: { order: number[] } — ordered array of today_script ids
export async function PATCH(req: NextRequest) {
  try {
    const { order } = (await req.json()) as { order: number[] };
    if (!Array.isArray(order)) {
      return NextResponse.json({ error: "order 必须是数组" }, { status: 400 });
    }
    reorderTodayScript(order);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
