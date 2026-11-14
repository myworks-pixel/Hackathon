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
    AI_MODEL: optionalValue(source, "AI_MODEL"),
    AI_BASE_URL: optionalHttpUrl(source, "AI_BASE_URL"),
    OPENAI_API_KEY: optionalValue(source, "OPENAI_API_KEY"),
    ANTHROPIC_API_KEY: optionalValue(source, "ANTHROPIC_API_KEY"),
    GOOGLE_GENERATIVE_AI_API_KEY: optionalValue(
      source,
      "GOOGLE_GENERATIVE_AI_API_KEY",
    ),
    TAVILY_API_KEY: optionalValue(source, "TAVILY_API_KEY"),
    DAYTONA_API_KEY: optionalValue(source, "DAYTONA_API_KEY"),
    DAYTONA_API_URL: optionalHttpUrl(source, "DAYTONA_API_URL"),
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
