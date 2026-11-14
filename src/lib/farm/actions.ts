import { z } from "zod";
import {
  actOnTask,
  addOrder,
  availableStock,
  cancelOrder,
  candidateSchema,
  confirmOrder,
  enqueue,
  event,
  message,
  seedDemo,
} from "./domain";
import { currentWorkspace, updateState } from "./store";
import { intakeUnavailableReason } from "./providers";
import { recordAgent, reviewCandidates } from "./agents";
import { confirmShippingRule, dispatchBoxes, seedRuleShipment } from "./rules";
import type { ExecutionMode } from "./types";
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("demo") }),
  z.object({ type: z.literal("simulation") }),
  z.object({ type: z.literal("rule_demo") }),
  z.object({
    type: z.literal("confirm_rule"),
    id: z.string(),
    partial: z.enum(["customer_consent", "together"]),
  }),
  z.object({
    type: z.literal("shipment_conditions"),
    id: z.string(),
    sameArrival: z.boolean(),
    splitConsent: z.boolean(),
    packedSecond: z.boolean(),
  }),
  z.object({
    type: z.literal("ship_boxes"),
    ruleId: z.string(),
    shipmentId: z.string(),
  }),
  z.object({
    type: z.literal("stock"),
    kg: z.number().positive().max(10000).multipleOf(0.1),
    forecast: z.boolean().default(false),
  }),
  z.object({ type: z.literal("order"), order: candidateSchema }),
  z.object({ type: z.literal("confirm"), id: z.string() }),
  z.object({ type: z.literal("cancel"), id: z.string() }),
  z.object({
    type: z.literal("task"),
    id: z.string(),
    action: z.enum(["accept", "reject", "complete"]),
    evidence: z.string().max(1000).optional(),
    deliveryConfirmed: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("worker"),
    id: z.string(),
    available: z.boolean(),
  }),
  z.object({
    type: z.literal("job"),
    kind: z.enum(["plan", "research", "adapter"]),
    csv: z.string().max(30000).optional(),
  }),
  z.object({
    type: z.literal("chat"),
    text: z.string().trim().max(20000),
    attachmentId: z.string().optional(),
  }),
  z.object({
    type: z.literal("draft"),
    id: z.string(),
    action: z.enum(["import", "dismiss"]),
  }),
  z.object({
    type: z.literal("reschedule"),
    id: z.string(),
    due: z.iso.datetime({ offset: true }),
  }),
]);
export function dispatch(
  raw: unknown,
  requestId: string,
  locale: "ja" | "en" = "ja",
  execution: ExecutionMode = "live",
) {
  const a = actionSchema.parse(raw);
  if (execution !== "live" && execution !== "offline")
    throw new Error("执行模式无效。");
  if (execution === "offline" && currentWorkspace() !== "simulation")
    throw new Error("离线验证仅支持样例数据。");
  return updateState((s) => {
    const originalJobCount = s.jobs.length;
    if (s.requests.includes(requestId)) return { duplicate: true };
    if (a.type === "rule_demo") {
      if (currentWorkspace() !== "simulation")
        throw new Error("请在模拟工作区运行测试。");
      if (s.jobs.some((j) => j.status === "running" || j.status === "queued"))
        throw new Error("请等待当前测试完成。");
      seedRuleShipment(s);
      s.ruleDraft = undefined;
      s.activeRule = undefined;
      const text =
        locale === "en"
          ? "Today, ship only the boxes that are already packed."
          : "今日は梱包済みの箱だけ発送してください。";
      const m = message(s, text, undefined, "user");
      enqueue(s, "intake", { text, messageId: m.id });
    } else if (a.type === "confirm_rule") {
      confirmShippingRule(s, a.id, a.partial);
    } else if (a.type === "shipment_conditions") {
      if (currentWorkspace() !== "simulation")
        throw new Error("请在模拟工作区运行测试。");
      if (s.ruleShipment?.id !== a.id)
        throw new Error("规则或订单已更新，请重新检查。");
      s.ruleShipment.sameArrival = a.sameArrival;
      s.ruleShipment.splitConsent = a.splitConsent;
      if (!s.ruleShipment.boxes[1].shippedAt)
        s.ruleShipment.boxes[1].packed = a.packedSecond;
    } else if (a.type === "ship_boxes") {
      if (currentWorkspace() !== "simulation")
        throw new Error("请在模拟工作区运行测试。");
      dispatchBoxes(s, a.ruleId, a.shipmentId);
    } else if (a.type === "simulation") {
      if (currentWorkspace() !== "simulation")
        throw new Error("请在模拟工作区运行测试。");
      if (s.jobs.some((j) => j.status === "queued" || j.status === "running"))
        throw new Error("请等待当前测试完成。");
      message(
        s,
        locale === "en"
          ? "Run the six-agent sample test."
          : "6 つのエージェントでサンプルを検証してください。",
        undefined,
        "user",
      );
      enqueue(s, "simulation");
    } else if (a.type === "demo") seedDemo(s);
    else if (a.type === "stock") {
      if (a.forecast) s.forecastKg = a.kg;
      else s.stockKg = Math.round((s.stockKg + a.kg) * 10) / 10;
      event(
        s,
        a.forecast
          ? `预计可采收更新为 ${a.kg} kg，尚未入库。`
          : `已核实 ${a.kg} kg 采收完成并入库。`,
      );
      message(
        s,
        a.forecast
          ? "预计采收已更新，不计入可售库存。"
          : `已登记实际采收 ${a.kg} kg，目前可用 ${availableStock(s)} kg。`,
        "库存更新",
      );
    } else if (a.type === "order") addOrder(s, a.order);
    else if (a.type === "confirm") {
      confirmOrder(s, a.id);
      enqueue(s, "plan");
      message(
        s,
        "订单已确认并预留库存，正在后台安排分选、打包和配送。",
        "订单确认",
      );
    } else if (a.type === "cancel") cancelOrder(s, a.id);
    else if (a.type === "task") {
      actOnTask(s, a.id, a.action, a.evidence, a.deliveryConfirmed);
      if (a.action === "reject") enqueue(s, "plan");
    } else if (a.type === "worker") {
      const w = s.workers.find((w) => w.id === a.id);
      if (!w) throw new Error("找不到负责人。");
      w.available = a.available;
      if (!a.available)
        for (const t of s.tasks)
          if (t.workerId === w.id && t.status !== "done") t.status = "blocked";
      event(
        s,
        `${w.name} 已${a.available ? "恢复可用" : "暂停接单，未完成任务需要重新安排"}。`,
      );
    } else if (a.type === "job") {
      if (a.kind === "adapter" && !a.csv?.trim())
        throw new Error("请先粘贴 CSV 订单表。");
      enqueue(s, a.kind, a.csv ? { csv: a.csv } : {});
      message(
        s,
        "已开始后台处理。你可以继续其他工作，完成后我会在这里告诉你。",
        "任务已接收",
      );
    } else if (a.type === "chat") {
      if (!a.text && !a.attachmentId)
        throw new Error("请先输入消息或添加附件。");
      if (a.attachmentId && !s.attachments.find((f) => f.id === a.attachmentId))
        throw new Error("找不到附件。");
      message(
        s,
        a.text || "请整理这个附件。",
        a.attachmentId ? "含附件" : undefined,
        "user",
      );
      if (
        !a.attachmentId &&
        (execution === "offline" || !!intakeUnavailableReason()) &&
        /^(?:(查看|检查)?(今日|今天)?(待办|概况|库存|订单|任务)|今日の作業|在庫|注文|作業|概要|today's tasks|inventory|orders|tasks|overview)[？?。！!]*$/i.test(
          a.text,
        )
      ) {
        const reply = message(
          s,
          `当前实际库存 ${s.stockKg} kg，可用 ${availableStock(s)} kg；${s.orders.filter((o) => o.status === "review").length} 笔订单待确认，${s.tasks.filter((t) => t.status === "offered").length} 项任务等负责人接单，${s.tasks.filter((t) => t.alerted && t.status !== "done").length} 项任务超时。`,
          "业务数据查询",
        );
        recordAgent(
          s,
          reply.id,
          "coordinator",
          ["业务数据库"],
          "local",
          "读取库存、待确认订单和作业进度。",
        );
      } else {
        const file = s.attachments.find((f) => f.id === a.attachmentId);
        const unavailable =
          execution === "offline"
            ? undefined
            : intakeUnavailableReason() || intakeUnavailableReason(file);
        if (unavailable) {
          const reply = message(s, unavailable, "连接尚未就绪");
          recordAgent(
            s,
            reply.id,
            "coordinator",
            [],
            "local",
            "模型尚未配置，未发起外部调用。",
            "blocked",
          );
        } else if (
          !s.workerHeartbeat ||
          Date.now() - Date.parse(s.workerHeartbeat) >= 20000
        ) {
          message(
            s,
            "消息处理服务尚未启动。请启动应用服务后重新发送这条消息。",
            "服务尚未启动",
          );
        } else {
          enqueue(s, "intake", {
            text: a.text,
            messageId: s.messages.at(-1)!.id,
            ...(a.attachmentId ? { attachmentId: a.attachmentId } : {}),
          });
        }
      }
    } else if (a.type === "draft") {
      const draft = s.drafts.find((d) => d.id === a.id);
      if (!draft || draft.status !== "pending")
        throw new Error("这份识别结果已经处理。");
      if (a.action === "import") {
        const reviewed = reviewCandidates(s, draft.candidates);
        for (const c of reviewed.accepted) addOrder(s, c, draft.source);
        draft.status = "imported";
        const reply = message(
          s,
          `已登记 ${reviewed.accepted.length} 笔待确认订单。请在订单页确认库存和交付日期。`,
          "登记完成",
        );
        recordAgent(
          s,
          reply.id,
          "orders",
          ["业务数据库"],
          "local",
          `已排除 ${reviewed.duplicates.length} 笔重复订单。`,
        );
      } else draft.status = "dismissed";
    } else if (a.type === "reschedule") {
      if (Date.parse(a.due) <= Date.now()) throw new Error("请选择未来时间。");
      const o = s.orders.find((o) => o.id === a.id);
      if (!o || o.status === "delivered" || o.status === "cancelled")
        throw new Error("不能修改这笔订单。");
      o.due = a.due;
      for (const t of s.tasks.filter(
        (t) => t.orderId === o.id && t.status !== "done",
      )) {
        const i = { sort: 2, pack: 1, deliver: 0 }[t.kind];
        t.due = new Date(Date.parse(a.due) - i * 3600000).toISOString();
        t.alerted = false;
      }
      event(s, `${o.customer} 的交付日期已由经营者确认调整。`);
    }
    for (const job of s.jobs.slice(originalJobCount)) {
      job.input.locale = locale;
      job.execution = job.kind === "simulation" ? "offline" : execution;
    }
    s.requests.push(requestId);
    s.requests = s.requests.slice(-2000);
    return { ok: true };
  });
}
