import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { z } from "zod";
import {
  actOnTask,
  addOrder,
  availableStock,
  candidateSchema,
  confirmOrder,
  initialState,
  monitor,
  plan,
} from "./domain";
import { reviewCandidates } from "./agents";
import { isPackedRuleRequest } from "./rules";
import type { AgentId, Candidate, FarmState, SimulationCheck } from "./types";

export const DEMO_FAQ = { boxKg: 5, boxPriceYen: 3500, deliveryYen: 800 };
export function sampleOrder(): Candidate {
  return {
    customer: "中村商店（サンプル）",
    kg: 10,
    address: "西予市 サンプル配送先 D",
    due: new Date(Date.now() + 24 * 3600000).toISOString(),
    note: "シミュレーション専用",
  };
}
export function createScenario() {
  const s = initialState();
  s.demo = true;
  s.stockKg = 80;
  s.forecastKg = 60;
  s.workers[0].name = "佐藤（収穫・配送）";
  s.workers[1].name = "山田（選別・梱包）";
  s.workers[2].name = "後藤（配送）";
  const customers = [
    "田中商店（サンプル）",
    "山本様（サンプル）",
    "海辺の宿（サンプル）",
  ];
  const orders = [40, 25, 30].map((kg, i) =>
    addOrder(
      s,
      {
        customer: customers[i],
        kg,
        due: new Date(Date.now() + (6 + i) * 3600000).toISOString(),
        address: `西予市 サンプル配送先 ${String.fromCharCode(65 + i)}`,
        note: "シミュレーション専用",
      },
      "模拟数据",
    ),
  );
  confirmOrder(s, orders[0].id);
  confirmOrder(s, orders[1].id);
  plan(s);
  s.tasks.find((t) => t.kind === "deliver")!.due = new Date(
    Date.now() - 300000,
  ).toISOString();
  return s;
}

// Deliberately fixed mapping: this is a mock CodeAF adapter, never an LLM claim.
export function parseSampleCsv(csv: string): Candidate[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" && !quoted) {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("模拟 CSV 格式不正确。");
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  if (rows.shift()?.join(",") !== "お名前,重量kg,お届け先,お届け日時")
    throw new Error("模拟模式仅支持提供的示例 CSV 列名。");
  return z
    .array(candidateSchema)
    .min(1)
    .max(100)
    .parse(
      rows
        .filter((r) => r.some(Boolean))
        .map((r) => {
          if (r.length !== 4) throw new Error("模拟 CSV 格式不正确。");
          return {
            customer: r[0],
            kg: Number(r[1]),
            address: r[2],
            due: r[3],
            note: "シミュレーション専用",
          };
        }),
    );
}
export function sampleCsv(orders: Candidate[]) {
  const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
  return (
    "お名前,重量kg,お届け先,お届け日時\n" +
    orders
      .map((o) =>
        [o.customer, String(o.kg), o.address, o.due].map(quote).join(","),
      )
      .join("\n")
  );
}

