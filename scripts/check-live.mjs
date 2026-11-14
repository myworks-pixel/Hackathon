import { loadEnvFile } from "node:process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createJiti } from "jiti";
import { z } from "zod";
import { partnerUrl } from "./partner-config.mjs";

try {
  loadEnvFile(".env.local");
} catch {
  // A process manager may supply environment variables instead.
}
const jiti = createJiti(import.meta.url);
const { nosanaAgentModel, runToolAgent } = await jiti.import(
  "../src/lib/farm/agent-runtime.ts",
);
const { transcribe } = await jiti.import("../src/lib/farm/providers.ts");
const checks = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    checks.push({ name, status: "pass", detail });
    console.log(`PASS ${name}: ${detail}`);
  } catch (error) {
    // Never print SDK errors, request headers, credentials, or raw responses.
    const code = error?.cause?.code;
    const message = /^CHECK: /.test(error?.message || "")
      ? error.message.slice(7)
      : code === "ENOTFOUND"
        ? "DNS lookup failed in this process."
        : "Request failed. Check network, permissions, deployment and credits.";
    checks.push({ name, status: "fail", detail: message });
    console.log(`FAIL ${name}: ${message}`);
  }
}
function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`CHECK: ${name} is missing.`);
  return value;
}
async function json(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`CHECK: HTTP ${response.status}.`);
  return response.json();
}

await check("Nosana online model", async () => {
  const base = partnerUrl(required("NOSANA_BASE_URL"), "NOSANA_BASE_URL");
  const result = await json(`${base}/models`, {
    headers: { Authorization: `Bearer ${required("NOSANA_API_KEY")}` },
  });
  const configured = required("NOSANA_MODEL");
  if (!result.data?.some((m) => m.id === configured && m.available !== false))
    throw new Error("CHECK: Configured model is not currently listed online.");
  return `The configured model is listed online (${configured}).`;
});
await check("Tavily credentials", async () => {
  await json("https://api.tavily.com/usage", {
    headers: { Authorization: `Bearer ${required("TAVILY_API_KEY")}` },
  });
  return "Authenticated usage endpoint returned HTTP 200.";
});
await check("Daytona and CodeAF snapshot", async () => {
  const { Daytona } = await import("@daytona/sdk");
  const client = new Daytona({
    apiKey: required("DAYTONA_API_KEY"),
    apiUrl: partnerUrl(required("DAYTONA_API_URL"), "DAYTONA_API_URL"),
  });
  const snapshot = await client.snapshot.get(
    required("DAYTONA_CODEAF_SNAPSHOT"),
  );
  if (String(snapshot.state).toLowerCase() !== "active")
    throw new Error("CHECK: CodeAF snapshot is not active.");
  return "Configured CodeAF snapshot exists and is active; execution is not yet verified.";
});

if (process.argv.includes("--infer")) {
  await check("Nosana real tool-call round trip", async () => {
    const nonce = randomUUID();
    let executed = false;
    const result = await runToolAgent({
      model: nosanaAgentModel,
      system:
        "Call verify_input with the exact nonce in the request, then say 接続確認に成功しました. This is a harmless integration check.",
      messages: [{ role: "user", content: nonce }],
      forceFirstTool: "verify_input",
      maxRounds: 2,
      tools: {
        verify_input: {
          description: "Verify the input nonce and return a receipt.",
          schema: z.object({ nonce: z.string() }).strict(),
          platforms: [],
          execute: async (value) => {
            if (value.nonce !== nonce)
              throw new Error("CHECK: Model did not preserve the input.");
            executed = true;
            return { status: "done", summary: "Input verified." };
          },
        },
      },
    });
    if (!executed || result.receipts.some((r) => r.status !== "done"))
      throw new Error(
        "CHECK: Model did not complete the function-tool round trip.",
      );
    return "Real model called the tool, read its receipt and returned a final answer.";
  });
}

const audioIndex = process.argv.indexOf("--audio");
if (audioIndex !== -1) {
  await check("Nosana real audio transcription", async () => {
    const path = resolve(process.argv[audioIndex + 1] || "");
    const data = await readFile(path);
    if (!data.length || data.length > 12 * 1024 * 1024)
      throw new Error("CHECK: Provide a nonempty audio file under 12 MB.");
    const text = await transcribe({
      id: "connection-check",
      name: "connection-check.wav",
      mime: "audio/wav",
      path,
      size: data.length,
    });
    if (!text.trim()) throw new Error("CHECK: Transcription was empty.");
    return `Transcribed ${text.length} characters; transcript is not logged.`;
  });
}

const report = {
  checkedAt: new Date().toISOString(),
  mode: "live",
  checks,
  notChecked: [
    "Image OCR accuracy",
    "Daytona scheduling execution and network-policy enforcement",
    "CodeAF converter execution",
    ...(audioIndex === -1
      ? ["Audio transcription (supply --audio file.wav)"]
      : []),
    ...(!process.argv.includes("--infer")
      ? ["Model function calling (supply --infer)"]
      : []),
  ],
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/live-connection-check.json",
  JSON.stringify(report, null, 2),
);
console.log(
  "Saved artifacts/live-connection-check.json. No farm records were changed.",
);
if (checks.some((c) => c.status === "fail")) process.exitCode = 2;
