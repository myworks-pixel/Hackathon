import { parseClientEnv } from "./schema";

// Keep public variables explicit so Next.js can inline them in client bundles.
export const clientEnv = parseClientEnv({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
