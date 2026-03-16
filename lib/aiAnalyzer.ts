import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
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

const SYSTEM_PROMPT = `你是一个专业的直播内容整理助手，帮助整理直播主播的参考资料。
你的任务是分析上传的文档内容，将其整理成结构化的条目，方便主播快速查找和使用。

常见的内容类型包括（但不限于）：
- 户外景点介绍：景点的背景、历史、特色等
- 景点口播稿：适合直播中直接朗读的介绍文字
- 观众问答：常见问题及回答
- 音乐资讯：歌曲、艺人、音乐推荐等信息
- 活动信息：演出、展览、节庆活动
- 地方美食：餐厅、小吃、特色菜肴
- 交通攻略：路线、交通方式、注意事项
- 直播技巧：互动话术、注意事项
- 其他：根据内容判断最合适的分类

请将文档内容拆分为独立的、有意义的条目，每个条目应该：
1. 有清晰的标题
2. 包含完整的内容正文
3. 有简短的摘要（50字以内）
4. 归属到最合适的分类
5. 带有相关的中文标签（3-6个）

输出必须是严格的JSON格式。`;

export async function analyzeContent(
  rawText: string,
  filename: string
): Promise<AnalysisResult> {
  const truncated =
    rawText.length > 15000 ? rawText.slice(0, 15000) + "\n...(内容已截断)" : rawText;

  const stream = await client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `请分析以下来自文件"${filename}"的内容，并整理为结构化条目。

文件内容：
${truncated}

请以JSON格式返回，格式如下：
{
  "entries": [
    {
      "title": "条目标题",
      "body": "完整内容正文（保留原文的详细内容）",
      "summary": "简短摘要（50字以内）",
      "category": "分类名称",
      "tags": ["标签1", "标签2", "标签3"]
    }
  ]
}

注意：
- body字段保留尽可能完整的原文内容
- 一个文档可以拆分为多个条目
- 分类名称要简洁明确（如"景点介绍"、"口播稿"、"观众问答"等）
- 只返回JSON，不要其他解释`,
      },
    ],
  });

  const response = await stream.finalMessage();
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI未返回有效响应");
  }

  const text = textBlock.text.trim();

  // Extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI响应中没有找到有效的JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]) as AnalysisResult;
  return parsed;
}
