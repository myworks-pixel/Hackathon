import { createJiti } from "jiti";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.FARM_DATA_DIR = mkdtempSync(join(tmpdir(), "mikan-suite-"));
const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  alias: { "@": new URL("../src", import.meta.url).pathname },
});
await jiti.import("../tests/farm.test.ts");
await jiti.import("../tests/coordinator.test.ts");
