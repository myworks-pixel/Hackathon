import type { BoxShipment, ShippingRule } from "./types";

export function japanDate(time = Date.now()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);
}
export function evaluateShipment(
  rule: ShippingRule | undefined,
  shipment: BoxShipment,
  time = Date.now(),
) {
  const pending = shipment.boxes.filter((b) => !b.shippedAt);
  const ready = pending.filter((b) => b.packed);
  const result = (allowed: string[], reason: string) => ({
    allowed,
    held: pending.filter((b) => !allowed.includes(b.id)).map((b) => b.id),
    reason,
    arrivalGuaranteed: false as const,
  });
  if (!rule || rule.status !== "active")
    return result([], "规则尚未确认，不执行发货。");
  if (rule.date !== japanDate(time))
    return result([], "今天的规则已过期，请重新确认。");
  if (!pending.length) return result([], "所有箱子已经处理，不重复发货。");
  if (shipment.sameArrival && shipment.boxes.some((b) => b.shippedAt))
    return result([], "已有箱子发出，同日到达需要人工重新协调，不能自动承诺。");
  if (!ready.length) return result([], "没有已装好的箱子，暂不发货。");
  if (ready.length < pending.length) {
    if (shipment.sameArrival)
      return result(
        [],
        "客户要求同一天收到，不能拆开发货；等待全部装好后再确认配送方案。",
      );
    if (rule.partial === "together")
      return result([], "已选择整单一起发货，等待全部箱子装好。");
    if (!shipment.splitConsent)
      return result([], "先发一部分需要客户明确同意，请先确认。");
    return result(
      ready.map((b) => b.id),
      "客户已同意分批，只发送已装好的箱子，其余继续等待。",
    );
  }
  return result(
    ready.map((b) => b.id),
    "全部箱子已装好，可以一起发货；到达日期仍需配送方确认。",
  );
}
export function ruleExamples(rule: ShippingRule) {
  const base: BoxShipment = {
    id: "example",
    customer: "サンプル",
    sameArrival: false,
    splitConsent: true,
    boxes: [
      { id: "A", kg: 5, packed: true },
      { id: "B", kg: 5, packed: false },
    ],
  };
  const hypothetical = { ...rule, status: "active" as const };
  return [
    { title: "一箱已装好，一箱未装好；客户同意分批", shipment: base },
    {
      title: "一箱已装好，但客户要求同一天收到",
      shipment: { ...base, sameArrival: true },
    },
    {
      title: "一箱已装好，但还没有客户的分批同意",
      shipment: { ...base, splitConsent: false },
    },
    {
      title: "两箱均已装好",
      shipment: {
        ...base,
        boxes: base.boxes.map((b) => ({ ...b, packed: true })),
      },
    },
  ].map((example) => ({
    title: example.title,
    ...evaluateShipment(hypothetical, example.shipment),
  }));
}
