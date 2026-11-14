import "server-only";

import { ChatOpenAI } from "@langchain/openai";

import { getApiKey, serverEnv } from "@/lib/env/server";
import { disableExternalTracing } from "../../../scripts/partner-config.mjs";

/** Create a model lazily so importing this module never requires a key. */
export function createChatModel() {
  disableExternalTracing();
  if (!serverEnv.NOSANA_MODEL) {
    throw new Error("请先在 .env.local 中配置 NOSANA_MODEL，再调用模型。");
  }

  return new ChatOpenAI({
    model: serverEnv.NOSANA_MODEL,
    apiKey: getApiKey("NOSANA_API_KEY"),
    timeout: 30_000,
    maxRetries: 2,
    // ChatOpenAI is the wire-protocol adapter; all traffic goes to Nosana.
    configuration: {
      baseURL: serverEnv.NOSANA_BASE_URL,
      fetch: (url, init) => {
        const target = new URL(
          typeof url === "string"
            ? url
            : url instanceof URL
              ? url.href
              : url.url,
        );
        if (target.origin !== new URL(serverEnv.NOSANA_BASE_URL).origin) {
          throw new Error("模型请求必须使用 Nosana 服务。");
        }
        return fetch(url, { ...init, redirect: "error" });
      },
    },
    useResponsesApi: false,
  });
}
