import type { CreateSandboxFromSnapshotParams } from "@daytona/sdk";
export function sandboxOptions(
  codeaf: boolean,
  source?: Readonly<Record<string, string | undefined>>,
): CreateSandboxFromSnapshotParams;
export function calculateSchedule(input: unknown): Promise<unknown>;
export function convertFormat(
  csv: string,
): Promise<{ rows: unknown; source: string }>;
