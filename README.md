# Mikan · 农忙协同助手

连接订单、采收、分选、包装和配送的本地农场工作台。全部 UI 使用现有 shadcn 组件，包括 Sidebar、Dialog、Card、Button、Table、Input、Textarea、Checkbox、Badge 和 Message。

界面默认日文，右上角可以切换 English，选择保存在浏览器中。界面文案、状态、错误提示和系统消息支持双语；客户输入及历史模型回复保留原文，新模型回复按所选语言生成。

页面入口：`/` 为农场概况，`/assistant` 为独立 AI 助手聊天页，`/orders` 为订单与库存，`/tasks` 为作业配送，`/connections` 为连接设置。Sidebar 提供各页面入口。

## 启动

建议 Node.js 24。首次运行先安装依赖，再启动应用：

```bash
npm install
npm run dev
```

`npm run dev` 会同时启动网页和消息处理 Worker，`npm start` 也会同时启动两者。任一服务异常退出时会停止另一服务，避免只留下网页、消息却一直等待。按 Ctrl+C 停止两者。需要独立管理进程时，仍可使用 `npm run worker`。

打开 http://127.0.0.1:3000 。关闭浏览器不影响 Worker；关闭终端或电脑休眠会停止处理。普通 AI 对话由 Mikan 总 Agent 处理，依赖支持函数工具调用的 Nosana 文字模型；图片、语音、外部查询和代码转换分别按需使用对应服务。缺少模型配置或 Worker 离线时，聊天中会立即说明原因，不把新消息放入无法处理的队列。

**密钥保存在 Git 忽略的 `.env.local` 中。** `.env.example` 始终保留空白模板，不要用它覆盖已经填写的配置。修改配置后重启网页服务和 Worker。运行 `npm run check:partners` 检查配置完整性；该命令不会展示密钥，也不会调用收费接口。

## BOT 调度架构

总 Agent 先调用 `agent_plan`，按请求含义选择零到六个专业任务，记录步骤与依赖；专业 Agent 在自己的工具范围内执行，总 Agent 再根据回执回复。普通聊天可直接回答，前置失败会阻止下游启动，`agent_delegate` 只能追加必要的新任务。对话展示总 Agent、被实际调用的专业 Agent、规划理由和工具回执。

参考实现与边界见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 四个平台

| 平台    | 真实调用                                                                  | 配置                                                                           |
| ------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Nosana  | 文字理解、图片订单提取、语音转写，结果先进入待核对草稿                    | NOSANA_API_KEY、NOSANA_MODEL；视觉和语音分别配置 BASE_URL / MODEL / API_KEY    |
| Tavily  | 调用 /search，限定气象厅和物流企业官方域名，保留原文链接                  | TAVILY_API_KEY                                                                 |
| Daytona | 官方 SDK 创建沙箱、上传和运行 Python 排程程序、检查人员工时冲突、删除沙箱 | DAYTONA_API_KEY；可选 DAYTONA_API_URL、DAYTONA_TARGET                          |
| CodeAF  | 在 Daytona 沙箱为新 CSV 格式编写转换器，独立校验输出，人工确认导入        | 复用 NOSANA_API_KEY / NOSANA_MODEL；可选 CODEAF_MODEL；DAYTONA_CODEAF_SNAPSHOT |

应用只调用这四个平台。LangChain / LangGraph 的模型也使用 Nosana，没有 OpenAI、Anthropic、Google 或 OpenRouter 服务配置。`@langchain/openai` 只是兼容协议的客户端，已经显式指定 Nosana 地址；不会调用 OpenAI 官方 API。外部 LangSmith 跟踪也已关闭。

CodeAF 是运行在 Daytona 中的编码工具，其规划、编码和检查三个角色全部使用 Nosana。`CODEAF_MODEL` 可选，填写 Nosana 上支持工具调用的模型 ID；留空则复用 `NOSANA_MODEL`。不再需要 `CODEAF_API_KEY`。程序只在 CodeAF 子进程中把 **Nosana 密钥**映射到它要求的兼容变量 `OPENAI_API_KEY`，同时固定 `CODEAF_BASE_URL` 为 Nosana；这个内部变量不是 OpenAI 的密钥配置。子进程使用临时 profile，不继承其他模型供应商、模型候选列表或登录状态。

服务地址经过白名单校验：Nosana 仅接受 `https://inference.nosana.com/v1` 或 Nosana 部署域名 `*.node.k8s.prd.nos.ci`；Daytona 仅接受其 `*.daytona.io` HTTPS 地址，留空使用 SDK 默认地址。图片与语音地址需要包含 `/v1`。直接 HTTP 请求禁止跳转到其他地址。

