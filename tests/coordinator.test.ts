import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  AgentModel,
  ModelReply,
  ModelRequest,
} from "../src/lib/farm/agent-runtime";
import type { Job } from "../src/lib/farm/types";

const toolCall = (name: string, args: unknown): ModelReply => ({
  content: null,
  tool_calls: [
    {
      id: randomUUID(),
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    },
  ],
});
const assignment = (id: string, agentId: string, dependsOn: string[] = []) => ({
  id,
  agentId,
  task: `Perform ${agentId} work`,
  steps: ["Check facts", "Return evidence"],
  dependsOn,
});
async function fixture() {
  const store = await import("../src/lib/farm/store");
  const { initialState, enqueue } = await import("../src/lib/farm/domain");
  const { seedRuleShipment } = await import("../src/lib/farm/rules");
  return store.withWorkspace("simulation", () => {
    store.updateState((s) => {
      Object.assign(s, initialState(), {
        demo: true,
        ruleDraft: undefined,
        activeRule: undefined,
        ruleShipment: undefined,
        workerHeartbeat: new Date().toISOString(),
      });
      seedRuleShipment(s);
    });
    const job: Job = store.updateState((s) =>
      enqueue(s, "intake", {
        text: "今日は梱包済みの箱だけ発送してください。",
        locale: "ja",
      }),
    );
    job.execution = "live";
    store.updateState((s) => {
      s.jobs[0].execution = "live";
    });
    return { ...store, job };
  });
}

test("BOT validates semantic plans before execution: IDs, permissions, DAG and six-assignment budget", async () => {
  const { validatePlan } = await import("../src/lib/farm/coordinator");
  assert.equal(
    validatePlan({ reason: "Greeting", assignments: [] }).assignments.length,
    0,
  );
  const bad = [
    [assignment("one", "unknown")],
    [assignment("one", "orders"), assignment("one", "delivery")],
    [assignment("one", "orders", ["two"]), assignment("two", "delivery")],
    [assignment("one", "orders", ["one"])],
    Array.from({ length: 7 }, (_, i) => assignment(String(i), "reception")),
  ];
  for (const assignments of bad)
    assert.throws(() => validatePlan({ reason: "Invalid", assignments }));
  const plan = validatePlan({
    reason: "Two skills",
    assignments: [
      assignment("one", "orders"),
      { ...assignment("two", "delivery"), dependsOn: undefined },
    ],
  });
  assert.deepEqual(plan.assignments[1].dependsOn, ["one"]);
});

test("BOT calls only selected specialists and automatically passes dependency results", async () => {
  const f = await fixture();
  const { runCoordinator } = await import("../src/lib/farm/coordinator");
  const called: string[] = [];
  const model: AgentModel = async (req) =>
    req.forceTool
      ? toolCall("agent_plan", {
          reason: "Only rule and delivery expertise are needed.",
          assignments: [
            assignment("rule", "orders"),
            assignment("boundary", "delivery", ["rule"]),
          ],
        })
      : { content: "ルール案と配送条件を確認しました。" };
  await f.withWorkspace("simulation", () =>
    runCoordinator(f.job, {
      model,
      specialist: async (input) => {
        called.push(input.agentId);
        if (input.agentId === "delivery")
          assert.match(JSON.stringify(input.evidence), /draft-123/);
        return {
          status: "done",
          summary: "Checked",
          data: { ruleId: "draft-123" },
        };
      },
    }),
  );
  assert.deepEqual(called, ["orders", "delivery"]);
  const trace = f
    .withWorkspace("simulation", f.readState)
    .messages.find((m) => m.id === f.job.traceMessageId)!;
  assert.deepEqual(
    trace.agents?.map((r) => r.agent),
    ["coordinator", "orders", "delivery"],
  );
  assert.ok(trace.coordination?.assignments.every((a) => a.status === "done"));
});

