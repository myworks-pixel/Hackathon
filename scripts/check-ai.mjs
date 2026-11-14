import assert from "node:assert/strict";

import { RunnableLambda } from "@langchain/core/runnables";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { tool } from "langchain";
import { z } from "zod";
import { disableExternalTracing } from "./partner-config.mjs";

disableExternalTracing();

// Exercise the real libraries without calling a model or requiring credentials.
const add = tool(({ a, b }) => a + b, {
  name: "add",
  description: "Add two numbers for the local framework smoke check.",
  schema: z.object({ a: z.number(), b: z.number() }),
});

const State = new StateSchema({
  a: z.number(),
  b: z.number(),
  result: z.number().default(0),
});

const calculate = RunnableLambda.from(async ({ a, b }) => ({
  result: await add.invoke({ a, b }),
}));

const graph = new StateGraph(State)
  .addNode("calculate", calculate)
  .addEdge(START, "calculate")
  .addEdge("calculate", END)
  .compile();

for (const [a, b, expected] of [
  [2, 3, 5],
  [-4, 6, 2],
]) {
  const output = await graph.invoke({ a, b });
  assert.equal(output.result, expected);
}

console.log("LangChain tool + Runnable + LangGraph 自检通过（未调用模型）。");
