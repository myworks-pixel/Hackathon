import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FarmApp, type FarmView } from "../src/components/farm-app";
import { translate, localizeUI } from "../src/lib/i18n/core";
import { catalog } from "../src/lib/i18n/messages";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";
import { parseServerEnv } from "../src/lib/env/schema";
import {
  codeafEnvironment,
  NOSANA_DEFAULT_URL,
} from "../scripts/partner-config.mjs";
import { sandboxOptions } from "../scripts/partner-runtime.mjs";
import {
  runSimulation,
  parseSampleCsv,
  sampleCsv,
  sampleOrder,
} from "../src/lib/farm/simulation";
import {
  confirmShippingRule,
  dispatchBoxes,
  proposeShippingRule,
  seedRuleShipment,
} from "../src/lib/farm/rules";
import {
  evaluateShipment,
  japanDate,
  ruleExamples,
} from "../src/lib/farm/shipping-policy";
import { AgentActivity } from "../src/components/agent-activity";
import { recordAgent, traceMessage } from "../src/lib/farm/agents";
import type { Job } from "../src/lib/farm/types";
// Unit tests must never inherit real partner credentials or provision paid resources.
for (const name of Object.keys(process.env)) {
  if (/^(NOSANA_|CODEAF_|DAYTONA_|TAVILY_)/.test(name))
    delete process.env[name];
}
import {
  actOnTask,
  addOrder,
  availableStock,
  cancelOrder,
  confirmOrder,
  enqueue,
  initialState,
  monitor,
  plan,
  seedDemo,
} from "../src/lib/farm/domain";
import {
  providerStatus,
  understand,
  transcribe,
  research,
} from "../src/lib/farm/providers";
const candidate = {
  customer: "客户 A",
  kg: 10,
  due: new Date(Date.now() + 86400000).toISOString(),
  address: "西予市内 A",
};
test("Daytona keeps strict isolation by default and requires explicit platform policy", () => {
  const source = {
    DAYTONA_API_KEY: "test-only",
    DAYTONA_CODEAF_SNAPSHOT: "test-snapshot",
    NOSANA_API_KEY: "test-only",
    NOSANA_MODEL: "test-model",
  };
  assert.equal(sandboxOptions(false, source).networkBlockAll, true);
  assert.equal(
    sandboxOptions(true, source).domainAllowList,
    "inference.nosana.com",
  );
  const platform = { ...source, DAYTONA_NETWORK_POLICY: "platform" };
  assert.equal(sandboxOptions(false, platform).networkBlockAll, undefined);
  assert.equal(sandboxOptions(true, platform).domainAllowList, undefined);
  assert.equal(
    sandboxOptions(true, platform).envVars?.CODEAF_MODEL,
    "test-model",
  );
  assert.throws(() =>
    sandboxOptions(false, { ...source, DAYTONA_NETWORK_POLICY: "unknown" }),
  );
  assert.throws(() => parseServerEnv({ DAYTONA_NETWORK_POLICY: "unknown" }));
  assert.equal(parseServerEnv({}).DAYTONA_NETWORK_POLICY, "strict");
});
test("only partner credentials and official endpoints are accepted", () => {
  const env = parseServerEnv({
    OPENAI_API_KEY: "ignored",
    ANTHROPIC_API_KEY: "ignored",
    GOOGLE_GENERATIVE_AI_API_KEY: "ignored",
    OPENROUTER_API_KEY: "ignored",
    CODEAF_API_KEY: "ignored",
    AI_MODEL: "ignored",
    AI_BASE_URL: "https://api.openai.com/v1",
  });
  assert.equal(env.NOSANA_BASE_URL, NOSANA_DEFAULT_URL);
  assert.equal(env.NOSANA_API_KEY, undefined);
  assert.ok(
    !Object.keys(env).some((key) =>
      /^(OPENAI|ANTHROPIC|GOOGLE|OPENROUTER|AI_)/.test(key),
    ),
  );
  for (const key of [
    "NOSANA_BASE_URL",
    "NOSANA_VISION_BASE_URL",
    "NOSANA_ASR_BASE_URL",
    "DAYTONA_API_URL",
  ]) {
    for (const url of [
      "https://api.openai.com/v1",
      "https://inference.nosana.com.attacker.example/v1",
      "http://inference.nosana.com/v1",
      "https://secret@inference.nosana.com/v1",
      "https://inference.nosana.com/v1?key=secret",
    ]) {
      assert.throws(
        () => parseServerEnv({ [key]: url }),
        (error) =>
          error instanceof Error &&
          error.message.includes(key) &&
          !error.message.includes("secret"),
      );
    }
  }
  assert.equal(
    parseServerEnv({
      NOSANA_VISION_BASE_URL: "https://job.node.k8s.prd.nos.ci/v1/",
    }).NOSANA_VISION_BASE_URL,
    "https://job.node.k8s.prd.nos.ci/v1",
  );
  assert.equal(
    parseServerEnv({ DAYTONA_API_URL: "https://app.daytona.io/api" })
      .DAYTONA_API_URL,
    "https://app.daytona.io/api",
  );
});

