"use client";
import Link from "next/link";
import { AgentActivity, AgentAvatar } from "./agent-activity";
import { AgentCatalog } from "./agent-catalog";
import { ShippingRuleCard, RuleShipmentCard } from "./shipping-rule-card";
import { localizeUI, translate, type Locale } from "@/lib/i18n/core";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type ComponentProps,
  type CSSProperties,
} from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  AudioLines,
  Bot,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  CloudSun,
  FileSpreadsheet,
  FlaskConical,
  Leaf,
  LoaderCircle,
  MessageCircle,
  Mic,
  Package,
  Paperclip,
  Plus,
  Radio,
  Settings2,
  Sparkles,
  Sprout,
  Square,
  Tractor,
  Truck,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Message, MessageContent } from "@/components/ui/message";
import { Alert } from "@/components/ui/alert";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Empty as EmptyState,
  EmptyHeader,
  EmptyMedia,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { FarmState, ProviderStatus, Task } from "@/lib/farm/types";
import { ORDER_NAMES, TASK_STATUS_NAMES } from "@/lib/farm/types";

type Snapshot = {
  state: FarmState;
  availableKg: number;
  providers: ProviderStatus[];
};
export type FarmView =
  "home" | "assistant" | "agents" | "orders" | "tasks" | "connections";
type Tab = FarmView;
const viewPaths: Record<Tab, string> = {
  home: "/",
  assistant: "/assistant",
  agents: "/agents",
  orders: "/orders",
  tasks: "/tasks",
  connections: "/connections",
};
type Modal =
  | "order"
  | "stock"
  | "csv"
  | "help"
  | { task: Task }
  | { orderId: string }
  | { cancelId: string; customer: string }
  | null;
