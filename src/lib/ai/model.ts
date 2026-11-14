import "server-only";

import { ChatOpenAI } from "@langchain/openai";

import { getApiKey, serverEnv } from "@/lib/env/server";

/** Create a model lazily so importing this module never requires a key. */
export function createChatModel() {
  if (!serverEnv.AI_MODEL) {
    throw new Error("请先在 .env.local 中配置 AI_MODEL，再调用模型。");
  }

  return new ChatOpenAI({
    model: serverEnv.AI_MODEL,
    apiKey: getApiKey("OPENAI_API_KEY"),
    timeout: 30_000,
    maxRetries: 2,
    ...(serverEnv.AI_BASE_URL
      ? {
          configuration: { baseURL: serverEnv.AI_BASE_URL },
          useResponsesApi: false,
        }
      : {}),
  });
}