test("failed or input-blocked specialists stop dependents; independent work can still finish", async () => {
  const f = await fixture();
  const { runCoordinator } = await import("../src/lib/farm/coordinator");
  const called: string[] = [];
  const model: AgentModel = async (req) =>
    req.forceTool
      ? toolCall("agent_plan", {
          reason: "Mixed dependencies",
          assignments: [
            assignment("first", "orders"),
            assignment("dependent", "delivery", ["first"]),
            assignment("independent", "supervision"),
          ],
        })
      : { content: "注文の確認が必要です。進捗確認のみ完了しました。" };
  await f.withWorkspace("simulation", () =>
    runCoordinator(f.job, {
      model,
      specialist: async (input) => {
        called.push(input.agentId);
        return input.agentId === "orders"
          ? { status: "waiting", summary: "何 kg ですか？" }
          : { status: "done", summary: "Checked" };
      },
    }),
  );
  assert.deepEqual(called, ["orders", "supervision"]);
  const trace = f
    .withWorkspace("simulation", f.readState)
    .messages.find((m) => m.id === f.job.traceMessageId)!;
  assert.deepEqual(
    trace.coordination?.assignments.map((a) => a.status),
    ["waiting", "blocked", "done"],
  );
  assert.ok(!trace.agents?.some((r) => r.agent === "delivery"));
});

test("each specialist receives only its scoped tools and cannot approve an order or shipment", async () => {
  const f = await fixture();
  const { createSpecialistTools } = await import("../src/lib/farm/specialists");
  for (const agentId of [
    "reception",
    "orders",
    "production",
    "delivery",
    "supervision",
    "adapter",
  ] as const) {
    const tools = createSpecialistTools({
      agentId,
      task: "test",
      steps: [],
      source: "test",
      evidence: [],
      locale: "ja",
      job: f.job,
      model: async () => ({ content: "test" }),
      onReceipt: () => {},
    });
    assert.ok(tools.read_farm);
    assert.ok(
      !tools.confirm_order &&
        !tools.ship_boxes &&
        !tools.confirm_rule &&
        !tools.agent_delegate,
    );
    assert.equal(!!tools.convert_order_table, agentId === "adapter");
    assert.equal(!!tools.draft_orders, agentId === "orders");
    assert.equal(!!tools.search_public_notices, agentId === "reception");
  }
});

test("tool execution deduplicates calls and stops immediately on required input", async () => {
  const { runToolAgent } = await import("../src/lib/farm/agent-runtime");
  let changed = 0,
    round = 0;
  const common = { schema: z.object({}).strict(), platforms: [] };
  const output = await runToolAgent({
    system: "test",
    messages: [],
    model: async () =>
      ++round <= 2 ? toolCall("write", {}) : toolCall("question", {}),
    tools: {
      write: {
        ...common,
        description: "write",
        execute: async () => {
          changed++;
          return { status: "done", summary: "saved" };
        },
      },
      question: {
        ...common,
        description: "ask",
        execute: async () => ({
          status: "waiting",
          summary: "Please supply the address",
        }),
      },
    },
  });
  assert.equal(changed, 1);
  assert.equal(round, 3);
  assert.equal(output.text, "Please supply the address");
  assert.equal(output.receipts.at(-1)?.status, "waiting");
});

