import { NextResponse } from "next/server";
import { getAllCategories } from "@/lib/db";

export async function GET() {
  try {
    const categories = getAllCategories();
    return NextResponse.json({ categories });
  } catch (err) {
    console.error("Categories error:", err);
    return NextResponse.json({ error: "获取分类失败" }, { status: 500 });
  }
}
