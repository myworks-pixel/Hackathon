# Hackathon

空白 Next.js 项目，使用 App Router、TypeScript、Tailwind CSS 4、ESLint 和 shadcn/ui。

## 启动

需要 Node.js 22 或以上版本（LangChain 的要求）；当前电脑的 Node.js 24 可用。

```bash
cd /Users/cr/Desktop/Hackathon
npm install
npm run dev
```

打开 http://localhost:3000。首页刻意保持空白，从 `src/app/page.tsx` 开始开发。

## 一次性安装全部组件

在能够访问 npm 和 ui.shadcn.com 的终端运行：

```bash
npm run setup
```

此命令安装项目依赖，调用官方 CLI 下载当前配置风格的全部可安装组件及其依赖，然后格式化、检查类型并构建。下载组件不会向首页添加演示内容。

也可以单独执行全量组件安装：

```bash
npm run ui:add:all
```

已有组件不会被命令强制覆盖；CLI 如提示覆盖，可保留本地版本。这里的“全部组件”指官方 `shadcn add --all` 所提供的组件，不含第三方 registry、整页 Blocks 和另行安装的 AI Elements。

## shadcn/ui

已配置 New York 风格、Neutral 配色、浅色与深色主题变量、Lucide 图标库和 `@/*` 路径别名。已提供 `src/components/ui/button.tsx`，首页未放置示例组件。

安装依赖后，可以添加组件：

```bash
npm run ui:add -- input card dialog
```

组件使用示例：

```tsx
import { Button } from "@/components/ui/button";

export default function Page() {
  return <Button>开始</Button>;
}
```

主题位于 `src/app/globals.css`；在根元素添加 `dark` 类可启用深色变量。

## 代码格式化

已提供 Prettier、EditorConfig、Tailwind 类名排序及 VS Code 工作区配置。安装工作区推荐的 Prettier 扩展后，保存会自动格式化；依赖安装完成后也可以运行：

```bash
npm run format
npm run format:check
```

格式规则：2 空格缩进、双引号、分号、LF 换行。Tailwind 排序会读取 `src/app/globals.css`，并处理 `className` 和 `cn`、`clsx`、`cva` 中的类名。ESLint 已关闭与 Prettier 冲突的格式规则。

## 环境变量

`.env.example` 是可提交的模板，`.env.local` 是已创建并被 Git 忽略的本地配置。模型和 API Key 默认留空，不会阻止空白项目启动；只有实际调用 `getApiKey()` 时才要求对应服务的密钥。

服务端组件、Route Handler 或 Server Action 中读取配置：

```ts
import { getApiKey, serverEnv } from "@/lib/env/server";

const apiKey = getApiKey("TAVILY_API_KEY");
const model = serverEnv.AI_MODEL;
```

浏览器端只读取公开配置：

```ts
import { clientEnv } from "@/lib/env/client";

const appUrl = clientEnv.NEXT_PUBLIC_APP_URL;
```

启动和构建时会检查环境名称与 URL 格式。密钥读取模块有 `server-only` 限制，错误信息只包含配置项名称，不输出密钥内容。修改 `.env.local` 后重启开发服务。

## LangChain / LangGraph（TypeScript）

依赖声明包含 `langchain`、`@langchain/core`、`@langchain/langgraph` 和 OpenAI 兼容模型适配器 `@langchain/openai`。所有项目入口均为 TypeScript，位于 `src/lib/ai/`，仅在服务端使用。

首次安装并验证：

```bash
npm run setup:ai
```

此命令安装依赖并更新锁文件，然后运行无需 API Key 的框架自检、格式与类型检查和生产构建。它不会重新下载或覆盖 shadcn 组件。

| 入口                | 用途                                               |
| ------------------- | -------------------------------------------------- |
| `createChatModel()` | 从环境变量创建模型，统一设置超时和重试             |
| `createAppAgent()`  | LangChain Agent 起点，后续在 `tools` 中添加工具    |
| `createAppGraph()`  | LangGraph 工作流起点，当前为 START → respond → END |

在 `.env.local` 中填写 `AI_MODEL` 和 `OPENAI_API_KEY` 后即可调用。`AI_BASE_URL` 可选，用于 OpenAI Chat Completions 兼容服务；这里尚未配置 Anthropic、Gemini 等独立适配器。

在服务端组件、Server Action 或 Node.js Route Handler 中使用：

```ts
import { createAppAgent, createAppGraph } from "@/lib/ai";

const agent = createAppAgent();
const agentResult = await agent.invoke({
  messages: [{ role: "user", content: "你好" }],
});

// 自定义工作流时，选择 LangGraph 入口。
const graph = createAppGraph();
const graphResult = await graph.invoke({
  messages: [{ role: "user", content: "你好" }],
});
```

这两个示例是独立的调用方式，实际开发按需要选用。入口按需创建，不在导入模块或构建时调用模型。当前未添加业务工具、数据库记忆或聊天页面；需要多轮上下文时，由调用方传入完整消息。

独立检查框架是否可以运行：

```bash
npm run check:ai
```

自检运行实际 LangChain 工具与 LangGraph 计算工作流，不请求外部模型。只有依赖安装完成后才能运行它。

## 检查和构建

```bash
npm run check
npm run build
```

生产构建完成后，运行 `npm start`。
