import "server-only";

import { createAgent } from "langchain";

import { createChatModel } from "./model";

/** LangChain entry point. Add domain-specific tools as the project grows. */
export function createAppAgent() {
  return createAgent({
    model: createChatModel(),
    tools: [],
    systemPrompt: "You are a helpful assistant. Reply in the user's language.",
  });
}