CodeAF 快照需预装 Python 3、Git 和可从 PATH 调用、支持自定义接口及三个角色模型参数的 codeaf。按[官方说明](https://agentfield.ai/codeaf)安装、核对版本，再制作 Daytona 快照。运行时不下载代码或安装包。每次导入使用 3 分钟超时、1 个 worker slot；按用户要求不再设置本次测试的 $1 限额，只使用已有平台 credits。`--yes-spend` 允许任务继续执行，超时不是账单硬上限，余额由平台管理。转换代码只保存在 .data/adapters，不会在本机执行或自动安装为生产插件。

CodeAF 沙箱只允许访问所配置的 Nosana 域名，纯 Python 排程沙箱禁止对外联网。程序在上传农场数据之前显式应用 Daytona 网络策略；权限或套餐不支持时终止任务，不会放宽限制重试。[Daytona 网络策略说明](https://www.daytona.io/docs/en/network-limits/)中，当前只有 Tier 3 / 4 支持自定义沙箱网络策略。

上述行为是默认的 `DAYTONA_NETWORK_POLICY=strict`。另提供可明确选择的 `platform` 模式，使用 Daytona 账号当前等级的默认防火墙；它允许的域名范围比项目白名单更大，不代表只允许四个平台出站。应用模型地址校验和四平台业务接口约束仍保留。不会在失败时自动切换模式。2026-11-14 经用户确认，本机 `.env.local` 已选择 platform；示例配置仍使用 strict。

真实连接检查：`npm run check:live`；包括真实模型工具调用的检查：`npm run check:live -- --infer`。后者消耗少量 Nosana 推理额度，前者只读检查。报告保存到 `artifacts/live-connection-check.json`，不会把配置存在当作已经连通。

CodeAF 快照准备见 [infra/daytona/README.md](infra/daytona/README.md)。`npm run setup:codeaf` 只显示构建计划；添加 `-- --create` 才会提交云端构建。不要在快照未构建成功前填写 `DAYTONA_CODEAF_SNAPSHOT`。

Nosana 共享文字 API 不自动支持视觉或语音。图片、音频需要已经部署的兼容服务地址，参见 [Nosana 部署说明](infra/nosana/README.md)和所附语音容器源码。

## 不填密钥时

可以录入和确认订单、登记实际或预计采收、操作现有作业、检查超时，以及在聊天中输入「今日待办」「库存」查询业务数据。新的 AI 规划与专业 Agent 调度需要可用的 Nosana 工具调用模型；样例数据可明确选择离线验证。

无密钥时，外部识别或查询会明确失败，保留失败原因，不伪造平台成功结果。真实 API 模式不会在模型或 Daytona 失败后伪装成模拟成功。

## 三分钟演示

### 一句话变成可验证的发货规则

在现有 `/assistant` 对话页点击「サンプルを読み込む」。没有独立的模拟页面或侧栏入口；聊天、订单、作业页仍使用原来的组件。示例数据单独持久化，顶部显示「サンプルデータ」，可点击「実データに戻る」。模拟数据默认选择「実 API を使用」，与实际数据走同一套总 Agent 和专业 Agent；可明确切换为「オフライン検証」。数据源与执行模式相互独立，真实 API 失败不会自动回退为离线成功。

1. 样例农户说「今日は梱包済みの箱だけ発送してください。」。接待智能体把它映射为规则草案，规则尚未生效。
2. 订单、配送智能体展示四种边界案例：一箱装好并获得分批同意（可先发一箱）、客户要求同日到达（等待）、未获得分批同意（等待）、两箱都装好（可一起发，但不保证到达日期）。可以改成始终整单一起发，案例立即重新计算。
3. 点击「このルールを確認して有効にする」，规则仅在当天日本时间内生效。草案更新后，旧确认不能覆盖新草案。
4. 一单 10 kg 蜜柑分为两个 5 kg 箱：箱 1 已装好，箱 2 未装好。在对话内勾选客户条件，点击「ルールを再確認して模擬発送」。同日到达要求优先于分批同意；允许分批时只有箱 1 变为模擬発送済み。再次点击不会重复发货。
5. 点击「ローカル回帰検証」，运行 16 个离线检查：普通问候、运费、CSV、去重、库存、人员改派、时间冲突、交接凭据与超时监督。对话显示六个 React Icons 彩色头像（前三个 + 数量），展开可查看名称、平台、模拟标记、状态及检查值。

仅明确选择离线验证时，样例模型响应和表格适配才使用固定模拟，Python 排程在本机执行。真实 API 模式由总 Agent 语义规划，按需调用 Nosana、Tavily、Daytona、CodeAF。当前自然语言规则仅支持「今天只发已装箱」这一种有明确边界的规则，尚不是任意规则生成器。规则实际执行演示仅改变样例箱子状态，没有物流下单接口。

`npm run demo:data` 可重新生成 `public/demo/scenario.json`、`orders.csv`、`farmer-message.txt` 和 `artifacts/simulation-report.json`。日期按生成时刻更新，不会修改业务数据库。聊天中的样例 CSV 也可直接从「注文表を取り込む」体验。

### 原有采收与作业流程

1. 启动网页与 Worker，在助手中载入样例后运行六个智能体的测试，或使用示例种子数据：实际库存 80 kg，已预留 65 kg，另有 30 kg 的订单待确认。完整测试会继续执行后续步骤，最终库存为 100 kg、已预留 95 kg。
2. 助手指出缺少 15 kg 可用库存；预计采收 60 kg 没有混进可售库存。
3. 登记实际核实的 20 kg 采收，确认旅馆订单，后台生成作业邀请。
4. 在作业页让配送负责人选择「无法接单」，后台改找其他具备配送能力的人员。
5. 依次完成分选、包装，提交交接说明并勾选实际交接确认。跳过前置作业会被拒绝。
6. 配置平台后上传订单照片或录制语音，在对话中核对草稿；查询外部信息；导入新格式 CSV 演示 CodeAF + Daytona。

## 当前范围

- 单农场、本机经营者工作台，没有账号登录、多租户或独立员工身份认证；负责人接单由经营者代录。启动默认监听 127.0.0.1，不要直接公开到互联网。
- 电话、LINE、短信、支付和物流下单尚未接入；提醒都是站内记录。
- 采收由人工完成，系统登记核实重量。作业排程从采后分选开始，未计算坡地运输或田块采收工时。
- 本地按技能和未完成任务数分配。Daytona 工时模拟暂按分选 30、包装 30、配送 60 分钟估算，不代表实时路况。
- 识别后人工核对；库存足够才能确认。CSV 校验检查行数、客户名、地址与字段类型，重量和日期仍需逐条核实。
- 天气与物流公告保留来源供经营者参考，不自动改变客户交付承诺。
- 配送完成凭据是人工声明，不是第三方物流认证。
- .data 保存 SQLite、附件和转换代码，尚无自动清理策略，不应提交或公开。
- SQLite 事务防止并发超卖；幂等请求标识保留最近 2000 个。Worker 有租约和中断检测，不自动重试付费操作。

## 代码与检查

| 路径                                   | 作用                                |
| -------------------------------------- | ----------------------------------- |
| src/components/farm-app.tsx            | shadcn 工作台、订单、任务、连接设置 |
| src/app/api/farm、src/app/api/upload   | 业务 API、附件上传                  |
| src/lib/farm/domain.ts、actions.ts     | 库存规则、状态流转、请求校验        |
| src/lib/farm/store.ts、worker.ts       | SQLite 持久化、后台处理与监测       |
| src/lib/farm/providers.ts              | Nosana / Tavily HTTP 适配器         |
| scripts/partner-runtime.mjs            | Daytona SDK / CodeAF                |
| scripts/scheduler.py、verify-import.py | 排程与独立导入检查                  |
| infra/nosana/asr                       | GPU 语音服务源码                    |
| tests/farm.test.ts                     | 业务和接口契约测试                  |

已有 src/lib/ai 的 LangChain / LangGraph 入口保留；农忙 BOT 参考 teamflow-yt 的总 Agent / 专业 Agent 工具调用架构，后台生命周期由 SQLite + Worker 管理。当前核心使用 Nosana 的函数工具协议，并非 LangGraph 编排。详见 ARCHITECTURE.md 的代码对应表。

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

检查记录见 [VALIDATION.md](VALIDATION.md)，流程见 [ARCHITECTURE.md](ARCHITECTURE.md)。没有禁用 TypeScript 检查来绕过缺失依赖。

参考：[CodeAF](https://agentfield.ai/docs/codeaf/headless)、[Daytona SDK](https://www.daytona.io/docs/en/typescript-sdk/)、[Tavily](https://docs.tavily.com/documentation/api-reference/endpoint/search)、[Nosana](https://learn.nosana.com/llm/)。
