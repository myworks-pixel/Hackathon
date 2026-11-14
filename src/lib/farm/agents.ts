import { randomUUID } from "node:crypto";
import type {
  AgentId,
  AgentMode,
  AgentRun,
  Candidate,
  FarmState,
} from "./types";

export function traceMessage(s: FarmState, text = "智能体正在协作处理。") {
  const message = {
    id: randomUUID(),
    role: "assistant" as const,
    text,
    at: new Date().toISOString(),
    tag: "智能体协作",
    agents: [] as AgentRun[],
  };
  s.messages.push(message);
  return message;
}
export function startAgent(
  s: FarmState,
  messageId: string | undefined,
  agent: AgentId,
  platforms: string[],
  mode: AgentMode,
  summary: string,
) {
  const message = s.messages.find((m) => m.id === messageId) || traceMessage(s);
  const run: AgentRun = {
    id: randomUUID(),
    agent,
    platforms,
    mode,
    summary,
    status: "running",
    startedAt: new Date().toISOString(),
  };
  (message.agents ??= []).push(run);
  return run.id;
}
export function finishAgent(
  s: FarmState,
  id: string,
  status: AgentRun["status"],
  summary?: string,
) {
  const run = s.messages
    .flatMap((m) => m.agents || [])
    .find((r) => r.id === id);
  if (!run) return;
  run.status = status;
  if (summary) run.summary = summary;
  run.finishedAt = new Date().toISOString();
}
export function recordAgent(
  s: FarmState,
  messageId: string,
  agent: AgentId,
  platforms: string[],
  mode: AgentMode,
  summary: string,
  status: AgentRun["status"] = "done",
) {
  const id = startAgent(s, messageId, agent, platforms, mode, summary);
  finishAgent(s, id, status);
}
const normalize = (value: string) =>
  value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
// Exact business facts only. Similar names alone must never merge two customers.
export function reviewCandidates(s: FarmState, candidates: Candidate[]) {
  const same = (a: Candidate, b: Candidate) =>
    normalize(a.customer) === normalize(b.customer) &&
    normalize(a.address) === normalize(b.address) &&
    a.kg === b.kg &&
    Date.parse(a.due) === Date.parse(b.due);
  const accepted: Candidate[] = [],
    duplicates: Candidate[] = [];
  for (const candidate of candidates) {
    if (
      s.orders.some((o) => o.status !== "cancelled" && same(o, candidate)) ||
      accepted.some((o) => same(o, candidate))
    )
      duplicates.push(candidate);
    else accepted.push(candidate);
  }
  return { accepted, duplicates };
}