test("sample data uses the real Nosana tool protocol by default and preserves the actual farm", async () => {
  const f = await fixture();
  const { tick } = await import("../src/lib/farm/worker");
  const before = f.readState();
  const priorFetch = globalThis.fetch;
  process.env.NOSANA_API_KEY = "test-only";
  process.env.NOSANA_MODEL = "tool-model";
  const calls: {
    url: string;
    body: ModelRequest & { tool_choice?: { function?: { name: string } } };
  }[] = [];
  try {
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push({ url: String(url), body });
      assert.equal(
        String(url),
        "https://inference.nosana.com/v1/chat/completions",
      );
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer test-only",
      );
      assert.equal(init?.redirect, "error");
      const force = body.tool_choice?.function?.name;
      let message: ModelReply;
      if (force === "agent_plan")
        message = toolCall("agent_plan", {
          reason: "Rule needs orders and delivery only",
          assignments: [
            assignment("rule", "orders"),
            assignment("check", "delivery", ["rule"]),
          ],
        });
      else if (force === "read_farm") message = toolCall("read_farm", {});
      else if (
        body.messages[0].content.includes("orders specialist") &&
        body.messages.at(-2)?.tool_calls?.[0]?.function?.name === "read_farm"
      )
        message = toolCall("draft_shipping_rule", {});
      else if (
        body.messages[0].content.includes("delivery specialist") &&
        body.messages.at(-2)?.tool_calls?.[0]?.function?.name === "read_farm"
      )
        message = toolCall("check_shipping_rule", {});
      else
        message = { content: "ルール案を作りました。確認前に発送しません。" };
      return Response.json({ choices: [{ message }] });
    };
    await f.withWorkspace("simulation", tick);
    const s = f.withWorkspace("simulation", f.readState);
    assert.equal(s.jobs[0].status, "done", s.jobs[0].error);
    assert.equal(s.ruleDraft?.status, "draft");
    assert.equal(s.activeRule, undefined);
    assert.ok(s.ruleShipment?.boxes.every((b) => !b.shippedAt));
    const trace = s.messages.find((m) => m.id === f.job.traceMessageId)!;
    assert.deepEqual(
      trace.agents?.map((r) => r.agent),
      ["coordinator", "orders", "delivery"],
    );
    assert.ok(trace.agents?.every((r) => r.mode === "live"));
    assert.equal(calls.length, 8);
    assert.deepEqual(f.readState(), before);
  } finally {
    globalThis.fetch = priorFetch;
    delete process.env.NOSANA_API_KEY;
    delete process.env.NOSANA_MODEL;
  }
});

test("a selected reception specialist uses Tavily for sample data and exposes tool receipts", async () => {
  const f = await fixture();
  const { runCoordinator } = await import("../src/lib/farm/coordinator");
  const priorFetch = globalThis.fetch;
  process.env.TAVILY_API_KEY = "tavily-test";
  let searches = 0;
  const model: AgentModel = async (request) => {
    if (request.forceTool === "agent_plan")
      return toolCall("agent_plan", {
        reason: "Research needs reception only",
        assignments: [assignment("weather", "reception")],
      });
    if (request.forceTool === "read_farm") return toolCall("read_farm", {});
    if (
      request.messages[0].content?.includes("reception specialist") &&
      request.messages.at(-2)?.tool_calls?.[0].function.name === "read_farm"
    )
      return toolCall("search_public_notices", {});
    return { content: "公式情報を確認しました。" };
  };
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "https://api.tavily.com/search");
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer tavily-test",
      );
      searches++;
      return Response.json({
        results: [
          {
            title: "Test public notice",
            url: "https://www.jma.go.jp/test",
            content: "Test weather evidence",
          },
        ],
      });
    };
    await f.withWorkspace("simulation", () => runCoordinator(f.job, { model }));
    assert.equal(searches, 2);
    const trace = f
      .withWorkspace("simulation", f.readState)
      .messages.find((m) => m.id === f.job.traceMessageId)!;
    assert.equal(trace.agents?.length, 2);
    assert.ok(
      trace.agents
        ?.find((r) => r.agent === "reception")
        ?.receipts?.some(
          (r) =>
            r.tool === "search_public_notices" &&
            r.status === "done" &&
            r.platforms.includes("Tavily"),
        ),
    );
  } finally {
    globalThis.fetch = priorFetch;
    delete process.env.TAVILY_API_KEY;
  }
});

test("live API failure on sample data is reported, never replaced with offline output", async () => {
  const f = await fixture();
  const { tick } = await import("../src/lib/farm/worker");
  const priorFetch = globalThis.fetch;
  process.env.NOSANA_API_KEY = "test-only";
  process.env.NOSANA_MODEL = "tool-model";
  try {
    globalThis.fetch = async () =>
      new Response("private server detail", { status: 401 });
    await f.withWorkspace("simulation", tick);
    const s = f.withWorkspace("simulation", f.readState);
    assert.equal(s.jobs[0].status, "failed");
    assert.match(s.jobs[0].error || "", /401/);
    assert.ok(!JSON.stringify(s).includes("private server detail"));
    assert.equal(s.ruleDraft, undefined);
    assert.ok(
      s.messages
        .flatMap((m) => m.agents || [])
        .every((r) => r.mode !== "simulation"),
    );
  } finally {
    globalThis.fetch = priorFetch;
    delete process.env.NOSANA_API_KEY;
    delete process.env.NOSANA_MODEL;
  }
});
