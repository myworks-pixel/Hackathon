import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (mode !== "dev" && mode !== "start") {
  console.error("Usage: node scripts/serve.mjs dev|start [Next.js options]");
  process.exit(1);
}

const root = fileURLToPath(new URL("../", import.meta.url));
const commands = [
  [
    fileURLToPath(
      new URL("../node_modules/next/dist/bin/next", import.meta.url),
    ),
    mode,
    "--hostname",
    "127.0.0.1",
    ...process.argv.slice(3),
  ],
  [fileURLToPath(new URL("./worker.mjs", import.meta.url))],
];
const children = commands.map((args) =>
  spawn(process.execPath, args, { cwd: root, stdio: "inherit" }),
);
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  const force = setTimeout(() => {
    for (const child of children)
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
  }, 8000);
  force.unref();
}
for (const [index, child] of children.entries()) {
  child.on("error", () => {
    console.error(
      `${index === 0 ? "Web server" : "Farm worker"} could not start.`,
    );
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(
        `${index === 0 ? "Web server" : "Farm worker"} stopped; closing the application.`,
      );
      stop(code || 1);
    }
  });
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
