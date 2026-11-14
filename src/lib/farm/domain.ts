import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Candidate, FarmState, JobKind, TaskKind } from "./types";
import { TASK_NAMES } from "./types";
import { recordAgent, traceMessage } from "./agents";

export const candidateSchema = z.object({
  customer: z.string().trim().min(1).max(80),
  kg: z.number().positive().max(10000).multipleOf(0.1),
  due: z.iso.datetime({ offset: true }),
  address: z.string().trim().min(1).max(300),
  note: z.string().max(1000).optional(),
});
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export function initialState(): FarmState {
  return {
    version: 1,
    demo: false,
    stockKg: 0,
    forecastKg: 0,
    orders: [],
    tasks: [],
    workers: [
      {
        id: "farmer",
        name: "农场主",
        skills: ["sort", "pack", "deliver"],
        available: true,
      },
      {
        id: "packing",
        name: "包装负责人",
        skills: ["sort", "pack"],
        available: true,
      },
      {
        id: "driver",
        name: "配送负责人",
        skills: ["deliver"],
        available: true,
      },
    ],
    messages: [
      {
        id: id(),
        role: "assistant",
        text: "你好，我是你的农忙协同助手。把订单、手写单照片或语音交给我，我会帮你整理待办、检查库存，并跟进每一次配送。先录入实际库存，或载入一组示例体验完整流程。",
        at: now(),
        tag: "欢迎",
      },
    ],
    events: [],
    jobs: [],
    attachments: [],
    drafts: [],
    sources: [],
    requests: [],
  };
}
export function message(
  s: FarmState,
  text: string,
  tag?: string,
  role: "assistant" | "user" = "assistant",
) {
  const entry = { id: id(), role, text, at: now(), tag };
  s.messages.push(entry);
  return entry;
}
export function event(
  s: FarmState,
  text: string,
  level: "info" | "warning" = "info",
) {
  s.events.unshift({ id: id(), text, at: now(), level });
  s.events = s.events.slice(0, 200);
}
export function availableStock(s: FarmState) {
  const reserved = s.orders
    .filter((o) => o.status === "confirmed" || o.status === "packed")
    .reduce((n, o) => n + Math.round(o.kg * 10), 0);
  return (Math.round(s.stockKg * 10) - reserved) / 10;
}
export function addOrder(s: FarmState, input: Candidate, source = "手动录入") {
  const data = candidateSchema.parse(input);
  const order = {
    ...data,
    note: data.note ?? "",
    id: id(),
    status: "review" as const,
    source,
    createdAt: now(),
  };
  s.orders.unshift(order);
  event(s, `${data.customer} 的 ${data.kg} kg 订单已登记，等待确认。`);
  return order;
}
export function confirmOrder(s: FarmState, orderId: string) {
  const o = s.orders.find((o) => o.id === orderId);
  if (!o || o.status !== "review") throw new Error("订单不存在，或已经处理。");
  if (o.kg > availableStock(s))
    throw new Error(
      `可用库存只有 ${availableStock(s)} kg。请先登记实际采收，或与客户确认调整数量；预计采收不能直接承诺。`,
    );
  if (Date.parse(o.due) <= Date.now())
    throw new Error("交付时间已过，请先修改交付时间。");
  o.status = "confirmed";
  event(s, `${o.customer} 的订单已确认，预留 ${o.kg} kg。`);
}
export function cancelOrder(s: FarmState, orderId: string) {
  const o = s.orders.find((o) => o.id === orderId);
  if (!o || o.status === "delivered" || o.status === "cancelled")
    throw new Error("这笔订单不能取消。");
  o.status = "cancelled";
  s.tasks = s.tasks.filter((t) => t.orderId !== o.id);
  event(s, `${o.customer} 的订单已取消，预留库存已释放。`);
}
export function plan(s: FarmState) {
  let count = 0;
  for (const o of [...s.orders]
    .filter((o) => o.status === "confirmed" || o.status === "packed")
    .sort((a, b) => a.due.localeCompare(b.due))) {
    let previous: string | undefined;
    for (const [index, kind] of (
      ["sort", "pack", "deliver"] as TaskKind[]
    ).entries()) {
      const existing = s.tasks.find(
        (t) => t.orderId === o.id && t.kind === kind,
      );
      if (existing && existing.status !== "blocked") {
        previous = existing.id;
        continue;
      }
      const eligible = s.workers.filter(
        (w) =>
          w.available &&
          w.skills.includes(kind) &&
          !existing?.declinedWorkerIds?.includes(w.id),
      );
      const load = (wid: string) =>
        s.tasks.filter((t) => t.workerId === wid && t.status !== "done").length;
      const worker = eligible.sort((a, b) => load(a.id) - load(b.id))[0];
      const task = existing ?? {
        id: id(),
        orderId: o.id,
        kind,
        title: `${TASK_NAMES[kind]} · ${o.customer}`,
        due: new Date(
          Date.parse(o.due) - (2 - index) * 60 * 60 * 1000,
        ).toISOString(),
        workerId: "",
        status: "blocked" as const,
      };
      if (worker) {
        task.workerId = worker.id;
        task.status = "offered";
        task.alerted = false;
        count++;
      } else {
        task.workerId = "";
        task.status = "blocked";
      }
      task.dependsOn = previous;
      previous = task.id;
      if (!existing) s.tasks.push(task);
    }
  }
  event(s, `已生成 ${count} 项接单邀请。任务仍需负责人确认，未视为已接单。`);
  return count;
}
export function actOnTask(
  s: FarmState,
  taskId: string,
  action: "accept" | "reject" | "complete",
  evidence?: string,
  deliveryConfirmed = false,
) {
  const t = s.tasks.find((t) => t.id === taskId);
  if (!t) throw new Error("任务不存在。");
  if (action === "accept") {
    if (t.status !== "offered") throw new Error("只有待接单任务可以接单。");
    if (!s.workers.find((w) => w.id === t.workerId)?.available)
      throw new Error("负责人当前不可用，请重新安排。");
    t.status = "accepted";
    t.alerted = false;
    event(s, `${t.title} 已由负责人接单。`);
  } else if (action === "reject") {
    if (t.status !== "offered" && t.status !== "accepted")
      throw new Error("任务状态已改变。");
    t.declinedWorkerIds = [...(t.declinedWorkerIds ?? []), t.workerId];
    t.status = "blocked";
    event(s, `${t.title} 需要重新安排。`, "warning");
  } else {
    if (t.status !== "accepted") throw new Error("请先由负责人接单。");
    if (
      t.dependsOn &&
      s.tasks.find((p) => p.id === t.dependsOn)?.status !== "done"
    )
      throw new Error("前置任务尚未完成，请先完成分选或打包。");
    if (!evidence || evidence.trim().length < 4)
      throw new Error("请填写完成凭据，例如实际称重、交接对象与送达时间。");
    if (t.kind === "deliver" && !deliveryConfirmed)
      throw new Error("请明确确认实际交接已经完成；仅有面单不能证明送达。");
    t.status = "done";
    t.evidence = evidence.trim();
    const o = s.orders.find((o) => o.id === t.orderId)!;
    if (t.kind === "pack") o.status = "packed";
    if (t.kind === "deliver") {
      o.status = "delivered";
      s.stockKg = Math.round((s.stockKg - o.kg) * 10) / 10;
    }
    event(s, `${t.title} 已完成，保存了负责人提交的凭据。`);
  }
}
export function monitor(s: FarmState, time = Date.now()) {
  for (const t of s.tasks) {
    if (t.status !== "done" && !t.alerted && Date.parse(t.due) < time) {
      t.alerted = true;
      event(
        s,
        `${t.title} 已超时，${t.status === "offered" ? "仍无人接单" : "请确认进度"}。`,
        "warning",
      );
      const note = message(
        s,
        `${t.title} 已超过计划时间。我已标记异常，请联系负责人或重新安排。`,
        "超时提醒",
      );
      recordAgent(
        s,
        note.id,
        "supervision",
        ["后台定时任务", "业务数据库"],
        "local",
        "检查未完成作业的期限，并记录超时提醒。",
      );
    }
  }
}
export function enqueue(
  s: FarmState,
  kind: JobKind,
  input: Record<string, string> = {},
) {
  if (
    s.jobs.filter((j) => j.status === "queued" || j.status === "running")
      .length >= 10
  )
    throw new Error("后台任务较多，请等待当前任务完成。");
  const job = {
    id: id(),
    kind,
    input,
    status: "queued" as const,
    createdAt: now(),
    updatedAt: now(),
    stage: "等待后台处理",
    traceMessageId: traceMessage(s).id,
  };
  s.jobs.push(job);
  return job;
}
export function seedDemo(s: FarmState) {
  if (s.orders.length || s.stockKg || s.tasks.length)
    throw new Error("已有业务数据，不能叠加示例。可在独立数据目录启动演示。");
  s.demo = true;
  s.stockKg = 80;
  s.forecastKg = 60;
  const deadline = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  const a = addOrder(
    s,
    {
      customer: "田中商店（示例）",
      kg: 40,
      due: deadline,
      address: "西予市内配送点 A",
    },
    "示例数据",
  );
  const b = addOrder(
    s,
    {
      customer: "山本先生（示例）",
      kg: 25,
      due: deadline,
      address: "西予市内配送点 B",
    },
    "示例数据",
  );
  addOrder(
    s,
    {
      customer: "海边旅馆（示例）",
      kg: 30,
      due: deadline,
      address: "西予市内配送点 C",
    },
    "示例数据",
  );
  confirmOrder(s, a.id);
  confirmOrder(s, b.id);
  plan(s);
  const late = s.tasks.find((t) => t.kind === "deliver")!;
  late.due = new Date(Date.now() - 300000).toISOString();
  monitor(s);
  message(
    s,
    "示例已载入：实际库存 80 kg，已预留 65 kg。旅馆还需要 30 kg，目前缺 15 kg，预计采收不会计入可售库存。另外，有一项配送邀请已经超时但仍无人接单，需要跟进。",
    "示例分析",
  );
}
