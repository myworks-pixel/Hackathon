import "server-only";

import { parseServerEnv, requireApiKey, type ApiKeyName } from "./schema";

export const serverEnv = parseServerEnv(process.env);

export function getApiKey(key: ApiKeyName): string {
  return requireApiKey(serverEnv, key);
}
