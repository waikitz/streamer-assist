import { getAllCategories, getContentsByCategory } from "@/lib/db";

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

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-700">📚 内容分类</h1>

      {categories.length === 0 ? (
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
      ) : (
        <>
          {/* Category grid */}
          <div className="grid grid-cols-2 gap-3">
            {categories.map((cat) => (
              <a
                key={cat.id}
                href={`/categories?cat=${encodeURIComponent(cat.name)}`}
                className={`bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-all border-2 ${
                  selectedCat === cat.name
                    ? "border-pink-400 bg-pink-50"
                    : "border-transparent hover:border-pink-200"
                }`}
              >
                <div className="text-2xl mb-1.5">
                  {getCategoryIcon(cat.name)}
                </div>
                <div className="font-semibold text-gray-700 text-sm leading-tight">
                  {cat.name}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {cat.count} 条内容
                </div>
              </a>
            ))}
          </div>

          {/* Content list for selected category */}
          {selectedCat && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-700">
                  {selectedCat}
                  <span className="ml-2 text-sm font-normal text-gray-400">
                    ({contents.length} 条)
                  </span>
                </h2>
                <a
                  href="/categories"
                  className="text-xs text-pink-400 hover:text-pink-600"
                >
                  清除选择
                </a>
              </div>

              {contents.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 text-center text-gray-400 shadow-sm">
                  该分类暂无内容
                </div>
              ) : (
                contents.map((item) => (
                  <a
                    key={item.id}
                    href={`/content/${item.id}`}
                    className="block bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow border border-transparent hover:border-pink-100"
                  >
                    <h3 className="text-base font-semibold text-gray-800 leading-snug">
                      {item.title}
                    </h3>
                    {item.summary && (
                      <p className="text-sm text-gray-500 mt-1.5 line-clamp-2">
                        {item.summary}
                      </p>
                    )}
                    {item.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {item.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </a>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function getCategoryIcon(name: string): string {
  const icons: Record<string, string> = {
    "景点介绍": "🏔️",
    "口播稿": "🎤",
    "观众问答": "💬",
    "音乐资讯": "🎵",
    "活动信息": "🎉",
    "地方美食": "🍜",
    "交通攻略": "🚌",
    "直播技巧": "📡",
    "户外景点": "🌿",
    "景点口播": "🎙️",
  };
  for (const [key, icon] of Object.entries(icons)) {
    if (name.includes(key) || key.includes(name)) return icon;
  }
  return "📄";
}
