// Shared by Next.js and the worker. Never accept a generic model-provider URL.
export const NOSANA_DEFAULT_URL = "https://inference.nosana.com/v1";

export function daytonaNetworkPolicy(source = process.env) {
  const policy = source.DAYTONA_NETWORK_POLICY?.trim() || "strict";
  if (policy !== "strict" && policy !== "platform")
    throw new Error("DAYTONA_NETWORK_POLICY must be strict or platform.");
  return policy;
}

export function disableExternalTracing() {
  // Local LangChain/LangGraph use must not activate a fifth service via shell env.
  process.env.LANGCHAIN_TRACING_V2 = "false";
  process.env.LANGSMITH_TRACING = "false";
  delete process.env.LANGCHAIN_TRACING;
}

export function partnerUrl(value, field) {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    const allowed =
      field === "DAYTONA_API_URL"
        ? url.hostname === "app.daytona.io" ||
          url.hostname.endsWith(".daytona.io")
        : url.hostname === "inference.nosana.com" ||
          url.hostname.endsWith(".node.k8s.prd.nos.ci");
    if (
      allowed &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash
    ) {
      return url.href.replace(/\/+$/, "");
    }
  } catch {
    // Do not echo potentially secret URL components.
  }
  throw new Error(`环境变量 ${field} 必须使用该平台的官方 HTTPS 服务地址。`);
}

export function codeafEnvironment(source) {
  const apiKey = source.NOSANA_API_KEY?.trim();
  const model = source.CODEAF_MODEL?.trim() || source.NOSANA_MODEL?.trim();
  const missing = [
    !apiKey && "NOSANA_API_KEY",
    !model && "NOSANA_MODEL（或 CODEAF_MODEL）",
  ].filter(Boolean);
  if (missing.length)
    throw new Error(
      `请先在 .env.local 配置 ${missing.join("、")}，然后重启服务。`,
    );
  return {
    // This is CodeAF's compatibility variable, carrying a NOSANA key only.
    // The URL and all three model roles are pinned to the same Nosana service.
    OPENAI_API_KEY: apiKey,
    CODEAF_BASE_URL:
      partnerUrl(source.NOSANA_BASE_URL, "NOSANA_BASE_URL") ||
      NOSANA_DEFAULT_URL,
    CODEAF_MODEL: model,
    CODEAF_PLAN_MODEL: model,
    CODEAF_CHECK_MODEL: model,
    CODEAF_NO_UPDATE_CHECK: "1",
    CODEAF_TELEMETRY: "off",
    DO_NOT_TRACK: "1",
  };
}
