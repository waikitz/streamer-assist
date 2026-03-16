import { getContentById } from "@/lib/db";
import { notFound } from "next/navigation";
import { marked } from "marked";

export default async function ContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const content = getContentById(parseInt(id));

  if (!content) notFound();

  const bodyHtml = await marked.parse(content.body, { gfm: true, breaks: true });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <div className="space-y-4">
      {/* Back button */}
      <a
        href="/"
        className="inline-flex items-center gap-1.5 text-pink-500 hover:text-pink-700 text-sm font-medium"
      >
        ← 返回搜索
      </a>

      {/* Content card */}
      <article className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-pink-50 to-rose-50 px-5 pt-5 pb-4 border-b border-pink-100">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="bg-pink-400 text-white text-xs px-3 py-1 rounded-full font-medium">
              {content.category_name}
            </span>
            <span className="text-xs text-gray-400">{formatDate(content.created_at)}</span>
          </div>
          <h1 className="text-xl font-bold text-gray-800 leading-tight">
            {content.title}
          </h1>
          {content.summary && (
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              {content.summary}
            </p>
          )}
          {content.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {content.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs text-pink-500 bg-pink-50 border border-pink-100 px-2.5 py-0.5 rounded-full"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        </div>

        {/* Footer */}
        {content.source_filename && (
          <div className="px-5 pb-5 text-xs text-gray-400 flex items-center gap-1">
            <span>📄</span>
            <span>来源：{content.source_filename}</span>
          </div>
        )}
      </article>

      {/* Copy button */}
      <CopyButton text={content.body} />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  return (
    <div
      suppressHydrationWarning
      data-copy-text={text}
      id="copy-btn-wrapper"
    >
      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener('DOMContentLoaded', function() {
              var wrapper = document.getElementById('copy-btn-wrapper');
              if (!wrapper) return;
              var btn = document.createElement('button');
              btn.textContent = '📋 复制全文';
              btn.className = 'w-full bg-gradient-to-r from-pink-400 to-rose-400 text-white rounded-xl py-3 text-base font-semibold hover:from-pink-500 hover:to-rose-500 transition-all shadow-sm';
              btn.onclick = function() {
                var text = wrapper.dataset.copyText || '';
                navigator.clipboard.writeText(text).then(function() {
                  btn.textContent = '✅ 已复制！';
                  setTimeout(function() { btn.textContent = '📋 复制全文'; }, 2000);
                }).catch(function() {
                  btn.textContent = '复制失败，请手动选择';
                });
              };
              wrapper.appendChild(btn);
            });
          `,
        }}
      />
    </div>
  );
}
