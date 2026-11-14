"use client";
import {
  FiMessageCircle,
  FiShoppingBag,
  FiCalendar,
  FiTruck,
  FiEye,
  FiTool,
  FiGitBranch,
} from "react-icons/fi";
import { ChevronDown, Check, LoaderCircle, AlertCircle } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { translate, type Locale } from "@/lib/i18n/core";
import type {
  AgentId,
  AgentRun,
  SimulationCheck,
  CoordinationPlan,
} from "@/lib/farm/types";

const agents = {
  coordinator: {
    ja: "Mikan 総合エージェント",
    en: "Mikan coordinator",
    Icon: FiGitBranch,
    background: "#ccfbf1",
    color: "#0f766e",
  },
  reception: {
    ja: "接客エージェント",
    en: "Reception agent",
    Icon: FiMessageCircle,
    background: "#dbeafe",
    color: "#1d4ed8",
  },
  orders: {
    ja: "注文エージェント",
    en: "Order agent",
    Icon: FiShoppingBag,
    background: "#ffedd5",
    color: "#c2410c",
  },
  production: {
    ja: "生産計画エージェント",
    en: "Production agent",
    Icon: FiCalendar,
    background: "#dcfce7",
    color: "#15803d",
  },
  delivery: {
    ja: "配送調整エージェント",
    en: "Delivery agent",
    Icon: FiTruck,
    background: "#ede9fe",
    color: "#6d28d9",
  },
  supervision: {
    ja: "進捗監督エージェント",
    en: "Progress agent",
    Icon: FiEye,
    background: "#ffe4e6",
    color: "#be123c",
  },
  adapter: {
    ja: "ツール連携エージェント",
    en: "Tool adaptation agent",
    Icon: FiTool,
    background: "#cffafe",
    color: "#0e7490",
  },
};
export function AgentAvatar({
  agent,
  locale,
}: {
  agent: AgentId;
  locale: Locale;
}) {
  const config = agents[agent];
  return (
    <Avatar
      className="agent-avatar"
      title={config[locale]}
      aria-label={config[locale]}
    >
      <AvatarFallback
        style={{ background: config.background, color: config.color }}
      >
        <config.Icon size={19} aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  );
}
export function AgentActivity({
  runs,
  checks,
  plan,
  locale,
}: {
  runs: AgentRun[];
  checks?: SimulationCheck[];
  plan?: CoordinationPlan;
  locale: Locale;
}) {
  const ids = [...new Set(runs.map((run) => run.agent))];
  const ja = locale === "ja";
  return (
    <Collapsible
      className="agent-activity"
      defaultOpen={!!checks?.length || !!plan}
    >
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="agent-activity-trigger">
          <AvatarGroup>
            {ids.slice(0, 3).map((id) => (
              <AgentAvatar key={id} agent={id} locale={locale} />
            ))}
            {ids.length > 3 && (
              <AvatarGroupCount
                aria-label={
                  ja
                    ? `ほか ${ids.length - 3} エージェント`
                    : `${ids.length - 3} more agents`
                }
              >
                +{ids.length - 3}
              </AvatarGroupCount>
            )}
          </AvatarGroup>
          <span>
            {ids.length === 1
              ? agents[ids[0]][locale]
              : ja
                ? `${ids.length} エージェントが連携`
                : `${ids.length} agents involved`}
          </span>
          <ChevronDown size={16} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {plan && (
          <div className="coordination-plan">
            <strong>
              {ja ? "総合エージェントの判断" : "Coordinator's decision"}
            </strong>
            <p>{plan.reason}</p>
            {plan.assignments.length === 0 ? (
              <p>
                {ja
                  ? "専門エージェントを呼ばずに回答"
                  : "Answer directly; no specialist needed"}
              </p>
            ) : (
              plan.assignments.map((a) => (
                <div className="planned-assignment" key={a.id}>
                  <div>
                    <strong>{agents[a.agentId][locale]}</strong>
                    <Badge variant="outline">
                      {
                        {
                          queued: ja ? "開始前" : "Planned",
                          running: ja ? "実行中" : "Running",
                          done: ja ? "完了" : "Done",
                          waiting: ja ? "回答待ち" : "Needs input",
                          blocked: ja ? "保留" : "Blocked",
                          failed: ja ? "未完了" : "Failed",
                        }[a.status]
                      }
                    </Badge>
                  </div>
                  <p>{a.task}</p>
                  <ol>
                    {a.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                  {!!a.dependsOn.length && (
                    <small>
                      {ja ? "前提" : "Depends on"}:{" "}
                      {a.dependsOn
                        .map((id) => {
                          const upstream = plan.assignments.find(
                            (item) => item.id === id,
                          );
                          return upstream
                            ? agents[upstream.agentId][locale]
                            : id;
                        })
                        .join(" → ")}
                    </small>
                  )}
                  {a.question && <p>{a.question}</p>}
                  {a.status === "blocked" && (
                    <p>
                      {translate(
                        a.summary || "前置任务尚未完成，此智能体未启动。",
                        locale,
                      )}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
        <div className="agent-run-list">
          {runs.map((run) => (
            <div className="agent-run" key={run.id}>
              <AgentAvatar agent={run.agent} locale={locale} />
              <div className="agent-run-body">
                <div className="agent-run-heading">
                  <strong>{agents[run.agent][locale]}</strong>
                  <Badge variant="outline">
                    {run.mode === "simulation"
                      ? ja
                        ? "シミュレーション"
                        : "Simulated"
                      : run.mode === "live"
                        ? ja
                          ? "実 API"
                          : "Live API"
                        : ja
                          ? "ローカル"
                          : "Local"}
                  </Badge>
                </div>
                <div className="agent-platforms">
                  {run.platforms.length
                    ? run.platforms.map((p) => translate(p, locale)).join(" · ")
                    : ja
                      ? "外部 API 呼び出しなし"
                      : "No external API call"}
                </div>
                <p>{translate(run.summary, locale)}</p>
                {!!run.receipts?.length && (
                  <Collapsible className="agent-receipts">
                    <CollapsibleTrigger asChild>
                      <Button size="sm" variant="ghost">
                        {ja ? "ツール実行記録" : "Tool receipts"} (
                        {run.receipts.length})<ChevronDown size={14} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {run.receipts.map((receipt) => (
                        <div key={receipt.id} className="agent-receipt">
                          <code>{receipt.tool}</code>
                          <Badge variant="outline">
                            {receipt.status === "done"
                              ? ja
                                ? "完了"
                                : "Done"
                              : receipt.status === "waiting"
                                ? ja
                                  ? "回答待ち"
                                  : "Needs input"
                                : ja
                                  ? "未完了"
                                  : "Incomplete"}
                          </Badge>
                          <small>
                            {receipt.platforms
                              .map((p) => translate(p, locale))
                              .join(" · ") ||
                              (ja ? "外部呼び出しなし" : "No external call")}
                          </small>
                          <p>{translate(receipt.summary, locale)}</p>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
              <span
                className={`agent-result ${run.status}`}
                title={translate(
                  run.status === "done"
                    ? "完成"
                    : run.status === "running"
                      ? "处理中"
                      : "未完成",
                  locale,
                )}
              >
                {run.status === "running" ? (
                  <LoaderCircle className="spin" size={16} />
                ) : run.status === "done" ? (
                  <Check size={16} />
                ) : (
                  <AlertCircle size={16} />
                )}
              </span>
            </div>
          ))}
        </div>
        {!!checks?.length && (
          <Collapsible className="simulation-checks">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm">
                {ja ? "検証結果" : "Test results"}{" "}
                {checks.filter((c) => c.passed).length}/{checks.length}
                <ChevronDown size={14} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {checks.map((check, i) => (
                <div className="simulation-check" key={i}>
                  <Badge variant={check.passed ? "secondary" : "destructive"}>
                    {check.passed ? "PASS" : "FAIL"}
                  </Badge>
                  <span>
                    {translate(check.name, locale)}
                    <small>
                      {ja ? "期待値" : "Expected"}: {check.expected} ·{" "}
                      {ja ? "結果" : "Actual"}: {check.actual}
                    </small>
                  </span>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
