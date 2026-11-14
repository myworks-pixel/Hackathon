// Loaded only by the background worker. Missing optional SDKs never block the UI.
import { readFile } from "node:fs/promises";
import {
  codeafEnvironment,
  daytonaNetworkPolicy,
  partnerUrl,
} from "./partner-config.mjs";

export function sandboxOptions(codeaf, source = process.env) {
  const strict = daytonaNetworkPolicy(source) === "strict";
  if (!source.DAYTONA_API_KEY?.trim()) {
    throw new Error("请先在 .env.local 配置 DAYTONA_API_KEY，然后重启服务。");
  }
  const common = {
    language: "python",
    autoStopInterval: 5,
    autoDeleteInterval: 10,
  };
  if (!codeaf)
    return { ...common, ...(strict ? { networkBlockAll: true } : {}) };
  if (!source.DAYTONA_CODEAF_SNAPSHOT?.trim()) {
    throw new Error(
      "请先在 .env.local 配置 DAYTONA_CODEAF_SNAPSHOT，然后重启服务。",
    );
  }
  const envVars = codeafEnvironment(source);
  return {
    ...common,
    snapshot: source.DAYTONA_CODEAF_SNAPSHOT.trim(),
    envVars,
    ...(strict
      ? { domainAllowList: new URL(envVars.CODEAF_BASE_URL).hostname }
      : {}),
  };
}

export async function inDaytona(work, { codeaf = false } = {}) {
  const strict = daytonaNetworkPolicy() === "strict";
  const options = sandboxOptions(codeaf);
  const apiUrl = partnerUrl(process.env.DAYTONA_API_URL, "DAYTONA_API_URL");
  const { Daytona } = await import("@daytona/sdk");
  const client = new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
    ...(apiUrl ? { apiUrl } : {}),
    ...(process.env.DAYTONA_TARGET
      ? { target: process.env.DAYTONA_TARGET }
      : {}),
  });
  const sandbox = await client.create(options, { timeout: 90 });
  try {
    // Strict remains the default and never falls back after a denied policy.
    // Explicit platform mode retains Daytona's own tier firewall, which permits
    // more destinations than our custom allowlist. It is not equivalent isolation.
    try {
      if (strict)
        await sandbox.updateNetworkSettings(
          codeaf
            ? { domainAllowList: options.domainAllowList }
            : { networkBlockAll: true },
        );
    } catch {
      throw new Error("Daytona 无法应用网络限制，请检查账户权限和沙箱设置。");
    }
    return await work(sandbox);
  } finally {
    await client.delete(sandbox);
  }
}

export async function calculateSchedule(input) {
  return inDaytona(async (sandbox) => {
    await sandbox.fs.uploadFile(
      Buffer.from(JSON.stringify(input)),
      "/tmp/schedule-input.json",
    );
    await sandbox.fs.uploadFile(
      await readFile(new URL("./scheduler.py", import.meta.url)),
      "/tmp/scheduler.py",
    );
    const result = await sandbox.process.executeCommand(
      "python3 /tmp/scheduler.py",
      undefined,
      undefined,
      60,
    );
    if (result.exitCode !== 0)
      throw new Error("Daytona 排程校验未通过，未应用结果。");
    return JSON.parse(result.result);
  });
}

export async function convertFormat(csv) {
  return inDaytona(
    async (sandbox) => {
      const setup = await sandbox.process.executeCommand(
        "mkdir -p /tmp/farm-import && cd /tmp/farm-import && git init -q",
        undefined,
        undefined,
        30,
      );
      if (setup.exitCode !== 0) throw new Error("无法准备 CodeAF 工作目录。");
      await sandbox.fs.uploadFile(
        Buffer.from(csv),
        "/tmp/farm-import/input.csv",
      );
      await sandbox.fs.uploadFile(
        await readFile(new URL("./run-codeaf.py", import.meta.url)),
        "/tmp/run-codeaf.py",
      );
      // Arguments and the isolated child environment are built without a shell.
      const result = await sandbox.process.executeCommand(
        "python3 /tmp/run-codeaf.py",
        "/tmp/farm-import",
        undefined,
        200,
      );
      if (result.exitCode !== 0)
        throw new Error(
          "CodeAF 未完成转换（可能缺少字段、触及预算或超时），原订单保持不变。",
        );
      const report = JSON.parse(result.result);
      if (report.ok !== true)
        throw new Error("CodeAF 未确认成功，未导入订单。");
      const rows = JSON.parse(
        (
          await sandbox.fs.downloadFile("/tmp/farm-import/output.json")
        ).toString(),
      );
      const source = (
        await sandbox.fs.downloadFile("/tmp/farm-import/transform.py")
      ).toString();
      // Run an independent checker AFTER CodeAF exits. It is not visible to the coding agent.
      await sandbox.fs.uploadFile(
        await readFile(new URL("./verify-import.py", import.meta.url)),
        "/tmp/verify-import.py",
      );
      const checked = await sandbox.process.executeCommand(
        "python3 /tmp/verify-import.py",
        undefined,
        undefined,
        30,
      );
      if (checked.exitCode !== 0)
        throw new Error("独立检查发现记录数量或来源不一致，未导入。");
      return { rows, source };
    },
    { codeaf: true },
  );
}
