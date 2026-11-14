import { loadEnvFile } from "node:process";
import { createJiti } from "jiti";
try {
  loadEnvFile(".env.local");
} catch {
  /* Environment can be injected by a process supervisor. */
}
const { tickAll } = await createJiti(import.meta.url).import(
  "../src/lib/farm/worker.ts",
);
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
console.log(
  "Farm worker is running. Watching persisted jobs and overdue tasks.",
);
while (!stopping) {
  try {
    await tickAll();
  } catch {
    console.error("Worker database cycle failed; retrying in 2 seconds.");
  }
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, 2000));
}
