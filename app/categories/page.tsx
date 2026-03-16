import { getAllCategories, getContentsByCategory } from "@/lib/db";
import ContentListWithDelete from "./ContentListWithDelete";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const categories = getAllCategories();

  return (
    <CategoriesClient categories={categories} searchParams={searchParams} />
  );
}

async function CategoriesClient({
  categories,
  searchParams,
}: {
  categories: ReturnType<typeof getAllCategories>;
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;
  const selectedCat = cat || "";
  const contents = selectedCat
    ? getContentsByCategory(selectedCat, 50)
    : [];

  if (categories.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm">
        <div className="text-5xl mb-4">📂</div>
        <p className="text-base font-medium text-gray-500">暂无分类</p>
        <p className="text-sm mt-2">请先上传内容文件</p>
        <a
          href="/admin"
          className="inline-block mt-4 bg-pink-400 text-white px-6 py-2 rounded-full text-sm hover:bg-pink-500 transition-colors"
        >
          去上传
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Horizontal scrollable category tabs */}
      <div className="sticky top-0 bg-pink-50 z-10 py-2">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <Link
            href="/categories"
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedCat === ""
                ? "bg-pink-400 text-white"
                : "bg-white border border-pink-200 text-pink-600"
            }`}
          >
            全部
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/categories?cat=${encodeURIComponent(c.name)}`}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCat === c.name
                  ? "bg-pink-400 text-white"
                  : "bg-white border border-pink-200 text-pink-600"
              }`}
            >
              {c.name}
              <span className="ml-1 text-xs opacity-70">({c.count})</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Content list or prompt */}
      {selectedCat ? (
        <ContentListWithDelete
          contents={contents.map((c) => ({
            id: c.id,
            title: c.title,
            summary: c.summary,
            tags: c.tags,
            body: c.body,
            source_filename: c.source_filename,
          }))}
          category={selectedCat}
          allCategories={categories.map((c) => c.name)}
        />
      ) : (
        <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm">
          <div className="text-4xl mb-3">👆</div>
          <p className="text-base font-medium text-gray-500">请选择分类</p>
          <p className="text-sm mt-1">点击上方标签查看对应内容</p>
        </div>
      )}
    </div>
  );
}
