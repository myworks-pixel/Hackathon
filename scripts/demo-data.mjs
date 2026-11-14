import { mkdirSync, writeFileSync } from "node:fs";
import { createJiti } from "jiti";

// Reproducible local fixtures. This command never loads .env or invokes providers.
const jiti = createJiti(import.meta.url);
const { createScenario, sampleOrder, sampleCsv, runSimulation } =
  await jiti.import("../src/lib/farm/simulation.ts");
const { proposeShippingRule, seedRuleShipment } = await jiti.import(
  "../src/lib/farm/rules.ts",
);
const { ruleExamples } = await jiti.import(
  "../src/lib/farm/shipping-policy.ts",
);
const state = createScenario();
seedRuleShipment(state);
proposeShippingRule(state, "今日は梱包済みの箱だけ発送してください。");
mkdirSync("public/demo", { recursive: true });
mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "public/demo/scenario.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      simulation: true,
      notice: "架空の農場・注文・天候データです。実際の配送は行いません。",
      weather:
        "午後に雨を想定するテスト用データです。実際の予報ではありません。",
      stockKg: state.stockKg,
      forecastKg: state.forecastKg,
      orders: state.orders,
      workers: state.workers,
      ruleDraft: state.ruleDraft,
      shipment: state.ruleShipment,
      boundaryExamples: ruleExamples(state.ruleDraft),
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  "public/demo/orders.csv",
  sampleCsv([state.orders.find((order) => order.kg === 40), sampleOrder()]) +
    "\n",
);
writeFileSync(
  "public/demo/farmer-message.txt",
  "今日は梱包済みの箱だけ発送してください。\n\nサンプル注文：みかん 10 kg、5 kg を2箱。箱1は梱包済み、箱2は未梱包。\nお客様の分納同意は未確認です。同日到着の希望も確認してください。\n",
);
const result = await runSimulation();
writeFileSync(
  "artifacts/simulation-report.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      mode: "simulation",
      externalApiCalls: 0,
      checks: result.checks,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Created sample data; ${result.checks.filter((c) => c.passed).length}/${result.checks.length} checks passed; no external APIs used.`,
);
if (result.checks.some((check) => !check.passed)) process.exitCode = 1;