test("CodeAF pins every model role to Nosana without inherited providers", () => {
  const source = {
    DAYTONA_API_KEY: "daytona-test",
    DAYTONA_CODEAF_SNAPSHOT: "codeaf-preinstalled",
    NOSANA_API_KEY: "nosana-test",
    NOSANA_MODEL: "nosana-model",
    OPENAI_API_KEY: "must-not-copy",
    OPENROUTER_API_KEY: "must-not-copy",
    CODEAF_BASE_URL: "https://openrouter.ai/api/v1",
    CODEAF_PLAN_MODEL: "must-not-copy",
    CODEAF_MODELS: "must-not-copy",
  };
  const env = codeafEnvironment(source);
  assert.equal(env.OPENAI_API_KEY, "nosana-test");
  assert.equal(env.CODEAF_BASE_URL, NOSANA_DEFAULT_URL);
  for (const key of ["CODEAF_MODEL", "CODEAF_PLAN_MODEL", "CODEAF_CHECK_MODEL"])
    assert.equal(env[key], "nosana-model");
  assert.ok(!JSON.stringify(env).includes("must-not-copy"));
  assert.equal(
    codeafEnvironment({ ...source, CODEAF_MODEL: "nosana-coder" })
      .CODEAF_PLAN_MODEL,
    "nosana-coder",
  );
  assert.throws(
    () =>
      codeafEnvironment({
        OPENROUTER_API_KEY: "not-allowed",
        CODEAF_API_KEY: "not-allowed",
      }),
    /NOSANA_API_KEY/,
  );
  const options = sandboxOptions(true, source);
  assert.equal(options.domainAllowList, "inference.nosana.com");
  assert.equal(options.snapshot, "codeaf-preinstalled");
  assert.equal(sandboxOptions(false, source).networkBlockAll, true);
  assert.throws(
    () => sandboxOptions(true, { ...source, DAYTONA_CODEAF_SNAPSHOT: "" }),
    /DAYTONA_CODEAF_SNAPSHOT/,
  );
});

