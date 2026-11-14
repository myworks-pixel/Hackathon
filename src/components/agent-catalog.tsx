"use client";

import { AgentAvatar } from "./agent-activity";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Locale } from "@/lib/i18n/core";
import type { AgentId } from "@/lib/farm/types";

type AgentCopy = {
  id: AgentId;
  name: string;
  role: string;
  description: string;
  problem: string;
};

const copy: Record<Locale, AgentCopy[]> = {
  ja: [
    {
      id: "coordinator",
      name: "Mikan 総合エージェント",
      role: "総合 Agent",
      description:
        "依頼の意味を理解し、必要な専門エージェントだけを選び、実行順序と依存関係を決めて結果をまとめます。",
      problem:
        "注文・在庫・配送など複数領域にまたがる相談を、重複なく一つの回答にまとめます。普通の会話には専門エージェントを呼びません。",
    },
    {
      id: "reception",
      name: "接客エージェント",
      role: "問い合わせ・情報収集",
      description:
        "農園やお客様からの質問に対応し、画像・音声・文章を読み取り、公式の天気・配送情報を調べます。",
      problem:
        "問い合わせ内容が散らばっている、注文書を読めない、現在の天気や配送情報を確認したい問題を解決します。",
    },
    {
      id: "orders",
      name: "注文エージェント",
      role: "注文整理・ルール作成",
      description:
        "注文情報を抽出して重複を確認し、確認用の注文案や出荷ルール案を作ります。足りない情報は質問します。",
      problem:
        "手書き注文や会話から必要項目を整理し、二重登録と不完全な注文を防ぎます。確定は農園側が行います。",
    },
    {
      id: "production",
      name: "生産計画エージェント",
      role: "在庫・作業計画",
      description:
        "実在庫と作業能力を確認し、確定済み注文に必要な選別・箱詰め・配送の作業を組み立てます。",
      problem:
        "在庫不足、作業の抜け、担当者のいない工程を見つけ、実行可能な作業依頼に変えます。",
    },
    {
      id: "delivery",
      name: "配送調整エージェント",
      role: "日程・配送条件",
      description:
        "担当者と時間の重複を確認し、Daytona で日程を計算して、箱の準備状況と到着条件を検証します。",
      problem:
        "配送時間の衝突や『一部だけ先に送れるか』の境界を確認します。配送予約や到着保証は行いません。",
    },
    {
      id: "supervision",
      name: "進捗監督エージェント",
      role: "進捗・引き継ぎ確認",
      description:
        "未割り当て、期限超過、未完了の作業を確認し、進捗と引き渡し証拠の不足を報告します。",
      problem:
        "誰も引き受けていない作業、遅れている配送、完了記録のない引き渡しを見逃さないようにします。",
    },
    {
      id: "adapter",
      name: "ツール連携エージェント",
      role: "注文表の形式変換",
      description:
        "見慣れない CSV 注文表を CodeAF と Daytona で変換・検証し、確認用の注文案として保存します。",
      problem:
        "取引先ごとに列名や並びが違う注文表を、安全に共通形式へ変換します。自動で注文を確定しません。",
    },
  ],
  en: [
    {
      id: "coordinator",
      name: "Mikan coordinator",
      role: "Coordinator",
      description:
        "Understands the request, selects only the needed specialists, orders dependent work, and combines verified results.",
      problem:
        "Turns requests spanning orders, inventory, and delivery into one non-duplicated answer. It answers ordinary conversation without calling specialists.",
    },
    {
      id: "reception",
      name: "Reception agent",
      role: "Questions & research",
      description:
        "Answers farm and customer questions, reads text, images, and audio, and researches official weather and delivery notices.",
      problem:
        "Handles scattered inquiries, unreadable order materials, and requests for current public weather or delivery information.",
    },
    {
      id: "orders",
      name: "Order agent",
      role: "Orders & rules",
      description:
        "Extracts order facts, checks duplicates, and prepares order or shipping-rule drafts. It asks when required facts are missing.",
      problem:
        "Structures handwritten orders and conversations while preventing incomplete or duplicate records. The farmer still confirms them.",
    },
    {
      id: "production",
      name: "Production agent",
      role: "Inventory & work plan",
      description:
        "Checks real inventory and capacity, then creates sorting, packing, and delivery work for confirmed orders.",
      problem:
        "Finds inventory shortages, missing steps, and unowned work, and turns them into executable work offers.",
    },
    {
      id: "delivery",
      name: "Delivery agent",
      role: "Schedule & conditions",
      description:
        "Checks worker and time conflicts, calculates schedules in Daytona, and tests box readiness against arrival constraints.",
      problem:
        "Clarifies scheduling conflicts and boundaries such as whether one packed box may ship first. It never books or guarantees delivery.",
    },
    {
      id: "supervision",
      name: "Progress agent",
      role: "Progress & handoff",
      description:
        "Checks unassigned, overdue, and incomplete work and reports missing progress or handoff evidence.",
      problem:
        "Prevents unaccepted work, late deliveries, and handoffs without completion records from being overlooked.",
    },
    {
      id: "adapter",
      name: "Tool adaptation agent",
      role: "Order format conversion",
      description:
        "Converts and validates unfamiliar CSV order sheets with CodeAF in Daytona, then saves drafts for review.",
      problem:
        "Safely normalizes partner spreadsheets with different columns and ordering. It never confirms orders automatically.",
    },
  ],
};

export function AgentCatalog({ locale }: { locale: Locale }) {
  const agents = copy[locale];
  const ja = locale === "ja";

  return (
    <section
      className="agent-catalog"
      aria-label={ja ? "エージェント一覧" : "Agent directory"}
    >
      <div className="agent-catalog-intro">
        <strong>
          {ja
            ? "1 つの総合 Agent と 6 つの専門 Agent"
            : "1 coordinator and 6 specialist agents"}
        </strong>
        <p>
          {ja
            ? "総合 Agent が依頼ごとに必要な担当だけを選び、専門 Agent の実行結果を一つの回答にまとめます。"
            : "The coordinator selects only the specialists needed for each request and combines their verified results into one answer."}
        </p>
      </div>
      <div className="agent-catalog-grid">
        {agents.map((agent) => (
          <Card
            className={`agent-catalog-card ${agent.id === "coordinator" ? "coordinator" : ""}`}
            key={agent.id}
          >
            <div className="agent-catalog-heading">
              <AgentAvatar agent={agent.id} locale={locale} />
              <div>
                <h2>{agent.name}</h2>
                <Badge variant="secondary">{agent.role}</Badge>
              </div>
            </div>
            <p className="agent-catalog-description">{agent.description}</p>
            <div className="agent-problem">
              <span>{ja ? "解決する問題" : "Problems it solves"}</span>
              <p>{agent.problem}</p>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
