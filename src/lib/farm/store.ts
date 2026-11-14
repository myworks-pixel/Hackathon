import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { initialState } from "./domain";
import type { FarmState } from "./types";
import { AsyncLocalStorage } from "node:async_hooks";

export type Workspace = "live" | "simulation";
const context = new AsyncLocalStorage<Workspace>();
export const currentWorkspace = () => context.getStore() || "live";
export const withWorkspace = <T>(workspace: Workspace, fn: () => T): T =>
  context.run(workspace, fn);
export function requestWorkspace(request?: Request): Workspace {
  const value =
    request?.headers.get("x-farm-workspace") ||
    (request ? new URL(request.url).searchParams.get("workspace") : null);
  if (value && value !== "live" && value !== "simulation")
    throw new Error("工作区无效。");
  return value === "simulation" ? "simulation" : "live";
}

export const dataDir = resolve(
  process.env.FARM_DATA_DIR || join(process.cwd(), ".data"),
);
export const workspaceDataDir = () =>
  currentWorkspace() === "simulation" ? join(dataDir, "simulation") : dataDir;
const connections = new Map<Workspace, DatabaseSync>();
function db() {
  const workspace = currentWorkspace();
  let connection = connections.get(workspace);
  if (!connection) {
    mkdirSync(workspaceDataDir(), { recursive: true });
    connection = new DatabaseSync(join(workspaceDataDir(), "farm.sqlite"));
    connection.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)",
    );
    connection
      .prepare("INSERT OR IGNORE INTO state (id,body) VALUES(1,?)")
      .run(
        JSON.stringify({ ...initialState(), demo: workspace === "simulation" }),
      );
    connections.set(workspace, connection);
  }
  return connection;
}
export function readState(): FarmState {
  const row = db().prepare("SELECT body FROM state WHERE id=1").get() as {
    body: string;
  };
  return JSON.parse(row.body);
}
// A transaction spans read, validation and write: two requests cannot reserve the same stock.
export function updateState<T>(fn: (state: FarmState) => T): T {
  const database = db();
  database.exec("BEGIN IMMEDIATE");
  try {
    const state = readState();
    const result = fn(state);
    state.version++;
    database
      .prepare("UPDATE state SET body=? WHERE id=1")
      .run(JSON.stringify(state));
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
