import { fileURLToPath } from "node:url";
import { Daytona, Image } from "@daytona/sdk";
import { partnerUrl } from "./partner-config.mjs";

const name = "mikan-codeaf-v1";
const dockerfile = fileURLToPath(
  new URL("../infra/daytona/Dockerfile", import.meta.url),
);

// A default invocation is a review, not a billable cloud mutation.
if (!process.argv.includes("--create")) {
  console.log(`Snapshot to create: ${name}`);
  console.log("Region: DAYTONA_TARGET, or the account default");
  console.log("Resources: 1 vCPU / 2 GiB RAM / 5 GiB disk / no GPU");
  console.log("Image: Python 3.12, Git, official CodeAF release");
  console.log("Only the Dockerfile is uploaded; no project files or secrets.");
  console.log(
    "Run with --create to build in Daytona (storage charges may apply).",
  );
} else {
  try {
    if (!process.env.DAYTONA_API_KEY?.trim()) {
      throw new Error("missing-key");
    }
    const client = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: partnerUrl(process.env.DAYTONA_API_URL, "DAYTONA_API_URL"),
      ...(process.env.DAYTONA_TARGET
        ? { target: process.env.DAYTONA_TARGET }
        : {}),
    });
    const result = await client.snapshot.create(
      {
        name,
        image: Image.fromDockerfile(dockerfile),
        resources: { cpu: 1, memory: 2, disk: 5 },
      },
      { timeout: 600 },
    );
    console.log(`Snapshot returned state: ${result.state}`);
    console.log(
      `After confirming it is active, set DAYTONA_CODEAF_SNAPSHOT=${name}`,
    );
    console.log(
      "Runtime networking follows DAYTONA_NETWORK_POLICY (strict by default, platform when explicitly configured).",
    );
  } catch {
    // SDK exceptions can contain Authorization headers. Never dump them.
    console.error(
      "Snapshot creation did not complete. Check network access, key permissions and Daytona's Snapshots page. Existing snapshots were not deleted.",
    );
    process.exitCode = 1;
  }
}
