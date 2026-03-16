import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.GLM_API_KEY,
  baseURL: "https://open.bigmodel.cn/api/paas/v4/",
});

export interface AnalysisResult {
  entries: Array<{
    title: string;
    body: string;
    summary: string;
    category: string;
    tags: string[];
  }>;
}

export type ProgressCallback = (info: {
  stage: "parsing" | "analyzing" | "saving" | "done";
  message: string;
  percent: number;
  chunk?: number;
  total?: number;
}) => void;

const SYSTEM_PROMPT = `你是一个专业的直播内容整理助手，帮助整理直播主播的参考资料。

【条目划分原则】
以文档的章节/话题为单位划分条目，遵循以下规则：
1. 同一个主题/标题下的所有内容（包括子标题、细节、列表、说明）必须合并为一个条目，不得拆散
2. 识别文档结构：Markdown标题(#/##/###)、数字编号(一、1.、（1）)、空行分隔的独立段落，均视为章节边界
3. body字段完整保留该章节的全部原文（包含子标题和细节），不得删减、改写或压缩
4. 如果文档没有明显章节划分，则每个独立完整的话题段落作为一个条目
5. 不同话题之间绝不合并，每个话题必须独立成条
6. 文档中所有内容都必须覆盖，不得遗漏任何章节

【分类规则】
必须从以下固定分类中选择最合适的一个，不得自创分类：
- 景点介绍：景点背景、历史、地理特征、著名程度
- 口播稿：适合直播时直接朗读的介绍脚本
- 观众问答：观众提问及主播回答的互动内容
- 音乐资讯：歌曲、艺人、专辑、音乐故事
- 活动信息：演出、展览、节庆、赛事活动
- 地方美食：餐厅、小吃、特色菜肴、美食攻略
- 交通攻略：路线规划、交通方式、注意事项
- 直播技巧：互动话术、直播操作、注意事项
- 萌宠内容：宠物品种、养宠知识、萌宠故事
- 其他：无法归入上述分类的内容

【title规则】
使用该章节/话题的标题或核心主题，简洁明确，20字以内

【summary规则】
用1-2句话概括该条目的核心内容，方便快速浏览

【tags规则】
标签要具体，包含：地名/人名/品种名/关键词等，方便搜索，3-6个

必须以合法的JSON格式返回，结构如下：
{"entries":[{"title":"...","body":"...","summary":"...","category":"...","tags":["..."]}]}`;

// Characters per chunk — keep output well within token limits
const CHUNK_SIZE = 25000;

// Delay between chunk API calls (ms)
// Free tier (~5 RPM): 13000ms | Paid tier (~60 RPM): 1500ms
const INTER_CHUNK_DELAY_MS = 1500;

/** Sleep for given milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract retry-after seconds from a GLM/OpenAI 429 error, if available */
function getRetryAfter(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const e = err as Record<string, unknown>;
  // openai SDK may expose headers
  const headers = e["headers"] as Record<string, string> | undefined;
  if (headers) {
    const ra = headers["retry-after"] ?? headers["x-ratelimit-reset-requests"];
    if (ra) {
      const seconds = parseFloat(ra);
      if (!isNaN(seconds)) return Math.ceil(seconds) * 1000;
    }
  }
  return null;
}

/** Call fn with exponential backoff on 429 rate-limit errors */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  let delay = 5000; // start at 5s backoff on 429
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit =
        (err instanceof Error && err.message.includes("429")) ||
        (typeof err === "object" && err !== null && (err as { status?: number }).status === 429);
      if (isRateLimit && attempt < maxRetries) {
        // Prefer server-supplied retry-after, otherwise use our own backoff
        const serverWait = getRetryAfter(err);
        const wait = serverWait ?? delay;
        console.warn(
          `[GLM] 429 rate limited — waiting ${(wait / 1000).toFixed(0)}s before retry (attempt ${attempt + 1}/${maxRetries})`
        );
        await sleep(wait);
        if (!serverWait) delay = Math.min(delay * 2, 120000); // cap at 2 min
      } else {
        throw err;
      }
    }
  }
  throw new Error("GLM API 请求频率超限，请稍后再试");
}

function splitIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + CHUNK_SIZE;

    if (end < text.length) {
      // Try to break at a paragraph boundary (\n\n), then newline, then space
      const paragraphBreak = text.lastIndexOf("\n\n", end);
      const newlineBreak = text.lastIndexOf("\n", end);
      const spaceBreak = text.lastIndexOf(" ", end);

      if (paragraphBreak > start + CHUNK_SIZE * 0.5) {
        end = paragraphBreak;
      } else if (newlineBreak > start + CHUNK_SIZE * 0.5) {
        end = newlineBreak;
      } else if (spaceBreak > start + CHUNK_SIZE * 0.5) {
        end = spaceBreak;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end;
  }

  return chunks.filter((c) => c.length > 0);
}

interface ChunkResult {
  entries: AnalysisResult["entries"];
  /** Text from the original chunk that was not covered by returned entries (needs re-processing) */
  remainder: string;
}

