"use client";
import { useState } from "react";
import { FiPackage } from "react-icons/fi";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { evaluateShipment, ruleExamples } from "@/lib/farm/shipping-policy";
import type { BoxShipment, ShippingRule } from "@/lib/farm/types";
import { translate, type Locale } from "@/lib/i18n/core";

type Action = (payload: unknown) => Promise<unknown>;
export function ShippingRuleCard({
  rule,
  locale,
  busy,
  action,
}: {
  rule: ShippingRule;
  locale: Locale;
  busy: boolean;
  action: Action;
}) {
  const [partial, setPartial] = useState(rule.partial);
  const ja = locale === "ja";
  const examples = ruleExamples({ ...rule, partial });
  return (
    <Card className="shipping-rule-card">
      <div className="rule-heading">
        <Badge variant="outline">
          {ja ? "確認前のルール案" : "Rule draft · not active"}
        </Badge>
        <span>{rule.date} · JST</span>
      </div>
      <h3>
        {ja ? "今日は梱包済みの箱だけ発送" : "Today: ship only packed boxes"}
      </h3>
      <blockquote>{rule.source}</blockquote>
      <Label htmlFor={`policy-${rule.id}`}>
        {ja
          ? "一部の箱だけ先に発送できる条件"
          : "When may packed boxes ship first?"}
      </Label>
      <NativeSelect
        id={`policy-${rule.id}`}
        value={partial}
        disabled={busy}
        onChange={(event) =>
          setPartial(event.target.value as ShippingRule["partial"])
        }
      >
        <NativeSelectOption value="customer_consent">
          {ja
            ? "お客様の分納への同意がある場合だけ"
            : "Only with the customer's split-shipment consent"}
        </NativeSelectOption>
        <NativeSelectOption value="together">
          {ja
            ? "分納しない。全箱が揃うまで待つ"
            : "Never split. Wait until all boxes are ready"}
        </NativeSelectOption>
      </NativeSelect>
      <div className="rule-examples">
        {examples.map((example) => (
          <div key={example.title}>
            <strong>{translate(example.title, locale)}</strong>
            <Badge variant={example.allowed.length ? "secondary" : "outline"}>
              {ja
                ? `${example.allowed.length} 箱が発送候補`
                : `${example.allowed.length} boxes eligible`}
            </Badge>
            <p>{translate(example.reason, locale)}</p>
          </div>
        ))}
      </div>
      <p>
        {ja
          ? "「今日発送」と「同じ日に到着」は別の条件です。このルールは到着日を保証しません。"
          : "Shipping today is different from arriving on the same day. This rule does not guarantee arrival dates."}
      </p>
      <Button
        disabled={busy}
        onClick={() =>
          void action({ type: "confirm_rule", id: rule.id, partial })
        }
      >
        {ja
          ? "このルールを確認して有効にする"
          : "Confirm and activate this rule"}
      </Button>
    </Card>
  );
}
export function RuleShipmentCard({
  rule,
  shipment,
  locale,
  busy,
  action,
}: {
  rule: ShippingRule;
  shipment: BoxShipment;
  locale: Locale;
  busy: boolean;
  action: Action;
}) {
  const ja = locale === "ja";
  const decision = evaluateShipment(rule, shipment);
  const update = (
    change: Partial<{
      sameArrival: boolean;
      splitConsent: boolean;
      packedSecond: boolean;
    }>,
  ) =>
    action({
      type: "shipment_conditions",
      id: shipment.id,
      sameArrival: shipment.sameArrival,
      splitConsent: shipment.splitConsent,
      packedSecond: shipment.boxes[1].packed,
      ...change,
    });
  return (
    <Card className="shipping-rule-card">
      <div className="rule-heading">
        <Badge>
          {ja ? "ルール有効 · シミュレーション" : "Rule active · simulation"}
        </Badge>
        <span>{rule.date} · JST</span>
      </div>
      <h3>
        {ja
          ? "みかん 10 kg を、5 kg × 2 箱で発送"
          : "One 10 kg mikan order, in two 5 kg boxes"}
      </h3>
      <div className="shipment-boxes">
        {shipment.boxes.map((box, i) => (
          <div className={box.packed ? "packed" : "unpacked"} key={box.id}>
            <FiPackage size={26} />
            <strong>
              {ja ? `箱 ${i + 1}` : `Box ${i + 1}`} · {box.kg} kg
            </strong>
            <Badge variant="outline">
              {box.shippedAt
                ? ja
                  ? "発送済み（模擬）"
                  : "Dispatched (simulated)"
                : box.packed
                  ? ja
                    ? "梱包済み"
                    : "Packed"
                  : ja
                    ? "未梱包"
                    : "Not packed"}
            </Badge>
          </div>
        ))}
      </div>
      <Label className="rule-condition">
        <Checkbox
          checked={shipment.sameArrival}
          disabled={busy}
          onCheckedChange={(value) =>
            void update({ sameArrival: value === true })
          }
        />
        {ja
          ? "お客様は全箱が同じ日に届くことを希望"
          : "Customer requires all boxes to arrive on the same day"}
      </Label>
      <Label className="rule-condition">
        <Checkbox
          checked={shipment.splitConsent}
          disabled={busy}
          onCheckedChange={(value) =>
            void update({ splitConsent: value === true })
          }
        />
        {ja
          ? "お客様の分納への同意を確認済み"
          : "Customer's split-shipment consent has been confirmed"}
      </Label>
      <Label className="rule-condition">
        <Checkbox
          checked={shipment.boxes[1].packed}
          disabled={busy || !!shipment.boxes[1].shippedAt}
          onCheckedChange={(value) =>
            void update({ packedSecond: value === true })
          }
        />
        {ja ? "箱 2 の梱包完了を確認" : "Box 2 packing has been verified"}
      </Label>
      <p className="rule-decision" role="status">
        {translate(decision.reason, locale)}
      </p>
      <p>
        {ja
          ? "到着日は未確定です。配送会社への送信や実際の配送手配は行いません。"
          : "Arrival is unconfirmed. This test does not contact a carrier or book a real shipment."}
      </p>
      <Button
        disabled={busy}
        onClick={() =>
          void action({
            type: "ship_boxes",
            ruleId: rule.id,
            shipmentId: shipment.id,
          })
        }
      >
        {ja
          ? "ルールを再確認して模擬発送"
          : "Recheck rule and simulate dispatch"}
      </Button>
    </Card>
  );
}
