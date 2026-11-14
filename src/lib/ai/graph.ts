import "server-only";

import {
  END,
  MessagesValue,
  START,
  StateGraph,
  StateSchema,
  type GraphNode,
} from "@langchain/langgraph";

import { createChatModel } from "./model";

const AssistantState = new StateSchema({
  messages: MessagesValue,
});

/** LangGraph entry point for adding nodes, branches, and tools later. */
export function createAppGraph() {
  const respond: GraphNode<typeof AssistantState> = async (state, config) => {
    const message = await createChatModel().invoke(state.messages, config);
    return { messages: [message] };
  };

  return new StateGraph(AssistantState)
    .addNode("respond", respond)
    .addEdge(START, "respond")
    .addEdge("respond", END)
    .compile();
}