test("CodeAF launcher discards saved profiles and extra provider environment", () => {
  const result = spawnSync(
    "python3",
    [
      "-c",
      `
import json, os, runpy, types
from unittest.mock import patch
runner = runpy.run_path("scripts/run-codeaf.py")
source = {
    "PATH": os.environ.get("PATH", ""),
    "OPENAI_API_KEY": "nosana-test", "CODEAF_BASE_URL": "https://inference.nosana.com/v1",
    "CODEAF_MODEL": "nosana-coder", "CODEAF_PLAN_MODEL": "do-not-copy",
    "OPENROUTER_API_KEY": "do-not-copy", "ANTHROPIC_API_KEY": "do-not-copy",
    "CODEAF_MODELS": "do-not-copy", "AFORGE_MODELS": "do-not-copy",
    "CODEAF_PROFILE_DIR": "/do-not-copy", "HTTP_PROXY": "do-not-copy",
    "SSL_CERT_FILE": "/etc/daytona/netleash/ca.crt"
}
captured = {}
def fake_run(args, **kwargs):
    captured.update(args=args, env=kwargs["env"], timeout=kwargs["timeout"])
    assert os.path.isdir(kwargs["env"]["CODEAF_PROFILE_DIR"])
    assert os.listdir(kwargs["env"]["CODEAF_PROFILE_DIR"]) == []
    return types.SimpleNamespace(returncode=0)
with patch.dict(os.environ, source, clear=True), patch("shutil.which", return_value="/usr/local/bin/codeaf"), patch("subprocess.run", side_effect=fake_run):
    assert runner["run"]() == 0
assert not os.path.exists(captured["env"]["CODEAF_PROFILE_DIR"])
print(json.dumps(captured))
`,
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const captured = JSON.parse(result.stdout);
  assert.ok(!result.stdout.includes("do-not-copy"));
  assert.equal(captured.env.OPENAI_API_KEY, "nosana-test");
  assert.equal(captured.env.SSL_CERT_FILE, "/etc/daytona/netleash/ca.crt");
  assert.equal(captured.env.CODEAF_TELEMETRY, "off");
  for (const flag of ["--model", "--plan-model", "--check-model"])
    assert.equal(
      captured.args[captured.args.indexOf(flag) + 1],
      "nosana-coder",
    );
});

test("LangChain sends the Nosana key to Nosana only and disables external tracing", async () => {
  const priorEnv = { ...process.env };
  const priorFetch = globalThis.fetch;
  const calls: string[] = [];
  try {
    process.env.NOSANA_API_KEY = "nosana-test";
    process.env.NOSANA_MODEL = "nosana-model";
    process.env.OPENAI_API_KEY = "must-not-use";
    process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
    process.env.LANGSMITH_TRACING = "true";
    process.env.LANGCHAIN_TRACING_V2 = "true";
    globalThis.fetch = async (url, init) => {
      calls.push(String(url));
      assert.equal(
        String(url),
        "https://inference.nosana.com/v1/chat/completions",
      );
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer nosana-test",
      );
      assert.equal(init?.redirect, "error");
      assert.equal(JSON.parse(String(init?.body)).model, "nosana-model");
      return Response.json({
        id: "test-completion",
        object: "chat.completion",
        created: 0,
        model: "nosana-model",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "確認しました" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    };
    const jiti = createJiti(import.meta.url, {
      alias: {
        // Use the package's server-condition entry for this server-only unit test.
        "server-only": new URL(
          "../node_modules/server-only/empty.js",
          import.meta.url,
        ).pathname,
        "@": new URL("../src", import.meta.url).pathname,
      },
    });
    const { createChatModel } = await jiti.import<
      typeof import("../src/lib/ai/model")
    >("../src/lib/ai/model.ts");
    const model = createChatModel();
    assert.equal(process.env.LANGSMITH_TRACING, "false");
    assert.equal(process.env.LANGCHAIN_TRACING_V2, "false");
    assert.equal(
      (await model.invoke("確認してください")).content,
      "確認しました",
    );
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = priorFetch;
    for (const key of Object.keys(process.env))
      if (!(key in priorEnv)) delete process.env[key];
    Object.assign(process.env, priorEnv);
  }
});
test("forecast stock never backs a promise", () => {
  const s = initialState();
  s.forecastKg = 100;
  const o = addOrder(s, candidate);
  assert.throws(() => confirmOrder(s, o.id), /可用库存/);
  assert.equal(availableStock(s), 0);
});
test("confirmed reservations cannot oversell and release only once", () => {
  const s = initialState();
  s.stockKg = 15;
  const a = addOrder(s, candidate),
    b = addOrder(s, candidate);
  confirmOrder(s, a.id);
  assert.equal(availableStock(s), 5);
  assert.throws(() => confirmOrder(s, b.id));
  cancelOrder(s, a.id);
  assert.equal(availableStock(s), 15);
  assert.throws(() => cancelOrder(s, a.id));
  assert.equal(availableStock(s), 15);
});
test("negative and incomplete orders rejected", () => {
  assert.throws(() => addOrder(initialState(), { ...candidate, kg: -5 }));
  assert.throws(() => addOrder(initialState(), { ...candidate, address: "" }));
});
test("planning is idempotent and offers are not acceptance", () => {
  const s = initialState();
  s.stockKg = 20;
  const o = addOrder(s, candidate);
  confirmOrder(s, o.id);
  plan(s);
  plan(s);
  assert.equal(s.tasks.length, 3);
  assert.ok(s.tasks.every((t) => t.status === "offered"));
});
test("cannot skip task dependencies or equate a label with delivery", () => {
  const s = initialState();
  s.stockKg = 20;
  const o = addOrder(s, candidate);
  confirmOrder(s, o.id);
  plan(s);
  const [sort, pack, delivery] = s.tasks;
  actOnTask(s, delivery.id, "accept");
  assert.throws(
    () => actOnTask(s, delivery.id, "complete", "面单已打印", true),
    /前置/,
  );
  for (const t of [sort, pack]) {
    actOnTask(s, t.id, "accept");
    actOnTask(s, t.id, "complete", "已完成称重核对");
  }
  assert.equal(o.status, "packed");
  assert.throws(
    () => actOnTask(s, delivery.id, "complete", "面单已打印"),
    /交接/,
  );
  actOnTask(s, delivery.id, "complete", "客户已实际收到并签收", true);
  assert.equal(o.status, "delivered");
  assert.equal(s.stockKg, 10);
  assert.equal(availableStock(s), 10);
  assert.throws(() => actOnTask(s, delivery.id, "complete", "重复提交", true));
});
test("replanning does not return a rejected task to the same person", () => {
  const s = initialState();
  s.stockKg = 20;
  confirmOrder(s, addOrder(s, candidate).id);
  plan(s);
  const t = s.tasks.find((t) => t.kind === "deliver")!;
  const previous = t.workerId;
  actOnTask(s, t.id, "reject");
  plan(s);
  assert.notEqual(t.workerId, previous);
});
test("unavailable staff produce blocked tasks", () => {
  const s = initialState();
  s.stockKg = 20;
  s.workers.forEach((w) => (w.available = false));
  confirmOrder(s, addOrder(s, candidate).id);
  plan(s);
  assert.ok(s.tasks.every((t) => t.status === "blocked"));
});
test("overdue task warns once, survives repeated monitor ticks", () => {
  const s = initialState();
  seedDemo(s);
  const count = s.messages.length;
  monitor(s);
  monitor(s);
  assert.equal(s.messages.length, count);
  assert.ok(s.tasks.some((t) => t.alerted));
});
test("demo never overwrites existing operations", () => {
  const s = initialState();
  addOrder(s, candidate);
  assert.throws(() => seedDemo(s));
  assert.equal(s.orders.length, 1);
});
test("missing providers fail before any network call", async () => {
  for (const name of [
    "TAVILY_API_KEY",
    "NOSANA_API_KEY",
    "NOSANA_VISION_API_KEY",
    "NOSANA_ASR_API_KEY",
  ])
    delete process.env[name];
  assert.ok(providerStatus().every((p) => !p.configured));
  await assert.rejects(() => understand("订单"), /请先/);
  await assert.rejects(() => research(), /请先/);
  await assert.rejects(
    () =>
      transcribe({
        id: "x",
        name: "a.wav",
        path: "/does-not-exist",
        size: 1,
        mime: "audio/wav",
      }),
    /请先/,
  );
});
test("real provider HTTP contracts and structured validation", async () => {
  const original = globalThis.fetch;
  process.env.NOSANA_API_KEY = "test-only";
  process.env.NOSANA_MODEL = "test-model";
  process.env.TAVILY_API_KEY = "test-only";
  try {
    globalThis.fetch = async (url, init) => {
      const request = JSON.parse(String(init?.body));
      if (String(url).includes("tavily")) {
        assert.ok(request.include_domains.includes("jma.go.jp"));
        assert.ok(!JSON.stringify(request).includes(candidate.customer));
        return Response.json({
          results: [
            {
              title: "公告",
              url: "https://www.jma.go.jp/",
              content: "公开信息",
            },
          ],
        });
      }
      assert.equal(request.model, "test-model");
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: "请核对订单",
                orders: [candidate],
              }),
            },
          },
        ],
      });
    };
    assert.equal((await understand("订单说明")).orders.length, 1);
    assert.equal((await research()).length, 1);
    globalThis.fetch = async () =>
      Response.json({
        choices: [
          { message: { content: '{"reply":"wrong", "orders":[{"kg":-1}]}' } },
        ],
      });
    await assert.rejects(() => understand("订单"), /可靠/);
    globalThis.fetch = async () =>
      new Response("secret service error", { status: 401 });
    await assert.rejects(
      () => understand("订单"),
      (e) =>
        e instanceof Error &&
        e.message.includes("401") &&
        !e.message.includes("secret"),
    );
  } finally {
    globalThis.fetch = original;
    delete process.env.NOSANA_API_KEY;
    delete process.env.NOSANA_MODEL;
    delete process.env.TAVILY_API_KEY;
  }
});
test("durable store: duplicate request, rollback, background work and restart-read", async () => {
  process.env.FARM_DATA_DIR = mkdtempSync(join(tmpdir(), "mikan-test-"));
  const { readState, updateState } = await import("../src/lib/farm/store");
  const { dispatch } = await import("../src/lib/farm/actions");
  const { tick } = await import("../src/lib/farm/worker");
  dispatch({ type: "stock", kg: 20 }, "same-request");
  dispatch({ type: "stock", kg: 20 }, "same-request");
  assert.equal(readState().stockKg, 20);
  assert.throws(() =>
    updateState((s) => {
      s.stockKg = 999;
      throw new Error("rollback");
    }),
  );
  assert.equal(readState().stockKg, 20);
  const orderId = updateState((s) => {
    const o = addOrder(s, candidate);
    confirmOrder(s, o.id);
    enqueue(s, "plan");
    return o.id;
  });
  await tick();
  assert.equal(readState().jobs[0].status, "failed");
  assert.match(readState().jobs[0].error || "", /NOSANA/);
  assert.equal(readState().tasks.length, 0);
  updateState((state) => plan(state));
  assert.equal(
    readState().tasks.filter((t) => t.orderId === orderId).length,
    3,
  );
  assert.ok(readState().workerHeartbeat);
  updateState((s) => enqueue(s, "intake", { text: "please process" }));
  await tick();
  assert.equal(readState().jobs.at(-1)?.status, "failed");
  assert.match(readState().jobs.at(-1)?.error || "", /NOSANA/);
});

