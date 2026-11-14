import {
  NOSANA_DEFAULT_URL,
  daytonaNetworkPolicy,
  partnerUrl,
} from "../../../scripts/partner-config.mjs";

type EnvSource = Readonly<Record<string, string | undefined>>;

function optionalValue(source: EnvSource, key: string): string | undefined {
  const value = source[key]?.trim();
  return value || undefined;
}

function optionalHttpUrl(source: EnvSource, key: string): string | undefined {
  const value = optionalValue(source, key);

  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return value;
    }
  } catch {
    // Report the field name only; URLs can contain credentials.
  }

  throw new Error(`环境变量 ${key} 必须是有效的 HTTP 或 HTTPS 地址。`);
}

export function parseClientEnv(source: EnvSource) {
  return {
    NEXT_PUBLIC_APP_URL:
      optionalHttpUrl(source, "NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
  };
}

export function parseServerEnv(source: EnvSource) {
  const nodeEnv = optionalValue(source, "NODE_ENV") ?? "development";

  if (
    nodeEnv !== "development" &&
    nodeEnv !== "production" &&
    nodeEnv !== "test"
  ) {
    throw new Error(
      "环境变量 NODE_ENV 必须是 development、production 或 test。",
    );
  }

  return {
    NODE_ENV: nodeEnv,
    TAVILY_API_KEY: optionalValue(source, "TAVILY_API_KEY"),
    DAYTONA_API_KEY: optionalValue(source, "DAYTONA_API_KEY"),
    DAYTONA_API_URL: partnerUrl(source.DAYTONA_API_URL, "DAYTONA_API_URL"),
    DAYTONA_TARGET: optionalValue(source, "DAYTONA_TARGET"),
    DAYTONA_NETWORK_POLICY: daytonaNetworkPolicy(source),
    DAYTONA_CODEAF_SNAPSHOT: optionalValue(source, "DAYTONA_CODEAF_SNAPSHOT"),
    CODEAF_MODEL: optionalValue(source, "CODEAF_MODEL"),
    NOSANA_API_KEY: optionalValue(source, "NOSANA_API_KEY"),
    NOSANA_BASE_URL:
      partnerUrl(source.NOSANA_BASE_URL, "NOSANA_BASE_URL") ??
      NOSANA_DEFAULT_URL,
    NOSANA_MODEL: optionalValue(source, "NOSANA_MODEL"),
    NOSANA_VISION_BASE_URL: partnerUrl(
      source.NOSANA_VISION_BASE_URL,
      "NOSANA_VISION_BASE_URL",
    ),
    NOSANA_VISION_API_KEY: optionalValue(source, "NOSANA_VISION_API_KEY"),
    NOSANA_VISION_MODEL: optionalValue(source, "NOSANA_VISION_MODEL"),
    NOSANA_ASR_BASE_URL: partnerUrl(
      source.NOSANA_ASR_BASE_URL,
      "NOSANA_ASR_BASE_URL",
    ),
    NOSANA_ASR_API_KEY: optionalValue(source, "NOSANA_ASR_API_KEY"),
    NOSANA_ASR_MODEL: optionalValue(source, "NOSANA_ASR_MODEL"),
  };
}

export type ClientEnv = ReturnType<typeof parseClientEnv>;
export type ServerEnv = ReturnType<typeof parseServerEnv>;
export type ApiKeyName = Extract<keyof ServerEnv, `${string}_API_KEY`>;

export function requireApiKey(environment: ServerEnv, key: ApiKeyName): string {
  const value = environment[key];

  if (!value) {
    throw new Error(`请先在 .env.local 中配置 ${key}，再使用对应服务。`);
  }

  return value;
}
