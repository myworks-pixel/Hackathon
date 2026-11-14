import { stat } from "node:fs/promises";
import { partnerUrl, daytonaNetworkPolicy } from "./partner-config.mjs";

let incomplete = false;
const env = process.env;
const set = (key) => Boolean(env[key]?.trim());
const report = (label, ok, detail) => {
  console.log(`${ok ? "OK" : "TODO"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) incomplete = true;
};

for (const key of ["TAVILY_API_KEY", "DAYTONA_API_KEY", "NOSANA_API_KEY"]) {
  report(key, set(key), "value is never printed");
}
for (const key of [
  "DAYTONA_API_URL",
  "NOSANA_BASE_URL",
  "NOSANA_VISION_BASE_URL",
  "NOSANA_ASR_BASE_URL",
]) {
  if (!set(key)) continue;
  try {
    partnerUrl(env[key], key);
    report(key, true, "allowed partner URL");
  } catch {
    report(key, false, "invalid or non-partner URL");
  }
}
report(
  "Text inference",
  set("NOSANA_MODEL"),
  "requires a currently served model",
);
report(
  "CodeAF runtime",
  set("DAYTONA_CODEAF_SNAPSHOT") &&
    (set("CODEAF_MODEL") || set("NOSANA_MODEL")),
  "requires a built snapshot and a tool-calling model",
);
for (const kind of ["VISION", "ASR"]) {
  report(
    kind,
    ["BASE_URL", "API_KEY", "MODEL"].every((part) =>
      set(`NOSANA_${kind}_${part}`),
    ),
    "requires a running deployment, not just an account API key",
  );
}
try {
  const info = await stat(new URL("../.env.local", import.meta.url));
  report("Local key file permissions", (info.mode & 0o077) === 0);
} catch {
  report("Local key file", false, ".env.local missing");
}

console.log(
  "Local configuration check only: no network requests or cloud resources created.",
);
try {
  const policy = daytonaNetworkPolicy(env);
  console.log(
    policy === "strict"
      ? "Daytona policy: strict; custom network-policy permissions must be verified separately."
      : "Daytona policy: platform; uses the tier firewall, not a four-platform-only network allowlist.",
  );
} catch {
  report("Daytona network policy", false, "must be strict or platform");
}
if (incomplete) process.exitCode = 2;
