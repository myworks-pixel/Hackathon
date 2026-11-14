import { now, message, monitor, plan } from "./domain";
import {
  currentWorkspace,
  readState,
  updateState,
  withWorkspace,
} from "./store";
import type { AgentId, AgentMode, Candidate, Job } from "./types";
import {
  finishAgent,
  recordAgent,
  reviewCandidates,
  startAgent,
  traceMessage,
} from "./agents";
import { runCoordinator } from "./coordinator";
import {
  parseSampleCsv,
  runSimulation,
  simulateSchedule,
  simulateUnderstanding,
} from "./simulation";
import { proposeShippingRule, seedRuleShipment } from "./rules";

async function invokeAgent<T>(
  job: Job,
  agent: AgentId,
  platforms: string[],
  mode: AgentMode,
  summary: string,
  work: () => T | Promise<T>,
): Promise<T> {
  const id = updateState((s) =>
    startAgent(s, job.traceMessageId, agent, platforms, mode, summary),
  );
  try {
    const result = await work();
    updateState((s) => finishAgent(s, id, "done"));
    return result;
  } catch (error) {
    updateState((s) =>
      finishAgent(s, id, "failed", "本步骤未完成，请查看错误提示。"),
    );
    throw error;
  }
}
function saveUnderstanding(
  job: Job,
  result: {
    reply: string;
    orders: Candidate[];
    ruleProposal?: { kind: "packed_only_today" };
  },
  text: string,
) {
  updateState((s) => {
    message(
      s,
      result.reply,
      currentWorkspace() === "simulation" ? "模拟测试" : "Nosana · 内容理解",
    );
    if (result.ruleProposal?.kind === "packed_only_today") {
      if (currentWorkspace() === "simulation" && !s.ruleShipment)
        seedRuleShipment(s);
      proposeShippingRule(s, text);
    }
    if (result.orders.length) {
      const reviewed = reviewCandidates(s, result.orders);
      recordAgent(
        s,
        job.traceMessageId!,
        "orders",
        ["业务数据库"],
        currentWorkspace() === "simulation" ? "simulation" : "local",
        `已排除 ${reviewed.duplicates.length} 笔重复订单。`,
      );
      if (reviewed.accepted.length)
        s.drafts.push({
          id: job.id,
          candidates: reviewed.accepted,
          source:
            currentWorkspace() === "simulation"
              ? job.kind === "adapter"
                ? "CodeAF + Daytona（模拟）"
                : "Nosana（模拟）"
              : "Nosana",
          text,
          status: "pending",
        });
    }
  });
}
async function processSimulationJob(job: Job) {
  if (job.kind === "simulation") {
    const result = await runSimulation((agent, platforms, summary, work) =>
      invokeAgent(job, agent, platforms, "simulation", summary, work),
    );
    updateState((s) => {
      // Only this dedicated simulation database is replaced. Conversation and job history stay.
      for (const key of [
        "demo",
        "stockKg",
        "forecastKg",
        "orders",
        "tasks",
        "workers",
        "events",
        "drafts",
        "sources",
      ] as const) {
        Object.assign(s, { [key]: result.state[key] });
      }
      const reply = s.messages.find((m) => m.id === job.traceMessageId)!;
      reply.checks = result.checks;
      reply.text = `模拟测试完成：${result.checks.filter((c) => c.passed).length} / ${result.checks.length} 项通过。未调用外部 API。`;
      reply.tag = "模拟测试";
    });
  } else if (job.kind === "intake") {
    const result = await invokeAgent(
      job,
      "reception",
      ["Nosana"],
      "simulation",
      "使用固定样例回复，不进行真实图片或语音识别。",
      () =>
        simulateUnderstanding(
          job.input.text || "",
          job.input.locale === "en" ? "en" : "ja",
          !!job.input.attachmentId,
        ),
    );
    saveUnderstanding(job, result, job.input.text || "");
  } else if (job.kind === "adapter") {
    const orders = await invokeAgent(
      job,
      "adapter",
      ["CodeAF", "Daytona"],
      "simulation",
      "用固定样例适配器转换 CSV，并验证列名、数量和日期。",
      () => parseSampleCsv(job.input.csv),
    );
    saveUnderstanding(
      job,
      {
        reply:
          job.input.locale === "en"
            ? "Sample CSV converted locally. Review the results before importing."
            : "サンプル CSV をローカルで変換しました。内容を確認してから取り込んでください。",
        orders,
      },
      job.input.csv,
    );
  } else if (job.kind === "plan") {
    await invokeAgent(
      job,
      "production",
      ["Daytona", "业务数据库"],
      "simulation",
      "检查库存与前置任务，生成作业邀请。",
      () => updateState((s) => plan(s)),
    );
    const rows = await invokeAgent(
      job,
      "delivery",
      ["Daytona"],
      "simulation",
      "在本机运行相同的 Python 排程程序，检查工时冲突。",
      () => simulateSchedule(readState()),
    );
    updateState((s) => {
      for (const row of rows) {
        const task = s.tasks.find((t) => t.id === row.id)!;
        if (row.feasible && task.status !== "accepted") {
          task.workerId = row.workerId;
          task.status = "offered";
        }
      }
      message(
        s,
        `模拟排程检查了 ${rows.length} 项作业，发现 ${rows.filter((r) => !r.feasible).length} 项时限冲突。`,
        "模拟测试",
      );
    });
  } else if (job.kind === "research") {
    await invokeAgent(
      job,
      "reception",
      ["Tavily"],
      "simulation",
      "读取模拟天气公告，不访问真实网站。",
      () =>
        updateState((s) => {
          s.sources = [
            {
              title: "模拟天气公告",
              url: "/demo/scenario.json",
              content:
                "これはテスト用の架空の公告です。午後に雨を想定し、屋外の収穫より先に梱包作業を確認します。",
            },
          ];
          s.researchAt = now();
          message(s, "已读取模拟公告，未更改真实配送承诺。", "模拟测试");
        }),
    );
  }
}

