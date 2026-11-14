import { z } from "zod";
import { parseServerEnv } from "../env/schema";
import { jsonRequest, requireProvider } from "./providers";
import type { AgentReceipt } from "./types";

export type ToolResult = {
  status: "done" | "blocked" | "waiting" | "failed";
  summary: string;
  data?: unknown;
};
export interface AgentTool {
  description: string;
  schema: z.ZodType;
  platforms: string[];
  execute(input: unknown): Promise<ToolResult>;
}
export type ModelMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ModelReply["tool_calls"];
};
const replySchema = z.object({
  content: z.string().nullable().optional(),
  tool_calls: z
    .array(
      z.object({
        id: z.string().min(1),
        type: z.literal("function"),
        function: z.object({
          name: z.string(),
          arguments: z.string().max(60000),
        }),
      }),
    )
    .max(6)
    .optional(),
});
export type ModelReply = z.infer<typeof replySchema>;
export interface ModelRequest {
  messages: ModelMessage[];
  tools: Record<string, AgentTool>;
  forceTool?: string;
  allowTools: boolean;
}
export type AgentModel = (request: ModelRequest) => Promise<ModelReply>;

// Same function-tool protocol as the reference BOT. Only the configured Nosana
// endpoint receives model requests; this module cannot select another provider.
export const nosanaAgentModel: AgentModel = async (request) => {
  requireProvider("Nosana 文本");
  const env = parseServerEnv(process.env);
  const tools = Object.entries(request.tools).map(([name, tool]) => ({
    type: "function",
    function: {
      name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.schema),
    },
  }));
  const result = await jsonRequest(
    `${env.NOSANA_BASE_URL}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.NOSANA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.NOSANA_MODEL,
        messages: request.messages,
        temperature: 0,
        max_tokens: 3000,
        ...(tools.length
          ? {
              tools,
              tool_choice: !request.allowTools
                ? "none"
                : request.forceTool
                  ? { type: "function", function: { name: request.forceTool } }
                  : "auto",
              parallel_tool_calls: false,
            }
          : {}),
      }),
    },
    "Nosana",
  );
  return z
    .object({ choices: z.array(z.object({ message: replySchema })).min(1) })
    .parse(result).choices[0].message;
};

export function safeAgentError(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  if (error instanceof z.ZodError)
    return "工具参数或返回数据格式不正确，未确认执行成功。";
  return /^(请先在|Nosana|Tavily|Daytona|CodeAF|排程|独立|附件|模型|AI 对话|图片识别|语音识别)/.test(
    raw,
  ) && !/https?:\/\/|Bearer |sk-|Authorization/i.test(raw)
    ? raw
    : "本步骤未完成，请检查连接设置和输入信息。";
}

export async function runToolAgent(options: {
  model: AgentModel;
  system: string;
  messages: ModelMessage[];
  tools: Record<string, AgentTool>;
  forceFirstTool?: string;
  maxRounds?: number;
  onReceipt?: (receipt: AgentReceipt) => void;
}) {
  const messages: ModelMessage[] = [
    { role: "system", content: options.system },
    ...options.messages,
  ];
  const receipts: AgentReceipt[] = [];
  const seenCalls = new Set<string>();
  const reused = new Map<string, ToolResult>();
  const maxRounds = options.maxRounds ?? 6;
  let calls = 0;
  for (let round = 0; round <= maxRounds; round++) {
    const reply = replySchema.parse(
      await options.model({
        messages,
        tools: options.tools,
        allowTools: round < maxRounds,
        ...(round === 0 && options.forceFirstTool
          ? { forceTool: options.forceFirstTool }
          : {}),
      }),
    );
    const toolCalls = reply.tool_calls || [];
    if (!toolCalls.length) {
      if (round === 0 && options.forceFirstTool)
        throw new Error(
          "模型未调用必要的规划工具，请使用支持工具调用的 Nosana 模型。",
        );
      if (!reply.content?.trim()) throw new Error("模型没有返回有效答复。");
      return { text: reply.content.trim(), receipts };
    }
    if (round === maxRounds || calls + toolCalls.length > 16)
      throw new Error("模型达到工具调用上限，已停止后续执行。");
    if (
      round === 0 &&
      options.forceFirstTool &&
      (toolCalls.length !== 1 ||
        toolCalls[0].function.name !== options.forceFirstTool)
    )
      throw new Error("模型未按要求先生成任务计划，未执行工具。");
    messages.push({
      role: "assistant",
      content: reply.content || null,
      tool_calls: toolCalls,
    });
    for (const call of toolCalls) {
      calls++;
      if (seenCalls.has(call.id))
        throw new Error("模型重复使用工具调用标识，已停止执行。");
      seenCalls.add(call.id);
      const tool = options.tools[call.function.name];
      let result: ToolResult;
      let attempted = false;
      try {
        if (!tool) throw new Error("工具不在当前智能体权限内。");
        const args = tool.schema.parse(JSON.parse(call.function.arguments));
        const signature = call.function.name + JSON.stringify(args);
        if (reused.has(signature)) result = reused.get(signature)!;
        else {
          attempted = true;
          result = await tool.execute(args);
          reused.set(signature, result);
        }
      } catch (error) {
        result = { status: "failed", summary: safeAgentError(error) };
      }
      const receipt: AgentReceipt = {
        id: call.id,
        tool: call.function.name,
        platforms: attempted ? tool?.platforms || [] : [],
        status: result.status,
        summary: result.summary,
        at: new Date().toISOString(),
      };
      receipts.push(receipt);
      options.onReceipt?.(receipt);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 22000),
      });
      if (result.status !== "done") return { text: result.summary, receipts };
    }
  }
  throw new Error("模型达到工具调用上限，已停止后续执行。");
}