test("Python scheduler avoids overlapping work and propagates blocked predecessors", () => {
  const s = initialState();
  s.stockKg = 30;
  confirmOrder(s, addOrder(s, candidate).id);
  confirmOrder(s, addOrder(s, candidate).id);
  plan(s);
  const folder = mkdtempSync(join(tmpdir(), "mikan-scheduler-"));
  const path = join(folder, "input.json");
  const run = () => {
    writeFileSync(
      path,
      JSON.stringify({
        tasks: s.tasks,
        workers: s.workers,
        now: new Date().toISOString(),
      }),
    );
    const r = spawnSync("python3", ["scripts/scheduler.py", path], {
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout) as {
      id: string;
      workerId: string;
      start?: string;
      end?: string;
      feasible: boolean;
    }[];
  };
  const rows = run();
  assert.equal(rows.length, 6);
  for (const w of s.workers) {
    const jobs = rows
      .filter((r) => r.workerId === w.id)
      .sort((a, b) => a.start!.localeCompare(b.start!));
    for (let i = 1; i < jobs.length; i++)
      assert.ok(Date.parse(jobs[i].start!) >= Date.parse(jobs[i - 1].end!));
  }
  s.workers.forEach((w) => (w.skills = ["deliver"]));
  assert.ok(run().every((r) => !r.feasible));
});

test("route validates same-origin and idempotency, and does not return private paths or keys", async () => {
  const { GET, POST } = await import("../src/app/api/farm/route");
  const cross = await POST(
    new Request("http://localhost:3000/api/farm", {
      method: "POST",
      headers: {
        origin: "https://untrusted.example",
        "idempotency-key": "cross",
      },
      body: JSON.stringify({ type: "stock", kg: 10 }),
    }),
  );
  assert.equal(cross.status, 400);
  const noKey = await POST(
    new Request("http://localhost:3000/api/farm", {
      method: "POST",
      body: "{}",
    }),
  );
  assert.equal(noKey.status, 400);
  const { updateState } = await import("../src/lib/farm/store");
  updateState((s) =>
    s.attachments.push({
      id: "test",
      name: "a.png",
      mime: "image/png",
      size: 1,
      path: "/private/test-path",
    }),
  );
  const response = await GET(new Request("http://localhost:3000/api/farm"));
  const text = await response.text();
  assert.ok(!text.includes("/private/test-path"));
  assert.ok(!text.includes('"requests"'));
});

test("Japanese and English render every page with registered UI copy translated", () => {
  const s = initialState();
  seedDemo(s);
  for (const locale of ["ja", "en"] as const)
    for (const tab of [
      "home",
      "assistant",
      "agents",
      "orders",
      "tasks",
      "connections",
    ] as FarmView[]) {
      const html = renderToStaticMarkup(
        React.createElement(FarmApp, {
          initialData: {
            state: s,
            availableKg: availableStock(s),
            providers: providerStatus(),
          },
          initialTab: tab,
          initialLocale: locale,
        }),
      );
      assert.ok(html.includes('href="/assistant"'));
      assert.ok(
        html.includes(locale === "ja" ? "AI アシスタント" : "AI Assistant"),
      );
      const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
      for (const [source, ja, en] of catalog) {
        if (
          source.length < 8 ||
          source.includes("{{") ||
          source === (locale === "ja" ? ja : en) ||
          !/[\u3400-\u9fff]/.test(source)
        )
          continue;
        assert.ok(
          !text.includes(source),
          `${locale}/${tab} contains untranslated copy: ${source}`,
        );
      }
      if (tab === "home") assert.ok(!html.includes('class="panel chat-panel'));
      if (tab === "assistant") {
        assert.ok(html.includes("chat-panel"));
        assert.ok(!html.includes('class="stats"'));
      }
      if (tab === "agents") {
        assert.ok(html.includes("agent-catalog-grid"));
        assert.ok(!html.includes('class="stats"'));
      }
    }
});

test("localization handles dynamic system messages and preserves original business text", () => {
  assert.equal(
    translate("田中商店（示例） 的订单已确认，预留 10 kg。", "en"),
    "Confirmed Tanaka Store (demo)'s order and reserved 10 kg.",
  );
  assert.equal(translate("王小明 · 南町 1-2-3", "ja"), "王小明 · 南町 1-2-3");
  const original = React.createElement(
    "p",
    { "data-original": true },
    "今日待办",
  );
  assert.ok(
    renderToStaticMarkup(localizeUI(original, "en")).includes("今日待办"),
  );
});

test("Japanese and English quick queries work without a model and jobs retain selected language", async () => {
  const { dispatch } = await import("../src/lib/farm/actions");
  const { readState } = await import("../src/lib/farm/store");
  const count = readState().jobs.length;
  dispatch({ type: "chat", text: "今日の作業" }, "locale-ja", "ja");
  dispatch({ type: "chat", text: "Today's tasks" }, "locale-en", "en");
  assert.equal(readState().jobs.length, count);
  process.env.NOSANA_API_KEY = "test-only";
  process.env.NOSANA_MODEL = "test-model";
  try {
    dispatch(
      { type: "chat", text: "Please parse this incomplete order" },
      "locale-job",
      "en",
    );
    assert.equal(readState().jobs.at(-1)?.input.locale, "en");
  } finally {
    delete process.env.NOSANA_API_KEY;
    delete process.env.NOSANA_MODEL;
  }
});

test("chat gives immediate localized feedback without queueing when a model or worker is missing", async () => {
  const { dispatch } = await import("../src/lib/farm/actions");
  const { readState, updateState } = await import("../src/lib/farm/store");
  const count = readState().jobs.length;
  dispatch({ type: "chat", text: "こんにちは" }, "missing-model");
  assert.equal(readState().jobs.length, count);
  assert.match(readState().messages.at(-1)!.text, /文字模型/);
  assert.match(
    translate(readState().messages.at(-1)!.text, "ja"),
    /テキストモデル/,
  );
  assert.match(
    translate(readState().messages.at(-1)!.text, "en"),
    /text model/,
  );
  const messages = readState().messages.length;
  dispatch({ type: "chat", text: "こんにちは" }, "missing-model");
  assert.equal(readState().messages.length, messages);

  process.env.NOSANA_API_KEY = "test-only";
  process.env.NOSANA_MODEL = "test-model";
  try {
    updateState((s) => {
      delete s.workerHeartbeat;
    });
    dispatch({ type: "chat", text: "Hello" }, "missing-worker", "en");
    assert.equal(readState().jobs.length, count);
    assert.match(readState().messages.at(-1)!.text, /消息处理服务尚未启动/);
    const state = readState();
    const html = renderToStaticMarkup(
      React.createElement(FarmApp, {
        initialData: {
          state,
          availableKg: availableStock(state),
          providers: providerStatus(),
        },
        initialTab: "assistant",
        initialLocale: "en",
      }),
    );
    assert.match(html, /processing service is offline/);
    assert.ok(!html.includes('class="spin"'));
  } finally {
    delete process.env.NOSANA_API_KEY;
    delete process.env.NOSANA_MODEL;
  }
});

test("ordinary chat and follow-ups use Nosana, retain prior turns and do not change farm records", async () => {
  const { dispatch } = await import("../src/lib/farm/actions");
  const { readState, updateState } = await import("../src/lib/farm/store");
  const { tick } = await import("../src/lib/farm/worker");
  const originalFetch = globalThis.fetch;
  process.env.NOSANA_API_KEY = "test-only";
  process.env.NOSANA_MODEL = "test-model";
  const calls: { messages: { role: string; content: string }[] }[] = [];
  try {
    updateState((s) => {
      s.jobs = [];
      s.messages = [];
      s.workerHeartbeat = new Date().toISOString();
    });
    const before = readState();
    globalThis.fetch = async (url, init) => {
      assert.equal(
        String(url),
        "https://inference.nosana.com/v1/chat/completions",
      );
      calls.push(JSON.parse(String(init?.body)));
      const request = JSON.parse(String(init?.body));
      const first = request.tool_choice?.function?.name === "agent_plan";
      return Response.json({
        choices: [
          {
            message: first
              ? {
                  content: null,
                  tool_calls: [
                    {
                      id: `plan-${calls.length}`,
                      type: "function",
                      function: {
                        name: "agent_plan",
                        arguments: JSON.stringify({
                          reason: "Ordinary conversation",
                          assignments: [],
                        }),
                      },
                    },
                  ],
                }
              : {
                  content:
                    calls.length === 2
                      ? "こんにちは。どんなことをお手伝いしましょうか？"
                      : "Yes, we can continue in English.",
                },
          },
        ],
      });
    };
    dispatch({ type: "chat", text: "こんにちは" }, "conversation-first");
    await tick();
    assert.equal(readState().jobs.at(-1)?.status, "done");
    assert.match(readState().messages.at(-1)!.text, /こんにちは/);
    dispatch(
      { type: "chat", text: "Can we continue in English?" },
      "conversation-second",
      "en",
    );
    dispatch(
      { type: "chat", text: "FUTURE_MESSAGE_MUST_NOT_LEAK" },
      "conversation-future",
    );
    await tick();
    assert.match(
      calls[0].messages[0].content,
      /Greetings and ordinary conversation/,
    );
    const history = calls[2].messages;
    assert.match(history[0].content, /entirely in English/);
    assert.ok(
      history.some(
        (m) => m.role === "assistant" && m.content.startsWith("こんにちは"),
      ),
    );
    assert.equal(history.at(-1)?.content, "Can we continue in English?");
    assert.ok(
      !JSON.stringify(history).includes("FUTURE_MESSAGE_MUST_NOT_LEAK"),
    );
    const after = readState();
    assert.deepEqual(after.orders, before.orders);
    assert.deepEqual(after.drafts, before.drafts);
    assert.equal(after.stockKg, before.stockKg);
    assert.equal(calls.length, 4);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.NOSANA_API_KEY;
    delete process.env.NOSANA_MODEL;
    updateState((s) => {
      s.jobs = [];
    });
  }
});

test("six-agent sample scenario runs real business checks and local scheduling", async () => {
  const visited: string[] = [];
  const result = await runSimulation(
    async (agent, _platforms, _summary, work) => {
      visited.push(agent);
      return work();
    },
  );
  assert.deepEqual(visited, [
    "reception",
    "adapter",
    "orders",
    "production",
    "delivery",
    "supervision",
  ]);
  assert.equal(result.checks.length, 16);
  assert.ok(
    result.checks.every((check) => check.passed),
    JSON.stringify(result.checks),
  );
  assert.equal(result.state.orders.length, 4);
  assert.equal(result.state.tasks.length, 9);
  assert.equal(availableStock(result.state), 5);
  assert.equal(result.state.tasks.filter((t) => t.status === "done").length, 2);
  const quoted = { ...sampleOrder(), customer: 'みかん, "農園"' };
  assert.deepEqual(
    parseSampleCsv(sampleCsv([quoted]))[0].customer,
    quoted.customer,
  );
  assert.throws(() =>
    parseSampleCsv('お名前,重量kg,お届け先,お届け日時\n"unclosed'),
  );
});

test("a farmer's sentence stays a draft until explicit confirmation, with stale drafts rejected", () => {
  const s = initialState();
  seedRuleShipment(s);
  proposeShippingRule(s, "今日は梱包済みの箱だけ発送してください。");
  assert.equal(s.activeRule, undefined);
  assert.deepEqual(evaluateShipment(s.ruleDraft, s.ruleShipment!).allowed, []);
  assert.deepEqual(
    ruleExamples(s.ruleDraft!).map((example) => example.allowed.length),
    [1, 0, 0, 2],
  );
  assert.deepEqual(
    ruleExamples({ ...s.ruleDraft!, partial: "together" }).map(
      (example) => example.allowed.length,
    ),
    [0, 0, 0, 2],
  );
  const previous = s.ruleDraft!.id;
  proposeShippingRule(s, "Today, ship only packed boxes.");
  assert.throws(
    () => confirmShippingRule(s, previous, "customer_consent"),
    /最新/,
  );
  confirmShippingRule(s, s.ruleDraft!.id, "customer_consent");
  assert.equal(s.activeRule!.status, "active");
  assert.ok(s.activeRule!.confirmedAt);
  assert.equal(s.ruleDraft, undefined);
  const active = s.activeRule;
  proposeShippingRule(s, "今日は梱包済みの箱だけ発送");
  assert.deepEqual(
    s.activeRule,
    active,
    "new drafts do not silently replace confirmed rules",
  );
});

test("same-day arrival overrides split consent and packing does not promise arrival", () => {
  const s = initialState();
  seedRuleShipment(s);
  proposeShippingRule(s, "Today, ship only packed boxes.");
  confirmShippingRule(s, s.ruleDraft!.id, "customer_consent");
  const shipment = s.ruleShipment!;
  assert.deepEqual(evaluateShipment(s.activeRule, shipment).allowed, []);
  shipment.splitConsent = true;
  assert.deepEqual(evaluateShipment(s.activeRule, shipment).allowed, [
    "MIKAN-A",
  ]);
  shipment.sameArrival = true;
  assert.deepEqual(evaluateShipment(s.activeRule, shipment).allowed, []);
  shipment.boxes[1].packed = true;
  const together = evaluateShipment(s.activeRule, shipment);
  assert.deepEqual(together.allowed, ["MIKAN-A", "MIKAN-B"]);
  assert.equal(together.arrivalGuaranteed, false);
  shipment.boxes.forEach((box) => (box.packed = false));
  assert.deepEqual(evaluateShipment(s.activeRule, shipment).allowed, []);
});

test("today-only shipping expires at Japan midnight and sent boxes cannot ship twice", () => {
  const s = initialState();
  s.demo = true;
  seedRuleShipment(s);
  proposeShippingRule(s, "Today, ship only packed boxes.");
  confirmShippingRule(s, s.ruleDraft!.id, "customer_consent");
  const shipment = s.ruleShipment!;
  shipment.splitConsent = true;
  const rule = { ...s.activeRule!, date: "2026-11-14" };
  assert.equal(japanDate(Date.parse("2026-11-14T15:00:00Z")), "2026-11-15");
  assert.equal(
    evaluateShipment(rule, shipment, Date.parse("2026-11-14T14:59:59Z")).allowed
      .length,
    1,
  );
  assert.equal(
    evaluateShipment(rule, shipment, Date.parse("2026-11-14T15:00:00Z")).allowed
      .length,
    0,
  );
  assert.deepEqual(dispatchBoxes(s, s.activeRule!.id, shipment.id).allowed, [
    "MIKAN-A",
  ]);
  const first = shipment.boxes[0].shippedAt;
  assert.deepEqual(dispatchBoxes(s, s.activeRule!.id, shipment.id).allowed, []);
  assert.equal(shipment.boxes[0].shippedAt, first);
  shipment.sameArrival = true;
  shipment.boxes[1].packed = true;
  assert.deepEqual(dispatchBoxes(s, s.activeRule!.id, shipment.id).allowed, []);
  assert.equal(shipment.boxes[1].shippedAt, undefined);
  assert.throws(() => dispatchBoxes(s, "stale-rule", shipment.id), /重新检查/);
});

test("simulated chat exercises all agents and the two-box rule without calling configured APIs or changing actual data", async () => {
  const { withWorkspace, readState, updateState } =
    await import("../src/lib/farm/store");
  const { dispatch } = await import("../src/lib/farm/actions");
  const { tick } = await import("../src/lib/farm/worker");
  const liveBefore = readState();
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw new Error("Simulation must never call external APIs");
  };
  const credentialKeys = [
    "NOSANA_API_KEY",
    "NOSANA_MODEL",
    "DAYTONA_API_KEY",
    "TAVILY_API_KEY",
  ];
  credentialKeys.forEach((key) => (process.env[key] = "test-only"));
  try {
    await withWorkspace("simulation", async () => {
      dispatch({ type: "simulation" }, "six-agent-test");
      await tick();
      const s = readState();
      assert.equal(s.jobs.at(-1)?.status, "done");
      const trace = s.messages.find((m) => m.checks);
      assert.equal(trace?.agents?.length, 6);
      assert.ok(
        trace?.agents?.every(
          (run) => run.mode === "simulation" && run.status === "done",
        ),
      );
      assert.ok(trace?.checks?.every((check) => check.passed));
      dispatch({ type: "simulation" }, "six-agent-test");
      assert.equal(readState().jobs.length, s.jobs.length);
      dispatch({ type: "rule_demo" }, "rule-intake", "ja", "offline");
      await tick();
      const draft = readState().ruleDraft!;
      assert.equal(draft.status, "draft");
      assert.equal(readState().activeRule, undefined);
      dispatch(
        { type: "confirm_rule", id: draft.id, partial: "customer_consent" },
        "rule-confirm",
      );
      const shipmentId = readState().ruleShipment!.id;
      const ship = { type: "ship_boxes", ruleId: draft.id, shipmentId };
      const condition = {
        type: "shipment_conditions",
        id: shipmentId,
        sameArrival: true,
        splitConsent: true,
        packedSecond: false,
      };
      dispatch(condition, "same-arrival");
      dispatch(ship, "blocked-shipping");
      assert.ok(readState().ruleShipment!.boxes.every((b) => !b.shippedAt));
      dispatch({ ...condition, sameArrival: false }, "split-allowed");
      dispatch(ship, "ship-once");
      dispatch(ship, "ship-again");
      assert.equal(
        readState().ruleShipment!.boxes.filter((b) => b.shippedAt).length,
        1,
      );
      assert.equal(readState().ruleShipment!.boxes[1].shippedAt, undefined);
      // An interrupted job must not leave a forever-running agent avatar.
      updateState((state) => {
        const job: Job = enqueue(state, "intake", { text: "hello" });
        job.status = "running";
        job.leaseUntil = 0;
        const msg = state.messages.find((m) => m.id === job.traceMessageId)!;
        msg.agents = [
          {
            id: "interrupted",
            agent: "reception",
            platforms: [],
            mode: "simulation",
            status: "running",
            summary: "",
            startedAt: new Date().toISOString(),
          },
        ];
      });
      await tick();
      assert.equal(
        readState()
          .messages.flatMap((m) => m.agents || [])
          .find((r) => r.id === "interrupted")?.status,
        "failed",
      );
    });
    assert.deepEqual(readState(), liveBefore);
    assert.equal(requests, 0);
    assert.throws(
      () => dispatch({ type: "rule_demo" }, "live-rule-demo"),
      /模拟/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    credentialKeys.forEach((key) => delete process.env[key]);
  }
});

test("sample and actual data use the same assistant UI, with six colored React Icon avatars and bilingual rule copy", async () => {
  const { withWorkspace, readState } = await import("../src/lib/farm/store");
  const s = withWorkspace("simulation", readState);
  const trace = traceMessage(s);
  for (const agent of [
    "reception",
    "orders",
    "production",
    "delivery",
    "supervision",
    "adapter",
  ] as const)
    recordAgent(s, trace.id, agent, [], "simulation", "智能体处理完成。");
  proposeShippingRule(s, "今日は梱包済みの箱だけ発送してください。");
  for (const locale of ["ja", "en"] as const) {
    const avatars = renderToStaticMarkup(
      React.createElement(AgentActivity, {
        runs: trace.agents,
        checks: [{ name: "test", expected: "1", actual: "1", passed: true }],
        locale,
      }),
    );
    assert.ok(avatars.includes("+3"));
    for (const color of [
      "#dbeafe",
      "#ffedd5",
      "#dcfce7",
      "#ede9fe",
      "#ffe4e6",
      "#cffafe",
    ])
      assert.ok(avatars.includes(color));
    assert.ok(avatars.includes("<svg"));
    const html = renderToStaticMarkup(
      React.createElement(FarmApp, {
        initialData: {
          state: s,
          availableKg: availableStock(s),
          providers: providerStatus(),
        },
        initialTab: "assistant",
        initialLocale: locale,
        workspace: "simulation",
      }),
    );
    assert.ok(!html.includes('href="/simulation"'));
    assert.ok(html.includes('href="/assistant?workspace=simulation"'));
    assert.ok(
      html.includes(
        locale === "ja"
          ? "このルールを確認して有効にする"
          : "Confirm and activate this rule",
      ),
    );
    assert.ok(
      html.includes(
        locale === "ja"
          ? "お客様は全箱の同日到着を希望"
          : "Customer requires same-day arrival",
      ) ||
        html.includes(
          locale === "ja" ? "同じ日に到着" : "arriving on the same day",
        ),
    );
    const text = html.replace(/<[^>]*>/g, " ");
    for (const [source, ja, en] of catalog) {
      if (
        source.length < 8 ||
        source.includes("{{") ||
        source === (locale === "ja" ? ja : en) ||
        !/[\u3400-\u9fff]/.test(source)
      )
        continue;
      assert.ok(
        !text.includes(source),
        `${locale} has untranslated copy: ${source}`,
      );
    }
  }
});

test("invalid workspace requests fail instead of mutating actual farm data", async () => {
  const { GET, POST } = await import("../src/app/api/farm/route");
  const badGet = await GET(
    new Request("http://localhost:3000/api/farm?workspace=invalid"),
  );
  assert.equal(badGet.status, 400);
  const badPost = await POST(
    new Request("http://localhost:3000/api/farm", {
      method: "POST",
      headers: {
        "x-farm-workspace": "invalid",
        "idempotency-key": "invalid-workspace",
      },
      body: JSON.stringify({ type: "stock", kg: 100 }),
    }),
  );
  assert.equal(badPost.status, 400);
});