function stage(jobId: string, text: string) {
  updateState((s) => {
    const j = s.jobs.find((j) => j.id === jobId)!;
    j.stage = text;
    j.updatedAt = now();
  });
}
async function processJob(job: Job) {
  if (job.kind === "simulation") {
    if (currentWorkspace() !== "simulation")
      throw new Error("请在模拟工作区运行测试。");
    return processSimulationJob(job);
  }
  // Data source and execution mode are independent. Older persisted sample jobs
  // remain offline; every newly submitted job snapshots its explicit mode.
  const execution =
    job.execution ?? (currentWorkspace() === "simulation" ? "offline" : "live");
  if (execution === "offline") {
    if (currentWorkspace() !== "simulation")
      throw new Error("离线验证仅支持样例数据。");
    updateState((s) =>
      recordAgent(
        s,
        job.traceMessageId!,
        "coordinator",
        [],
        "local",
        "离线验证使用固定样例规则，不调用模型。",
      ),
    );
    return processSimulationJob(job);
  }
  stage(job.id, "总智能体正在规划与分派任务");
  return runCoordinator(job);
}
export async function tick() {
  const job = updateState((s) => {
    s.workerHeartbeat = now();
    monitor(s);
    for (const j of s.jobs)
      if (j.status === "running" && (j.leaseUntil ?? 0) < Date.now()) {
        j.status = "failed";
        j.error =
          "后台处理已中断。请检查任务结果后手动重试，避免重复消耗额度。";
        j.updatedAt = now();
        const trace = s.messages.find((m) => m.id === j.traceMessageId);
        if (trace) {
          trace.text = "智能体处理未完成。";
          trace.original = false;
          for (const assignment of trace.coordination?.assignments || [])
            if (
              assignment.status === "running" ||
              assignment.status === "queued"
            )
              assignment.status = "failed";
          for (const run of trace.agents || [])
            if (run.status === "running")
              finishAgent(s, run.id, "failed", j.error);
        }
      }
    const next = s.jobs.find((j) => j.status === "queued");
    if (!next) return;
    next.status = "running";
    if (!next.traceMessageId) next.traceMessageId = traceMessage(s).id;
    next.leaseUntil = Date.now() + 30000;
    next.updatedAt = now();
    return structuredClone(next);
  });
  if (!job) return;
  const timer = setInterval(
    () =>
      updateState((s) => {
        s.workerHeartbeat = now();
        monitor(s);
        const j = s.jobs.find((j) => j.id === job.id);
        if (j?.status === "running") j.leaseUntil = Date.now() + 30000;
      }),
    5000,
  );
  try {
    await processJob(job);
    updateState((s) => {
      const j = s.jobs.find((j) => j.id === job.id)!;
      j.status = "done";
      j.stage = "处理完成";
      j.updatedAt = now();
      const trace = s.messages.find((m) => m.id === j.traceMessageId);
      if (trace && !trace.checks && trace.tag !== "Mikan · BOT")
        trace.text = "智能体处理完成。";
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "处理失败";
    // SDK error strings may contain URLs, authorization headers or response bodies.
    const safe =
      /(API_KEY|BASE_URL|MODEL|SNAPSHOT|^模拟|^请先|^AI 对话尚未|^图片识别尚未|^语音识别尚未|^Nosana|^Tavily|^模型|^CodeAF|^Daytona|^排程|^附件|^独立|^后台|^无法准备)/.test(
        raw,
      ) && !/(Bearer |https?:\/\/|sk-)/.test(raw)
        ? raw
        : "后台服务处理失败。请检查依赖安装、网络、密钥与部署配置后重试。";
    updateState((s) => {
      const j = s.jobs.find((j) => j.id === job.id)!;
      j.status = "failed";
      j.error = safe;
      j.stage = "需要处理";
      j.updatedAt = now();
      message(s, safe, "任务未完成");
      const trace = s.messages.find((m) => m.id === j.traceMessageId);
      if (trace) {
        trace.text = "智能体处理未完成。";
        trace.original = false;
      }
    });
  } finally {
    clearInterval(timer);
  }
}
export async function tickAll() {
  await withWorkspace("live", tick);
  await withWorkspace("simulation", tick);
}
