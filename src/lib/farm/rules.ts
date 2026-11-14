import { randomUUID } from "node:crypto";
import { recordAgent, traceMessage } from "./agents";
import { evaluateShipment, japanDate } from "./shipping-policy";
import type { FarmState, ShippingRule } from "./types";

export const isPackedRuleRequest = (text: string) =>
  /(?:今天|今日|today).*(?:装好|梱包|packed)|(?:装好|梱包|packed).*(?:今天|今日|today)/i.test(
    text,
  );
export function proposeShippingRule(
  s: FarmState,
  source: string,
  includeLocalTrace = true,
) {
  const rule: ShippingRule = {
    id: randomUUID(),
    source,
    kind: "packed_only_today",
    date: japanDate(),
    status: "draft",
    partial: "customer_consent",
  };
  s.ruleDraft = rule;
  const reply = traceMessage(
    s,
    "我把这句话整理成今天有效的发货规则草案。请先看例子，确认分批发货的边界；确认前不会启用。",
  );
  Object.assign(reply, { ruleDraftId: rule.id, tag: "规则待确认" });
  if (includeLocalTrace)
    recordAgent(
      s,
      reply.id,
      "orders",
      ["业务数据库"],
      "local",
      "将规则限制为今天、已装箱、客户同意分批，不自动承诺到达日期。",
    );
  if (includeLocalTrace)
    recordAgent(
      s,
      reply.id,
      "delivery",
      [],
      "local",
      "用已装箱、未装箱和同日到达要求检查规则边界。",
    );
}
export function confirmShippingRule(
  s: FarmState,
  id: string,
  partial: ShippingRule["partial"],
) {
  if (!s.ruleDraft || s.ruleDraft.id !== id || s.ruleDraft.status !== "draft")
    throw new Error("规则草案已更新，请确认最新版本。");
  if (s.ruleDraft.date !== japanDate())
    throw new Error("今天的规则已过期，请重新确认。");
  s.activeRule = {
    ...s.ruleDraft,
    partial,
    status: "active",
    confirmedAt: new Date().toISOString(),
  };
  s.ruleDraft = undefined;
  const reply = traceMessage(
    s,
    "规则已确认并启用，仅适用于今天。发货前会重新检查装箱状态和客户要求。",
  );
  recordAgent(
    s,
    reply.id,
    "supervision",
    ["业务数据库"],
    "local",
    "保存已确认规则和有效日期；未确认的新草案不会覆盖它。",
  );
  if (s.ruleShipment) Object.assign(reply, { shipmentId: s.ruleShipment.id });
}
export function seedRuleShipment(s: FarmState) {
  s.ruleShipment = {
    id: randomUUID(),
    customer: "山本様（みかん 10 kg・サンプル）",
    sameArrival: false,
    splitConsent: false,
    boxes: [
      { id: "MIKAN-A", kg: 5, packed: true },
      { id: "MIKAN-B", kg: 5, packed: false },
    ],
  };
}
export function dispatchBoxes(
  s: FarmState,
  ruleId: string,
  shipmentId: string,
) {
  if (
    !s.ruleShipment ||
    s.ruleShipment.id !== shipmentId ||
    s.activeRule?.id !== ruleId
  )
    throw new Error("规则或订单已更新，请重新检查。");
  const decision = evaluateShipment(s.activeRule, s.ruleShipment);
  const reply = traceMessage(s, decision.reason);
  Object.assign(reply, { shipmentId, tag: s.demo ? "模拟发货" : "发货检查" });
  for (const box of s.ruleShipment.boxes)
    if (decision.allowed.includes(box.id))
      box.shippedAt = new Date().toISOString();
  recordAgent(
    s,
    reply.id,
    "delivery",
    ["业务数据库"],
    "local",
    decision.reason,
    decision.allowed.length ? "done" : "blocked",
  );
  return decision;
}