export function simulateSchedule(s: FarmState) {
  // Exercise the same Python scheduler used in Daytona, locally and without API calls.
  const result = spawnSync(
    "python3",
    [join(process.cwd(), "scripts/scheduler.py"), "-"],
    {
      input: JSON.stringify({
        tasks: s.tasks.filter((t) => t.status !== "done"),
        workers: s.workers,
        now: new Date().toISOString(),
      }),
      encoding: "utf8",
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.status !== 0)
    throw new Error("模拟排程未完成，请检查本机 Python 环境。");
  return z
    .array(
      z.object({
        id: z.string(),
        workerId: z.string(),
        feasible: z.boolean(),
        start: z.string().optional(),
        end: z.string().optional(),
      }),
    )
    .parse(JSON.parse(result.stdout));
}
export function simulateUnderstanding(
  text: string,
  locale: "ja" | "en",
  hasAttachment = false,
) {
  if (isPackedRuleRequest(text))
    return {
      reply:
        locale === "en"
          ? "Simulation: I mapped your request to a rule draft. Let us test the boundary cases before activating it."
          : "シミュレーション：発言をルール案に整理しました。有効にする前に、境界となる例を確認しましょう。",
      orders: [],
      ruleProposal: { kind: "packed_only_today" as const },
    };
  const order = hasAttachment || /注文|order|订单/i.test(text);
  const shipping = /送料|価格|shipping|price|价格|运费/i.test(text);
  return {
    reply: order
      ? locale === "en"
        ? "Simulation: I used the sample recognition result, not actual image or audio recognition. Please review this sample order for 10 kg."
        : "シミュレーション：実際の画像・音声認識は行わず、サンプルの認識結果を使用しました。10 kg のサンプル注文を確認してください。"
      : shipping
        ? locale === "en"
          ? "Sample price list: a 5 kg box is ¥3,500, with ¥800 shipping. These are fictional test prices."
          : "サンプル料金表では、5 kg 箱は3,500円、送料は800円です。いずれもテスト用の架空料金です。"
        : locale === "en"
          ? "Hello! This is a simulation using fixed sample responses. You can test orders, inventory, assignments and overdue deliveries without API calls."
          : "こんにちは！ここでは固定のサンプル応答を使い、API を呼ばずに注文・在庫・作業の割り当て・配送遅延をテストできます。",
    orders: order ? [sampleOrder()] : [],
  };
}

type Step = <T>(
  agent: AgentId,
  platforms: string[],
  summary: string,
  work: () => T | Promise<T>,
) => Promise<T>;
export async function runSimulation(
  step: Step = async (_agent, _platforms, _summary, work) => work(),
) {
  const s = createScenario();
  const checks: SimulationCheck[] = [];
  const check = (
    name: string,
    actual: string | number | boolean,
    expected: string | number | boolean,
  ) =>
    checks.push({
      name,
      actual: String(actual),
      expected: String(expected),
      passed: actual === expected,
    });
  await step(
    "reception",
    ["Nosana", "Tavily"],
    "按模拟价格表回答送料问题，识别应交给订单智能体的请求。",
    () => {
      check(
        "样例运费回答",
        simulateUnderstanding("送料はいくらですか", "ja").reply.includes(
          String(DEMO_FAQ.deliveryYen),
        ),
        true,
      );
      check(
        "普通问候不生成订单",
        simulateUnderstanding("こんにちは", "ja").orders.length,
        0,
      );
    },
  );
  const incoming = await step(
    "adapter",
    ["CodeAF", "Daytona"],
    "用固定样例适配器转换 CSV，并验证列名、数量和日期。",
    () => {
      const existing = s.orders.find((o) => o.kg === 40)!;
      const parsed = parseSampleCsv(sampleCsv([existing, sampleOrder()]));
      check("CSV 记录数量一致", parsed.length, 2);
      let rejected = false;
      try {
        parseSampleCsv(sampleCsv([{ ...sampleOrder(), kg: -1 }]));
      } catch {
        rejected = true;
      }
      check("拒绝负数订单", rejected, true);
      return parsed;
    },
  );
  await step(
    "orders",
    ["Nosana", "业务数据库"],
    "检查相同客户、数量、地址和交付时间，拦截重复订单。",
    () => {
      const result = reviewCandidates(s, incoming);
      check("拦截重复订单", result.duplicates.length, 1);
      check("保留新的有效订单", result.accepted.length, 1);
      for (const order of result.accepted) addOrder(s, order, "模拟 CSV");
    },
  );
  await step(
    "production",
    ["Daytona", "Tavily"],
    "检查库存缺口，登记模拟采收，并生成分选、打包和配送前置任务。",
    () => {
      const order = s.orders.find((o) => o.kg === 30)!;
      check("预计采收不计入可售库存", availableStock(s), 15);
      let rejected = false;
      try {
        confirmOrder(s, order.id);
      } catch {
        rejected = true;
      }
      check("库存不足时阻止承诺", rejected, true);
      s.stockKg += 20;
      confirmOrder(s, order.id);
      check("模拟采收后重新核算库存", availableStock(s), 5);
      plan(s);
      check("生成带前置关系的作业", s.tasks.length, 9);
    },
  );
  await step(
    "delivery",
    ["Daytona", "业务数据库"],
    "模拟司机拒单并重新分配，运行本地排程验证时间冲突和交接条件。",
    () => {
      const delivery = s.tasks.find((t) => t.kind === "deliver")!;
      const previous = delivery.workerId;
      actOnTask(s, delivery.id, "reject");
      plan(s);
      check("拒单后不分配给同一司机", delivery.workerId !== previous, true);
      const schedule = simulateSchedule(s);
      let overlaps = 0;
      for (const worker of s.workers) {
        const assignments = schedule
          .filter((r) => r.workerId === worker.id && r.start && r.end)
          .sort((a, b) => a.start!.localeCompare(b.start!));
        for (let i = 1; i < assignments.length; i++)
          if (
            Date.parse(assignments[i].start!) <
            Date.parse(assignments[i - 1].end!)
          )
            overlaps++;
      }
      check("人员排程时间冲突", overlaps, 0);
      check(
        "识别无法按期完成的配送",
        schedule.some((r) => !r.feasible),
        true,
      );
      const chain = s.tasks.filter((t) => t.orderId === delivery.orderId);
      for (const task of chain.filter((t) => t.kind !== "deliver")) {
        actOnTask(s, task.id, "accept");
        actOnTask(s, task.id, "complete", "サンプル作業の完了を確認");
      }
      actOnTask(s, delivery.id, "accept");
      let rejected = false;
      try {
        actOnTask(s, delivery.id, "complete", "サンプルの送り状のみ", false);
      } catch {
        rejected = true;
      }
      check("只有面单不能确认送达", rejected, true);
    },
  );
  await step(
    "supervision",
    ["后台定时任务"],
    "检测配送超时和交接未完成，并验证重复巡检不会重复报警。",
    () => {
      monitor(s);
      const count = s.messages.length;
      check(
        "超时作业被标记",
        s.tasks.some((t) => t.alerted),
        true,
      );
      monitor(s);
      check("重复巡检不重复报警", s.messages.length, count);
    },
  );
  return { state: s, checks };
}
