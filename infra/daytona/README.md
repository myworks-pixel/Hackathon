# CodeAF 快照准备

应用通过 Daytona 运行 CodeAF，因此本机无需安装 CodeAF CLI。运行时需要一个预装 Python、Git 和 CodeAF 的云端快照；本目录的 Dockerfile 用于构建它，不包含密钥或农场数据。

```sh
# 只查看计划，不创建资源
npm run setup:codeaf

# 在能够访问 Daytona API 的环境中提交构建；会使用账户存储额度
npm run setup:codeaf -- --create
```

构建使用 Daytona SDK 的远端镜像构建，不要求本机安装 Docker。资源为 1 vCPU、2 GiB 内存、5 GiB 磁盘，不使用 GPU。脚本不会覆盖或删除同名快照，也不会自动改写 `.env.local`。若构建超时，先在控制台查看状态，再决定是否重试。

Dockerfile 从 [CodeAF 官方地址](https://agentfield.ai/codeaf)安装当前稳定版；如需固定版本，可在 Dockerfile 中设置 `ARG CODEAF_VERSION=已验证的发布标签`。密钥只在运行时注入。

云端状态确认 active 后，再填写：

```dotenv
DAYTONA_CODEAF_SNAPSHOT=mikan-codeaf-v1
```

仍需配置 Nosana 上已上线且支持工具调用的模型。当前账户为 Tier 1，不能应用项目要求的自定义网络策略；快照构建成功不会解决这个独立限制。不要为绕过错误直接删除网络检查。

已经准备一个明确可选的账号默认策略：`DAYTONA_NETWORK_POLICY=platform`。它不调用自定义网络设置 API，保留 Daytona Tier 1 自带的网络限制；允许访问的域名多于原先的 Nosana 单域名白名单。此选项未在本地启用，等待用户确认。`strict` 仍为默认，任何策略错误都不会自动回退。选择 platform 也不保证 Nosana 域名一定在 Daytona 当前允许列表内，必须实际验证。

本次准备已验证本地 SDK 能读取镜像定义和构建脚本。提交构建时连接失败，只读复查也返回 `DaytonaConnectionError`；尚未确认云端镜像构建成功或验证 CodeAF 实际推理。