const labels = {
  assistant: "AI アシスタント",
  agents: "Agent 一览",
  home: "农场工作台",
  orders: "订单与库存",
  tasks: "作业与配送",
  connections: "连接与设置",
};
const date = (s: string) =>
  new Date(s).toLocaleString("zh-CN", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const time = (s: string) =>
  new Date(s).toLocaleTimeString("zh-CN", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const field = (form: FormData, key: string) => String(form.get(key) || "");
const defaultDeadline = () =>
  new Date(Date.now() + 24 * 3600000 + 9 * 3600000).toISOString().slice(0, 16);

function FarmButton({
  className = "",
  ...props
}: ComponentProps<typeof Button>) {
  const variant =
    className.includes("primary") || className.includes("send-button")
      ? "default"
      : className.includes("secondary")
        ? "outline"
        : "ghost";
  return <Button variant={variant} className={className} {...props} />;
}
function Popup({
  locale,
  title,
  children,
  onClose,
}: {
  title: string;
  locale: Locale;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="farm-dialog" showCloseButton={false}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3"
          onClick={onClose}
          aria-label={locale === "ja" ? "閉じる" : "Close"}
        >
          <X size={18} />
        </Button>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            {translate("查看和确认农场工作信息", locale)}
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <EmptyState className="empty-state">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Sprout size={30} />
        </EmptyMedia>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </EmptyState>
  );
}

export function FarmApp({
  initialData = null,
  initialTab = "home",
  initialLocale = "ja",
  workspace = "live",
}: {
  initialData?: Snapshot | null;
  initialTab?: Tab;
  initialLocale?: Locale;
  workspace?: "live" | "simulation";
}) {
  const [data, setData] = useState<Snapshot | null>(initialData),
    [modal, setModal] = useState<Modal>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [input, setInput] = useState("");
  const tab = initialTab;
  const simulation = workspace === "simulation";
  const [execution, setExecution] = useState<"live" | "offline">("live");
  const chatView = tab === "assistant";
  const agentsView = tab === "agents";
  const viewPath = (view: Tab) =>
    viewPaths[view] + (simulation ? "?workspace=simulation" : "");
  const setTab = (view: Tab) => {
    window.location.assign(viewPath(view));
  };
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const changeLocale = (value: string) => {
    const next = value === "en" ? "en" : "ja";
    setLocale(next);
    try {
      localStorage.setItem("mikan.locale", next);
    } catch {}
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem("mikan.locale");
        if (saved === "ja" || saved === "en") setLocale(saved);
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title =
      locale === "ja"
        ? "Mikan · 農繁期の業務アシスタント"
        : "Mikan · Farm operations assistant";
  }, [locale]);
  const [clock, setClock] = useState(() => Date.now());
  const [formDeadline] = useState(defaultDeadline);
  const [attachment, setAttachment] = useState<{
      id: string;
      name: string;
    } | null>(null),
    [recording, setRecording] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null),
    chatEnd = useRef<HTMLDivElement>(null),
    recorder = useRef<MediaRecorder | null>(null),
    recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/farm?workspace=${workspace}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error();
      setData(await r.json());
      setClock(Date.now());
    } catch {
      setError("暂时无法读取农场数据，请检查本地服务是否正在运行。");
    }
  }, [workspace]);
  useEffect(() => {
    const firstPoll = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      clearTimeout(firstPoll);
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [data?.state.messages.length]);
  useEffect(
    () => () => {
      if (recordTimer.current) clearTimeout(recordTimer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function action(payload: unknown, close = false, target = workspace) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/farm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          "X-App-Locale": locale,
          "X-Farm-Workspace": target,
          "X-Farm-Execution": execution,
        },
        body: JSON.stringify(payload),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      if (target !== workspace) {
        const targetPath = `${viewPaths.assistant}?workspace=${target}`;
        // A data-source change must discard in-flight polling, uploads and forms.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(targetPath);
        return true;
      }
      await refresh();
      if (close) setModal(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作未完成，请重试。");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      if (file.size > 12 * 1024 * 1024) throw new Error("附件不能超过 12 MB。");
      const form = new FormData();
      form.set("file", file);
      const r = await fetch("/api/upload", {
        method: "POST",
        headers: { "X-Farm-Workspace": workspace },
        body: form,
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setAttachment(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "附件上传失败。");
    } finally {
      setBusy(false);
    }
  }
  async function record() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error("此浏览器不支持录音，请上传音频文件。");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const r = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = r;
      const chunks: BlobPart[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        if (recordTimer.current) clearTimeout(recordTimer.current);
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const type = r.mimeType.split(";")[0];
        void upload(
          new File(
            chunks,
            `mikan-recording.${type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm"}`,
            { type },
          ),
        );
      };
      r.start();
      setRecording(true);
      recordTimer.current = setTimeout(() => r.stop(), 60000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法访问麦克风，请检查权限。");
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() && !attachment) return;
    const ok = await action({
      type: "chat",
      text: input.trim(),
      ...(attachment ? { attachmentId: attachment.id } : {}),
    });
    if (ok) {
      setInput("");
      setAttachment(null);
    }
  }
  async function submitForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (modal === "order")
      await action(
        {
          type: "order",
          order: {
            customer: field(f, "customer"),
            kg: Number(f.get("kg")),
            address: field(f, "address"),
            due: new Date(`${field(f, "due")}:00+09:00`).toISOString(),
            note: field(f, "note"),
          },
        },
        true,
      );
    else if (modal === "stock")
      await action(
        {
          type: "stock",
          kg: Number(f.get("kg")),
          forecast: f.get("kind") === "forecast",
        },
        true,
      );
    else if (modal === "csv")
      await action(
        { type: "job", kind: "adapter", csv: field(f, "csv") },
        true,
      );
    else if (modal && typeof modal === "object" && "task" in modal)
      await action(
        {
          type: "task",
          id: modal.task.id,
          action: "complete",
          evidence: field(f, "evidence"),
          deliveryConfirmed: f.get("deliveryConfirmed") === "on",
        },
        true,
      );
    else if (modal && typeof modal === "object" && "orderId" in modal)
      await action(
        {
          type: "reschedule",
          id: modal.orderId,
          due: new Date(`${field(f, "due")}:00+09:00`).toISOString(),
        },
        true,
      );
    else if (modal && typeof modal === "object" && "cancelId" in modal)
      await action({ type: "cancel", id: modal.cancelId }, true);
  }
  if (!data)
    return localizeUI(
      <main className="boot">
        <div className="brand-mark">
          <Leaf />
        </div>
        <h1>Mikan</h1>
        <p>{error || "正在打开农场工作台…"}</p>
        {error && (
          <FarmButton onClick={() => void refresh()}>重新连接</FarmButton>
        )}
      </main>,
      locale,
    );
  const s = data.state,
    pending = s.orders.filter((o) => o.status === "review"),
    openTasks = s.tasks.filter((t) => t.status !== "done"),
    late = openTasks.filter((t) => t.alerted);
  const activeJobs = s.jobs.filter(
    (j) => j.status === "queued" || j.status === "running",
  );
  const workerOnline =
    !!s.workerHeartbeat && clock - Date.parse(s.workerHeartbeat) < 20000;
  const drafts = s.drafts.filter((d) => d.status === "pending");
  const modalTitle =
    modal === "order"
      ? "记录一笔新订单"
      : modal === "stock"
        ? "更新采收与库存"
        : modal === "csv"
          ? "让助手学会新的订单表"
          : modal === "help"
            ? "从田间到客户，连成一条线"
            : modal && "task" in modal
              ? `完成：${modal.task.title}`
              : modal && typeof modal === "object" && "cancelId" in modal
                ? "取消订单"
                : "调整交付时间";
  return localizeUI(
    <SidebarProvider
      key={tab}
      className="farm-shell"
      style={{ "--sidebar-width": "248px" } as CSSProperties}
    >
      <Sidebar className="farm-sidebar">
        <SidebarHeader>
          <Link className="brand" href="/" aria-label="Mikan 首页">
            <span className="brand-mark">
              <Leaf size={24} />
            </span>
            <span>Mikan</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>农场管理</SidebarGroupLabel>
            <SidebarMenu>
              {(
                [
                  ["home", ClipboardList],
                  ["assistant", MessageCircle],
                  ["agents", Bot],
                  ["orders", Package],
                  ["tasks", ClipboardList],
                  ["connections", Settings2],
                ] as const
              ).map(([key, Icon]) => (
                <SidebarMenuItem key={key}>
                  <SidebarMenuButton
                    asChild
                    isActive={tab === key}
                    className={tab === key ? "active" : ""}
                  >
                    <Link href={viewPath(key)}>
                      <Icon size={19} />
                      {labels[key]}
                      {key === "tasks" && openTasks.length > 0 && (
                        <Badge className="nav-count">{openTasks.length}</Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <FarmButton className="help-button" onClick={() => setModal("help")}>
            <CircleHelp size={18} />
            使用指南
          </FarmButton>
          <div className="profile">
            <span>农</span>
            <div>
              <b>农场经营者</b>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <SidebarTrigger aria-label="展开或收起导航" />
            <span>工作空间</span>
            <ChevronRight size={14} />
            <b>{labels[tab]}</b>
          </div>
          <div>
            <NativeSelect
              className="language-select"
              aria-label={locale === "ja" ? "表示言語" : "Display language"}
              value={locale}
              onChange={(e) => changeLocale(e.target.value)}
            >
              <NativeSelectOption value="ja">日本語</NativeSelectOption>
              <NativeSelectOption value="en">English</NativeSelectOption>
            </NativeSelect>
          </div>
        </header>
        <main className="workspace">
          {error && (
            <Alert variant="destructive" className="error-banner">
              <span>{error}</span>
              <FarmButton onClick={() => setError("")} aria-label="关闭错误">
                <X size={17} />
              </FarmButton>
            </Alert>
          )}
          <div className="page-title">
            <div>
              <h1>{labels[tab]}</h1>
            </div>
            <div className="title-actions">
              {!agentsView && s.demo && (
                <Badge className="demo-label">示例数据</Badge>
              )}
              {simulation && (
                <FarmButton asChild className="text-button">
                  <Link href={viewPaths[tab]}>返回实际数据</Link>
                </FarmButton>
              )}
              {!agentsView && (
                <FarmButton
                  className="primary"
                  disabled={busy}
                  onClick={() => setModal("order")}
                >
                  <Plus size={17} />
                  记录订单
                </FarmButton>
              )}
            </div>
          </div>
          {!chatView && !agentsView && (
            <section className="stats" aria-label="农场概况">
              {[
                {
                  label: "待处理订单",
                  value: pending.length,
                  unit: "笔",
                  Icon: Package,
                },
                {
                  label: "实际可用库存",
                  value: data.availableKg,
                  unit: "kg",
                  detail: `实际 ${s.stockKg} kg · 预计采收 ${s.forecastKg} kg`,
                  Icon: Sprout,
                },
                {
                  label: "进行中的作业",
                  value: openTasks.length,
                  unit: "项",
                  Icon: Tractor,
                },
                {
                  label: "需要你留意",
                  value: late.length,
                  unit: "项",
                  Icon: Clock3,
                },
              ].map(({ label, value, unit, detail, Icon }, i) => (
                <Card key={label} className={`stat-card stat-${i}`}>
                  <div className="stat-head">
                    <span>{label}</span>
                    <Icon size={19} />
                  </div>
                  <div className="stat-number">
                    {value}
                    <small>{unit}</small>
                  </div>
                  {detail && <p>{detail}</p>}
                </Card>
              ))}
            </section>
          )}
          {agentsView && <AgentCatalog locale={locale} />}
          {chatView && (
            <div className="assistant-page">
              <Card className="panel chat-panel">
                <div className="panel-heading">
                  <div className="heading-title">
                    <AgentAvatar agent="coordinator" locale={locale} />
                    <div>
                      <h2>你的农忙助手</h2>
                    </div>
                  </div>
                  <div className="assistant-controls">
                    {simulation && (
                      <NativeSelect
                        aria-label={
                          locale === "ja" ? "実行モード" : "Execution mode"
                        }
                        value={execution}
                        disabled={busy || activeJobs.length > 0}
                        onChange={(e) =>
                          setExecution(
                            e.target.value === "offline" ? "offline" : "live",
                          )
                        }
                      >
                        <NativeSelectOption value="live">
                          {locale === "ja" ? "実 API を使用" : "Use live APIs"}
                        </NativeSelectOption>
                        <NativeSelectOption value="offline">
                          {locale === "ja"
                            ? "オフライン検証"
                            : "Offline verification"}
                        </NativeSelectOption>
                      </NativeSelect>
                    )}
                  </div>
                </div>
                <div className="chat-feed" aria-live="polite">
                  {s.messages.slice(-40).map((m) => (
                    <Message key={m.id} className={`chat-message ${m.role}`}>
                      {m.role === "assistant" && (
                        <span className="bubble-avatar">
                          <Leaf size={16} />
                        </span>
                      )}
                      <MessageContent className="bubble-wrap">
                        <div className="bubble-meta">
                          {m.role === "assistant" ? "Mikan" : "我"}
                          <span>{time(m.at)}</span>
                        </div>
                        <div className="bubble">
                          {m.tag && (
                            <Badge className="message-tag">{m.tag}</Badge>
                          )}
                          <p
                            data-original={
                              m.role === "user" ||
                              m.tag === "Nosana · 内容理解" ||
                              m.original
                            }
                          >
                            {m.text}
                          </p>
                          {!!m.agents?.length && (
                            <AgentActivity
                              runs={m.agents}
                              checks={m.checks}
                              plan={m.coordination}
                              locale={locale}
                            />
                          )}
                          {m.ruleDraftId &&
                            s.ruleDraft?.id === m.ruleDraftId && (
                              <ShippingRuleCard
                                key={s.ruleDraft.id}
                                rule={s.ruleDraft}
                                locale={locale}
                                busy={busy}
                                action={action}
                              />
                            )}
                          {simulation &&
                            m.shipmentId &&
                            s.ruleShipment?.id === m.shipmentId &&
                            s.activeRule &&
                            s.messages
                              .filter(
                                (message) =>
                                  message.shipmentId === m.shipmentId,
                              )
                              .at(-1)?.id === m.id && (
                              <RuleShipmentCard
                                rule={s.activeRule}
                                shipment={s.ruleShipment}
                                locale={locale}
                                busy={busy}
                                action={action}
                              />
                            )}
                        </div>
                      </MessageContent>
                    </Message>
                  ))}
                  {drafts.map((d) => (
                    <Card key={d.id} className="draft-card">
                      <Badge className="message-tag">
                        <FileSpreadsheet size={14} />
                        待核对 · {d.source}
                      </Badge>
                      <h3>识别到 {d.candidates.length} 笔订单</h3>
                      <p>{d.text.slice(0, 300)}</p>
                      {d.candidates.map((c, i) => (
                        <div className="draft-order" key={i}>
                          <b>
                            {c.customer} · {c.kg} kg
                          </b>
                          <span>
                            {date(c.due)} · {c.address}
                          </span>
                        </div>
                      ))}
                      <div className="button-row">
                        <FarmButton
                          className="primary"
                          disabled={busy}
                          onClick={() =>
                            void action({
                              type: "draft",
                              id: d.id,
                              action: "import",
                            })
                          }
                        >
                          核对无误，登记订单
                        </FarmButton>
                        <FarmButton
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            void action({
                              type: "draft",
                              id: d.id,
                              action: "dismiss",
                            })
                          }
                        >
                          暂不登记
                        </FarmButton>
                      </div>
                    </Card>
                  ))}
                  {activeJobs.length > 0 && (
                    <div className="job-progress">
                      {workerOnline ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <AlertCircle size={16} />
                      )}
                      {workerOnline
                        ? activeJobs[0].stage
                        : "任务已保存，等待后台启动"}
                    </div>
                  )}
                  <div ref={chatEnd} />
                </div>
                <div className="quick-actions">
                  {!simulation && (
                    <FarmButton
                      disabled={busy || activeJobs.length > 0}
                      onClick={() =>
                        void action({ type: "rule_demo" }, false, "simulation")
                      }
                    >
                      <FlaskConical size={14} />
                      载入示例
                    </FarmButton>
                  )}
                  {simulation && (
                    <>
                      <FarmButton
                        className="secondary"
                        disabled={busy || activeJobs.length > 0}
                        onClick={() => void action({ type: "rule_demo" })}
                      >
                        <FlaskConical size={14} />
                        一句话生成发货规则
                      </FarmButton>
                      <FarmButton
                        disabled={busy || activeJobs.length > 0}
                        onClick={() => void action({ type: "simulation" })}
                      >
                        <FlaskConical size={14} />
                        运行模拟测试
                      </FarmButton>
                    </>
                  )}
                  <FarmButton
                    disabled={busy}
                    onClick={() =>
                      void action({
                        type: "chat",
                        text: locale === "en" ? "Today's tasks" : "今日の作業",
                      })
                    }
                  >
                    <ClipboardList size={14} />
                    今日待办
                  </FarmButton>
                  <FarmButton
                    disabled={busy}
                    onClick={() => void action({ type: "job", kind: "plan" })}
                  >
                    <Tractor size={14} />
                    安排作业
                  </FarmButton>
                  <FarmButton onClick={() => setModal("stock")}>
                    <Sprout size={14} />
                    登记采收
                  </FarmButton>
                  <FarmButton onClick={() => setModal("csv")}>
                    <FileSpreadsheet size={14} />
                    导入订单表
                  </FarmButton>
                </div>
                <form className="composer" onSubmit={send}>
                  {attachment && (
                    <div className="attachment-chip">
                      <Paperclip size={13} />
                      {attachment.name}
                      <FarmButton
                        type="button"
                        aria-label="移除附件"
                        onClick={() => setAttachment(null)}
                      >
                        <X size={14} />
                      </FarmButton>
                    </div>
                  )}
                  <Textarea
                    aria-label="告诉农忙助手"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="说说今天的安排，或者发来一张订单照片…"
                    rows={2}
                    maxLength={20000}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        if (!busy && !recording) void send(e);
                      }
                    }}
                  />
                  <div className="composer-footer">
                    <div>
                      <Input
                        hidden
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,audio/*"
                        onChange={(e) => {
                          if (e.target.files?.[0])
                            void upload(e.target.files[0]);
                          e.target.value = "";
                        }}
                      />
                      <FarmButton
                        type="button"
                        className="icon-button"
                        aria-label="上传图片或音频"
                        disabled={busy || recording}
                        onClick={() => fileRef.current?.click()}
                      >
                        <Paperclip size={18} />
                      </FarmButton>
                      <FarmButton
                        type="button"
                        className={`icon-button ${recording ? "recording" : ""}`}
                        aria-label={recording ? "停止录音" : "开始录音"}
                        disabled={busy}
                        onClick={() => void record()}
                      >
                        {recording ? <Square size={17} /> : <Mic size={18} />}
                      </FarmButton>
                      {recording && (
                        <span role="status">录音中，点击停止 · 最长 60 秒</span>
                      )}
                    </div>
                    <FarmButton
                      className="send-button"
                      type="submit"
                      aria-label="发送消息"
                      disabled={
                        busy || recording || (!input.trim() && !attachment)
                      }
                    >
                      {busy ? (
                        <LoaderCircle size={18} className="spin" />
                      ) : (
                        <ArrowUp size={20} />
                      )}
                    </FarmButton>
                  </div>
                </form>
              </Card>
            </div>
          )}
          {tab === "home" && (
            <>
              {!s.orders.length && (
                <Card className="welcome-strip">
                  <span className="sun-icon">
                    <CloudSun size={26} />
                  </span>
                  <div>
                    <b>从一笔订单开始，也可以先体验一个农忙日。</b>
                  </div>
                  <FarmButton
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void action({ type: "rule_demo" }, false, "simulation")
                    }
                  >
                    载入示例 <ArrowRight size={15} />
                  </FarmButton>
                </Card>
              )}
              <Card className="assistant-entry">
                <div>
                  <h2>AI アシスタント</h2>
                </div>
                <FarmButton
                  className="primary"
                  onClick={() => setTab("assistant")}
                >
                  アシスタントを開く <ArrowRight size={16} />
                </FarmButton>
              </Card>
              <div className="dashboard-grid">
                <aside className="right-stack">
                  <Card className="panel attention-panel">
                    <div className="panel-heading">
                      <h2>接下来，做什么</h2>
                      <Badge className="count-dot">
                        {pending.length + late.length}
                      </Badge>
                    </div>
                    {pending.length + late.length === 0 ? (
                      <Empty>暂无待办事项</Empty>
                    ) : (
                      <div className="attention-list">
                        {pending.slice(0, 2).map((o) => (
                          <FarmButton
                            key={o.id}
                            onClick={() => setTab("orders")}
                          >
                            <span className="attention-icon">
                              <Package size={17} />
                            </span>
                            <div>
                              <b>
                                {o.kg > data.availableKg
                                  ? `还缺 ${Math.round((o.kg - data.availableKg) * 10) / 10} kg 可用库存`
                                  : "一笔订单等待确认"}
                              </b>
                              <p>
                                {o.customer} · {o.kg} kg
                              </p>
                            </div>
                            <ChevronRight size={15} />
                          </FarmButton>
                        ))}
                        {late.slice(0, 2).map((t) => (
                          <FarmButton
                            key={t.id}
                            onClick={() => setTab("tasks")}
                          >
                            <span className="attention-icon amber">
                              <Clock3 size={17} />
                            </span>
                            <div>
                              <b>
                                {t.kind === "deliver"
                                  ? "配送交接需要跟进"
                                  : "作业进度需要跟进"}
                              </b>
                              <p>{t.title}</p>
                            </div>
                            <ChevronRight size={15} />
                          </FarmButton>
                        ))}
                      </div>
                    )}
                  </Card>
                  <Card className="panel">
                    <div className="panel-heading">
                      <h2>田间到门前</h2>
                      <Truck size={18} />
                    </div>
                    <div className="journey">
                      {[
                        {
                          icon: Sprout,
                          title: "采收与分选",
                        },
                        {
                          icon: Package,
                          title: "订单与打包",
                        },
                        {
                          icon: Truck,
                          title: "配送与交接",
                        },
                      ].map(({ icon: Icon, title }, i) => (
                        <div key={title}>
                          <span className={`journey-icon j${i}`}>
                            <Icon size={18} />
                          </span>
                          <section>
                            <b>{title}</b>
                          </section>
                        </div>
                      ))}
                    </div>
                  </Card>
                  <Card className="panel activity-panel">
                    <div className="panel-heading">
                      <h2>农场动态</h2>
                      <Radio size={17} />
                    </div>
                    {s.events.length === 0 ? (
                      <p className="muted padded">暂无动态</p>
                    ) : (
                      <div className="activity-list">
                        {s.events.slice(0, 5).map((e) => (
                          <div key={e.id}>
                            <i className={e.level} />
                            <section>
                              <p>{e.text}</p>
                              <small>{time(e.at)}</small>
                            </section>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </aside>
              </div>
            </>
          )}
          {tab === "orders" && (
            <>
              <Card className="inventory-banner">
                <div>
                  <Sprout size={30} />
                  <section>
                    <h2>更新采收与库存</h2>
                  </section>
                </div>
                <FarmButton
                  className="secondary"
                  onClick={() => setModal("stock")}
                >
                  <Plus size={16} />
                  登记采收
                </FarmButton>
              </Card>
              <Card className="panel">
                <div className="panel-heading">
                  <h2>
                    全部订单 <span className="muted">{s.orders.length}</span>
                  </h2>
                  <FarmButton
                    className="text-button"
                    onClick={() => setModal("csv")}
                  >
                    <ArrowDownToLine size={16} />
                    导入新格式订单表
                  </FarmButton>
                </div>
                {!s.orders.length ? (
                  <Empty>还没有订单。记录第一笔客户需求吧。</Empty>
                ) : (
                  <div className="table-scroll">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>客户 / 收货地点</TableHead>
                          <TableHead>数量</TableHead>
                          <TableHead>交付时间</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead>下一步</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {s.orders.map((o) => (
                          <TableRow key={o.id}>
                            <TableCell>
                              <b>{o.customer}</b>
                              <small>{o.address}</small>
                              <small>{o.source}</small>
                            </TableCell>
                            <TableCell className="number">
                              {o.kg} <small>kg</small>
                            </TableCell>
                            <TableCell>{date(o.due)}</TableCell>
                            <TableCell>
                              <Badge className={`status ${o.status}`}>
                                {ORDER_NAMES[o.status]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="table-actions">
                                {o.status === "review" && (
                                  <FarmButton
                                    className="small-primary"
                                    disabled={busy || o.kg > data.availableKg}
                                    onClick={() =>
                                      void action({ type: "confirm", id: o.id })
                                    }
                                  >
                                    {o.kg > data.availableKg
                                      ? "等待补充库存"
                                      : "确认并安排"}
                                  </FarmButton>
                                )}
                                {!["delivered", "cancelled"].includes(
                                  o.status,
                                ) && (
                                  <>
                                    <FarmButton
                                      className="text-button"
                                      onClick={() =>
                                        setModal({ orderId: o.id })
                                      }
                                    >
                                      改期
                                    </FarmButton>
                                    <FarmButton
                                      className="text-button danger"
                                      disabled={busy}
                                      onClick={() =>
                                        setModal({
                                          cancelId: o.id,
                                          customer: o.customer,
                                        })
                                      }
                                    >
                                      取消
                                    </FarmButton>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            </>
          )}
          {tab === "tasks" && (
            <>
              <Card className="panel staff-panel">
                <div className="panel-heading">
                  <h2>
                    <Users size={18} />
                    今天，谁可以接手
                  </h2>
                  <FarmButton
                    className="primary"
                    disabled={busy}
                    onClick={() => void action({ type: "job", kind: "plan" })}
                  >
                    <Sparkles size={16} />
                    重新安排
                  </FarmButton>
                </div>
                <div className="staff-list">
                  {s.workers.map((w) => (
                    <div key={w.id}>
                      <span className="staff-avatar">{w.name[0]}</span>
                      <section>
                        <b>{w.name}</b>
                        <p>
                          {
                            s.tasks.filter(
                              (t) => t.workerId === w.id && t.status !== "done",
                            ).length
                          }{" "}
                          项作业 ·{" "}
                          {w.skills.includes("deliver")
                            ? "可配送"
                            : "分选 / 包装"}
                        </p>
                      </section>
                      <FarmButton
                        className={`availability ${w.available ? "yes" : ""}`}
                        disabled={busy}
                        onClick={() =>
                          void action({
                            type: "worker",
                            id: w.id,
                            available: !w.available,
                          })
                        }
                      >
                        {w.available ? "可接单" : "暂不可用"}
                      </FarmButton>
                    </div>
                  ))}
                </div>
              </Card>
              <div className="section-heading">
                <h2>作业清单</h2>
              </div>
              {!s.tasks.length ? (
                <Card className="panel">
                  <Empty>暂无作业</Empty>
                </Card>
              ) : (
                <div className="task-grid">
                  {s.tasks.map((t) => {
                    const dependency = s.tasks.find(
                      (p) => p.id === t.dependsOn,
                    );
                    const Icon =
                      t.kind === "deliver"
                        ? Truck
                        : t.kind === "pack"
                          ? Package
                          : Sprout;
                    return (
                      <Card
                        className={`panel task-card ${t.status === "done" ? "finished" : ""}`}
                        key={t.id}
                      >
                        <div className="task-top">
                          <span className="task-icon">
                            <Icon size={21} />
                          </span>
                          <Badge
                            className={`status ${t.alerted && t.status !== "done" ? "late" : t.status}`}
                          >
                            {t.alerted && t.status !== "done"
                              ? "已超时 · "
                              : ""}
                            {TASK_STATUS_NAMES[t.status]}
                          </Badge>
                        </div>
                        <h3>{t.title}</h3>
                        <p>
                          <Users size={14} />
                          {s.workers.find((w) => w.id === t.workerId)?.name ||
                            "等待安排负责人"}
                        </p>
                        <p>
                          <Clock3 size={14} />
                          {date(t.due)} 前完成
                        </p>
                        {dependency && (
                          <div className="dependency">
                            <>
                              <span
                                className={
                                  dependency.status === "done" ? "green" : ""
                                }
                              >
                                {dependency.status === "done" ? (
                                  <Check size={14} />
                                ) : (
                                  <Clock3 size={14} />
                                )}
                              </span>
                              前置：{dependency.title.split(" · ")[0]}
                              {dependency.status === "done"
                                ? "已完成"
                                : "待完成"}
                            </>
                          </div>
                        )}
                        {t.evidence && (
                          <div className="evidence">完成记录：{t.evidence}</div>
                        )}
                        <div className="task-actions">
                          {t.status === "offered" && (
                            <>
                              <FarmButton
                                className="small-primary"
                                disabled={busy}
                                onClick={() =>
                                  void action({
                                    type: "task",
                                    id: t.id,
                                    action: "accept",
                                  })
                                }
                              >
                                负责人接单
                              </FarmButton>
                              <FarmButton
                                className="text-button"
                                disabled={busy}
                                onClick={() =>
                                  void action({
                                    type: "task",
                                    id: t.id,
                                    action: "reject",
                                  })
                                }
                              >
                                无法接单
                              </FarmButton>
                            </>
                          )}
                          {t.status === "accepted" && (
                            <>
                              <FarmButton
                                className="small-primary"
                                disabled={
                                  !!dependency && dependency.status !== "done"
                                }
                                onClick={() => setModal({ task: t })}
                              >
                                提交完成记录
                              </FarmButton>
                              <FarmButton
                                className="text-button"
                                disabled={busy}
                                onClick={() =>
                                  void action({
                                    type: "task",
                                    id: t.id,
                                    action: "reject",
                                  })
                                }
                              >
                                请求改派
                              </FarmButton>
                            </>
                          )}
                          {t.status === "blocked" && (
                            <FarmButton
                              className="text-button"
                              disabled={busy}
                              onClick={() =>
                                void action({ type: "job", kind: "plan" })
                              }
                            >
                              重新寻找可用人员 <ArrowRight size={14} />
                            </FarmButton>
                          )}
                          {t.status === "done" && (
                            <span className="green completed">
                              <Check size={15} />
                              已记录完成
                            </span>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {tab === "connections" && (
            <>
              <div className="provider-grid">
                {data.providers.map((p, i) => (
                  <Card className="panel provider-card" key={p.name}>
                    <div>
                      <span className={`provider-icon p${i}`}>
                        {p.name.startsWith("Nosana") ? (
                          <AudioLines size={23} />
                        ) : p.name === "Tavily" ? (
                          <CloudSun size={23} />
                        ) : p.name === "Daytona" ? (
                          <Tractor size={23} />
                        ) : (
                          <FileSpreadsheet size={23} />
                        )}
                      </span>
                      <Badge
                        className={`status ${p.configured ? "done" : "inactive"}`}
                      >
                        {p.configured ? "已配置 · 待调用验证" : "未配置"}
                      </Badge>
                    </div>
                    <h3>{p.name}</h3>
                    <details className="provider-details">
                      <summary>配置详情</summary>
                      <p>{p.detail}</p>
                      {p.missing.length > 0 && (
                        <code>{p.missing.join("\n")}</code>
                      )}
                    </details>
                  </Card>
                ))}
              </div>
              <Card className="panel sources-panel">
                <div className="panel-heading">
                  <div>
                    <h2>外部信息</h2>
                    {s.researchAt && <p>{`最近查询 ${date(s.researchAt)}`}</p>}
                  </div>
                  <FarmButton
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void action({ type: "job", kind: "research" })
                    }
                  >
                    <CloudSun size={17} />
                    查询公开信息
                  </FarmButton>
                </div>
                {s.sources.length ? (
                  s.sources.map((source) => (
                    <article className="source" key={source.url}>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {source.title} ↗
                      </a>
                      <p>{source.content}</p>
                    </article>
                  ))
                ) : (
                  <p className="padded muted">暂无公开信息</p>
                )}
              </Card>
              <Card className="panel">
                <div className="panel-heading">
                  <h2>后台任务记录</h2>
                  <span
                    className={`worker-pill ${workerOnline ? "online" : ""}`}
                  >
                    <i />
                    {workerOnline
                      ? "守护进程运行中"
                      : "运行 npm run worker 启动"}
                  </span>
                </div>
                {s.jobs.length ? (
                  <div className="job-list">
                    {[...s.jobs]
                      .reverse()
                      .slice(0, 15)
                      .map((j) => (
                        <div key={j.id}>
                          <Badge className={`status ${j.status}`}>
                            {j.status === "done"
                              ? "完成"
                              : j.status === "failed"
                                ? "未完成"
                                : j.status === "running"
                                  ? "处理中"
                                  : "等待中"}
                          </Badge>
                          <section>
                            <b>
                              {
                                {
                                  plan: "检查并安排作业",
                                  research: "查询公开信息",
                                  intake: "理解多模态输入",
                                  adapter: "学习订单表格式",
                                  simulation: "运行模拟测试",
                                }[j.kind]
                              }
                            </b>
                            <p>{j.error || j.stage}</p>
                          </section>
                          <small>{time(j.createdAt)}</small>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="muted padded">暂无后台任务</p>
                )}
              </Card>
            </>
          )}
        </main>
      </div>
      {modal && (
        <Popup
          title={modalTitle}
          locale={locale}
          onClose={() => setModal(null)}
        >
          {modal === "help" ? (
            <div className="help-content">
              <p>
                先登记已采收、已核实的库存，再确认订单。助手会创建分选 → 打包 →
                配送的连续任务，负责人接单后逐项完成。
              </p>
              <ol>
                <li>
                  <b>Nosana：</b>
                  读订单图片、转写录音，将客户需求整理成待核对订单。
                </li>
                <li>
                  <b>Tavily：</b>查看官方天气和物流公告，帮助你判断交付风险。
                </li>
                <li>
                  <b>Daytona：</b>计算人员工时和冲突，检查计划是否可行。
                </li>
                <li>
                  <b>CodeAF：</b>遇到新格式订单表时，在 Daytona
                  中编写转换器，验证后交给你核对。
                </li>
              </ol>
              <p>
                后台每隔几秒检查作业是否超时。保持 <code>npm run worker</code>{" "}
                运行，关闭网页后仍可跟进。本版使用站内提醒，未连接电话、LINE
                或短信。
              </p>
              <FarmButton
                className="primary"
                onClick={() => {
                  setModal(null);
                  setTab("connections");
                }}
              >
                查看连接状态 <ArrowRight size={16} />
              </FarmButton>
            </div>
          ) : (
            <form onSubmit={submitForm} className="modal-form">
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              {modal === "order" && (
                <>
                  <Label>
                    客户姓名
                    <Input
                      name="customer"
                      required
                      maxLength={80}
                      placeholder="例如：田中商店"
                      autoFocus
                    />
                  </Label>
                  <div className="form-row">
                    <Label>
                      订购重量（kg）
                      <Input
                        name="kg"
                        required
                        type="number"
                        min="0.1"
                        max="10000"
                        step="0.1"
                        placeholder="10"
                      />
                    </Label>
                    <Label>
                      交付时间（日本时间）
                      <Input
                        name="due"
                        required
                        type="datetime-local"
                        defaultValue={formDeadline}
                      />
                    </Label>
                  </div>
                  <Label>
                    收货地点
                    <Input
                      name="address"
                      required
                      maxLength={300}
                      placeholder="填写实际配送地址"
                    />
                  </Label>
                  <Label>
                    备注
                    <Textarea
                      name="note"
                      maxLength={1000}
                      placeholder="包装规格、收货注意事项…"
                    />
                  </Label>
                </>
              )}
              {modal === "stock" && (
                <>
                  <Label>
                    记录类型
                    <NativeSelect name="kind">
                      <NativeSelectOption value="actual">
                        已核实采收，增加实际库存
                      </NativeSelectOption>
                      <NativeSelectOption value="forecast">
                        更新预计采收，不计入可用库存
                      </NativeSelectOption>
                    </NativeSelect>
                  </Label>
                  <Label>
                    重量（kg）
                    <Input
                      name="kg"
                      autoFocus
                      required
                      type="number"
                      min="0.1"
                      step="0.1"
                      max="10000"
                    />
                  </Label>
                </>
              )}
              {modal === "csv" && (
                <>
                  <Label>
                    订单表内容（CSV）
                    <Textarea
                      name="csv"
                      defaultValue={
                        simulation
                          ? `お名前,重量kg,お届け先,お届け日時\n中村商店（サンプル）,10,西予市 サンプル配送先 D,${new Date(formDeadline).toISOString()}`
                          : undefined
                      }
                      rows={8}
                      maxLength={30000}
                      required
                      autoFocus
                      placeholder={
                        "お客様,数量kg,配達日時,住所\n田中商店,10,2026-12-01T15:00:00+09:00,西予市内配送点"
                      }
                    />
                  </Label>
                </>
              )}
              {typeof modal === "object" && "task" in modal && (
                <>
                  <Label>
                    完成凭据
                    <Textarea
                      name="evidence"
                      required
                      minLength={4}
                      maxLength={1000}
                      rows={4}
                      autoFocus
                      placeholder={
                        modal.task.kind === "deliver"
                          ? "例如：14:30 与田中先生完成交接，10 kg 已签收。"
                          : "例如：称重 10 kg，2 箱已打包，数量核对无误。"
                      }
                    />
                  </Label>
                  {modal.task.kind === "deliver" && (
                    <Label className="checkbox-label">
                      <Checkbox name="deliveryConfirmed" required />
                      我确认已与收货人完成实际交接
                    </Label>
                  )}
                </>
              )}
              {typeof modal === "object" && "orderId" in modal && (
                <>
                  <Label>
                    新的交付时间（日本时间）
                    <Input
                      type="datetime-local"
                      required
                      name="due"
                      defaultValue={formDeadline}
                    />
                  </Label>
                  <Label className="checkbox-label">
                    <Checkbox required />
                    我已与客户确认这次改期
                  </Label>
                </>
              )}
              {typeof modal === "object" && "cancelId" in modal && (
                <p>
                  取消 {modal.customer}{" "}
                  的订单，并释放预留库存？关联作业会从任务清单中移除。
                </p>
              )}
              <div className="modal-footer">
                <FarmButton
                  type="button"
                  className="secondary"
                  onClick={() => setModal(null)}
                >
                  返回
                </FarmButton>
                <FarmButton className="primary" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Check size={16} />
                  )}{" "}
                  {modal === "csv"
                    ? "开始理解订单表"
                    : modal === "order"
                      ? "保存订单"
                      : "确认保存"}
                </FarmButton>
              </div>
            </form>
          )}
        </Popup>
      )}
    </SidebarProvider>,
    locale,
  );
}
