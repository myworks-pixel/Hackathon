export type OrderStatus =
  "review" | "confirmed" | "packed" | "delivered" | "cancelled";
export type TaskKind = "sort" | "pack" | "deliver";
export type TaskStatus = "offered" | "accepted" | "done" | "blocked";
export interface Order {
  id: string;
  customer: string;
  kg: number;
  due: string;
  address: string;
  note: string;
  status: OrderStatus;
  source: string;
  createdAt: string;
}
export interface Worker {
  id: string;
  name: string;
  skills: TaskKind[];
  available: boolean;
}
export interface Task {
  id: string;
  orderId: string;
  kind: TaskKind;
  title: string;
  workerId: string;
  status: TaskStatus;
  due: string;
  dependsOn?: string;
  evidence?: string;
  alerted?: boolean;
  declinedWorkerIds?: string[];
}
export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
  tag?: string;
  agents?: AgentRun[];
  checks?: SimulationCheck[];
  ruleDraftId?: string;
  shipmentId?: string;
  coordination?: CoordinationPlan;
  original?: boolean;
}
export type AgentId =
  | "coordinator"
  | "reception"
  | "orders"
  | "production"
  | "delivery"
  | "supervision"
  | "adapter";
export type SpecialistId = Exclude<AgentId, "coordinator">;
export type ExecutionMode = "live" | "offline";
export interface AgentReceipt {
  id: string;
  tool: string;
  platforms: string[];
  status: "done" | "blocked" | "failed" | "waiting";
  summary: string;
  at: string;
}
export interface CoordinationPlan {
  reason: string;
  assignments: {
    id: string;
    agentId: SpecialistId;
    task: string;
    steps: string[];
    dependsOn: string[];
    status: "queued" | "running" | "done" | "blocked" | "failed" | "waiting";
    question?: string;
    summary?: string;
  }[];
}
export type AgentMode = "simulation" | "live" | "local";
export interface AgentRun {
  id: string;
  agent: AgentId;
  platforms: string[];
  mode: AgentMode;
  status: "running" | "done" | "blocked" | "failed" | "waiting";
  summary: string;
  startedAt: string;
  finishedAt?: string;
  task?: string;
  assignmentId?: string;
  receipts?: AgentReceipt[];
}
export interface SimulationCheck {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
}
export interface Event {
  id: string;
  text: string;
  at: string;
  level: "info" | "warning";
}
export type JobKind = "plan" | "research" | "intake" | "adapter" | "simulation";
export interface Job {
  id: string;
  kind: JobKind;
  status: "queued" | "running" | "done" | "failed";
  input: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  stage: string;
  error?: string;
  leaseUntil?: number;
  traceMessageId?: string;
  execution?: ExecutionMode;
}
export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  path: string;
}
export interface Candidate {
  customer: string;
  kg: number;
  due: string;
  address: string;
  note?: string;
}
export interface Draft {
  id: string;
  candidates: Candidate[];
  source: string;
  text: string;
  status: "pending" | "imported" | "dismissed";
}
export interface Source {
  title: string;
  url: string;
  content: string;
}
export interface FarmState {
  version: number;
  demo: boolean;
  stockKg: number;
  forecastKg: number;
  orders: Order[];
  tasks: Task[];
  workers: Worker[];
  messages: Message[];
  events: Event[];
  jobs: Job[];
  attachments: Attachment[];
  drafts: Draft[];
  sources: Source[];
  researchAt?: string;
  requests: string[];
  workerHeartbeat?: string;
  ruleDraft?: ShippingRule;
  activeRule?: ShippingRule;
  ruleShipment?: BoxShipment;
}
export interface ShippingRule {
  id: string;
  source: string;
  kind: "packed_only_today";
  date: string;
  status: "draft" | "active";
  partial: "customer_consent" | "together";
  confirmedAt?: string;
}
export interface BoxShipment {
  id: string;
  customer: string;
  sameArrival: boolean;
  splitConsent: boolean;
  boxes: { id: string; kg: number; packed: boolean; shippedAt?: string }[];
}
export interface ProviderStatus {
  name: string;
  configured: boolean;
  detail: string;
  missing: string[];
}
export const TASK_NAMES: Record<TaskKind, string> = {
  sort: "采后分选",
  pack: "称重打包",
  deliver: "配送交接",
};
export const ORDER_NAMES: Record<OrderStatus, string> = {
  review: "待确认",
  confirmed: "待打包",
  packed: "待配送",
  delivered: "已送达",
  cancelled: "已取消",
};
export const TASK_STATUS_NAMES: Record<TaskStatus, string> = {
  offered: "待接单",
  accepted: "进行中",
  done: "已完成",
  blocked: "待重新安排",
};