async function analyzeChunk(
  chunk: string,
  filename: string,
  label: string
): Promise<ChunkResult> {
  const completion = await withRetry(() =>
    client.chat.completions.create({
      model: "glm-4.7",
      max_tokens: 32768,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `请分析文件"${filename}"${label}的全部内容，为每一段独立内容建立条目（不得遗漏任何内容），以JSON格式返回。\n\n文件内容：\n${chunk}`,
        },
      ],
    })
  );

  const choice = completion.choices[0];
  const truncated = choice.finish_reason === "length";
  const responseText = choice.message?.content?.trim();

  if (!responseText) {
    throw new Error(`AI未返回有效响应（${label || "分析"}）`);
  }

  // Try full JSON parse first
  let entries: AnalysisResult["entries"];
  try {
    const parsed = JSON.parse(responseText) as AnalysisResult;
    entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    // JSON was cut off — salvage whatever complete objects we can
    entries = salvageEntries(responseText);
    if (entries.length === 0) {
      throw new Error(`JSON解析失败且无法提取有效条目（${label || "分析"}）`);
    }
  }

  // If the response was truncated, work out which part of the original
  // chunk text wasn't covered so we can re-process it.
  let remainder = "";
  if (truncated && entries.length > 0) {
    remainder = findRemainder(chunk, entries);
    if (remainder.length > 100) {
      console.warn(
        `[aiAnalyzer] 响应被截断，${remainder.length} 字未处理，将重新分析`
      );
    }
  }

  return { entries, remainder };
}

/**
 * Given the original chunk text and the entries the AI returned,
 * find the last body text in the chunk and return everything after it.
 * This is the text the AI didn't get to process due to token limits.
 */
function findRemainder(
  chunk: string,
  entries: AnalysisResult["entries"]
): string {
  // Use the last entry's body text as a landmark — find its end position in chunk
  for (let i = entries.length - 1; i >= 0; i--) {
    const body = entries[i].body?.trim();
    if (!body || body.length < 20) continue;
    // Search for a reasonably long prefix of the body in the original text
    const probe = body.slice(0, Math.min(body.length, 80));
    const pos = chunk.indexOf(probe);
    if (pos !== -1) {
      const afterEntry = pos + body.length;
      return chunk.slice(afterEntry).trimStart();
    }
  }
  // Could not locate any body text — return empty (don't duplicate)
  return "";
}

/** Try to extract fully-formed entry objects from a truncated JSON string */
function salvageEntries(text: string): AnalysisResult["entries"] {
  const entries: AnalysisResult["entries"] = [];
  // Greedily match {...} blocks that may contain nested arrays (for tags)
  const pattern = /\{(?:[^{}]|\[[^\]]*\])*"title"(?:[^{}]|\[[^\]]*\])*\}/g;
  const matches = text.match(pattern) ?? [];
  for (const m of matches) {
    try {
      const obj = JSON.parse(m) as Partial<AnalysisResult["entries"][0]>;
      if (obj.title && obj.body) {
        entries.push({
          title: obj.title,
          body: obj.body,
          summary: obj.summary ?? "",
          category: obj.category ?? "其他",
          tags: Array.isArray(obj.tags) ? obj.tags : [],
        });
      }
    } catch {
      // skip malformed object
    }
  }
  return entries;
}

export async function analyzeContent(
  rawText: string,
  filename: string,
  onProgress?: ProgressCallback
): Promise<AnalysisResult> {
  const text =
    rawText.length > 100000
      ? rawText.slice(0, 100000) + "\n...(内容已截断)"
      : rawText;

  // Queue starts with normal chunks; remainders from truncated responses get appended
  const queue: string[] = splitIntoChunks(text);
  const initialTotal = queue.length;
  const allEntries: AnalysisResult["entries"] = [];
  let callCount = 0;

  while (queue.length > 0) {
    const chunk = queue.shift()!;
    if (!chunk.trim()) continue;

    // Throttle between API calls
    if (callCount > 0) {
      await sleep(INTER_CHUNK_DELAY_MS);
    }
    callCount++;

    const total = Math.max(initialTotal, callCount + queue.length);
    const label = total > 1 ? `（第 ${callCount}/${total} 部分）` : "";

    // Report progress: analyzing phase occupies 20%-85%
    const analyzePercent = Math.round(20 + ((callCount - 1) / Math.max(total, 1)) * 65);
    onProgress?.({
      stage: "analyzing",
      message: total > 1
        ? `AI 正在分析第 ${callCount}/${total} 部分...`
        : "AI 正在分析内容...",
      percent: analyzePercent,
      chunk: callCount,
      total,
    });

    const result = await analyzeChunk(chunk, filename, label);
    allEntries.push(...result.entries);

    // If the AI was truncated and left a remainder, re-queue it as the next chunk
    if (result.remainder.length > 100) {
      queue.unshift(result.remainder);
    }
  }

  if (allEntries.length === 0) {
    throw new Error("AI返回的条目列表为空");
  }

  return { entries: allEntries };
}
