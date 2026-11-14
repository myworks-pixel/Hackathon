# Nosana 部署说明

应用本身不会创建收费 GPU 部署。密钥全部在 `.env.local`，没有任何值写进前端。

## 文字模型

填写 `NOSANA_API_KEY`，查询 `https://inference.nosana.com/v1/models`，把可用模型 ID 填入 `NOSANA_MODEL`。该共享接口用于文字理解，不能据此假定它支持图片或语音。

LangChain / LangGraph 和 CodeAF 也复用这一组 Nosana 配置。CodeAF 需要支持工具调用的模型，可通过 `CODEAF_MODEL` 单独指定同一 Nosana 服务上的模型 ID。不要填写其他平台的密钥或接口地址。

## 图片模型

在 Nosana 控制台部署支持图片的 OpenAI-compatible 模型服务（例如能运行视觉模型的 vLLM 服务），确认 `/v1/chat/completions` 支持 `image_url` 数据 URL。设置访问密钥后，将包含 `/v1` 的地址、模型 ID、服务访问密钥分别填写到 `NOSANA_VISION_BASE_URL`、`NOSANA_VISION_MODEL`、`NOSANA_VISION_API_KEY`。

应用仅接受 Nosana 官方推理域名和控制台分配的 `*.node.k8s.prd.nos.ci` 部署域名。这里的 OpenAI-compatible 指接口格式，不需要 OpenAI 账号或 API Key。

## 语音服务

`asr/` 提供独立 Docker 服务源码，使用 faster-whisper；已实现 Bearer 鉴权、12 MB 输入限制、单 GPU 推理队列、临时音频清理。

1. 在有 Docker 的构建环境运行 `docker build -t YOUR_REGISTRY/farm-asr:YOUR_VERSION infra/nosana/asr`。
2. 镜像构建时会下载公开的 `small` 模型权重并打包，不需要额外 API Key；Nosana 运行时只读本地权重、禁用模型仓库联网及遥测。更换模型时用 `--build-arg WHISPER_MODEL=模型名` 重建镜像，同时修改部署模板中的 `WHISPER_MODEL`。
3. 推送镜像后，在 Nosana 中选择满足镜像 CUDA / cuDNN 要求的 GPU，替换部署模板的镜像和 `INFERENCE_API_KEY`。等待 `/health` 返回 ready；缺少权重时启动失败，不会调用其他推理服务。
4. 把部署地址（以 `/v1` 结尾）、模型名 `small`、你设置的 `INFERENCE_API_KEY` 填入 `NOSANA_ASR_BASE_URL`、`NOSANA_ASR_MODEL`、`NOSANA_ASR_API_KEY`。
5. 上传日语或中文录音进行端到端测试。页面录音最多 60 秒。

以上是自建 faster-whisper 镜像方案；本次实际部署使用下方官方 vLLM 镜像方案。生产环境应在入口代理增加请求速率、音频时长和请求超时限制。

## 2026-11-14 连接进展

- Nosana Playground 已实际返回 `qwen/qwen3.8-27b` 的日文回复。本地 `NOSANA_MODEL` 与 `CODEAF_MODEL` 已设置为控制台提供的这个模型 ID；模型在线状态会变化，不把它写死为默认值。
- 本地执行环境对 Nosana / Tavily 的 DNS 查询失败；官方网页 Playground 成功不等于本地 Worker 已能连接。原有 Worker 需要在用户终端重启以读取新配置。
- `npm run check:live` 验证真实模型列表、Tavily 身份和 CodeAF 快照；`npm run check:live -- --infer` 额外执行真实的模型工具调用往返。检查不改写农场数据，不打印密钥或原始错误，报告保存在 `artifacts/live-connection-check.json`。
- `npm run check:live -- --audio /absolute/path/sample.wav` 可验证配置好的语音服务，输出仅记录识别字符数，不记录语音文本。
- `asr/vllm-deployment.template.json` 使用官方 vLLM v0.15.0、Nosana 预加载的 Whisper large-v3-turbo 权重和独立访问密钥。通过 vLLM 原生 `VLLM_API_KEY` 环境变量启用鉴权，避免 CLI 对短横线开头的随机密钥的解析问题；变量为空时拒绝启动。
- 已创建私密部署 `CF4PrREdojWAUePUo7Eemv46AfUtNH3nksMS1dUNSezT`，1 副本、RTX 3060 / 3060 Ti 市场、控制台报价 $0.05/小时、Infinite 策略。用户明确要求使用已有 credits 并保持 GPU 运行，因此移除了两小时进程上限，不在测试后停止部署，不充值。
- 部署地址、`mikan-whisper` 模型名和独立密钥已写入忽略提交的 `.env.local`。已通过 Nosana API 确认 `confidential: true`；配置完成不等同于语音识别已通过，最新实测结果见 `VALIDATION.md`。
- `artifacts/asr-test.wav` 是 whisper.cpp 官方仓库的 11 秒公开 JFK 英文语音样本，用于连通测试，不是日语准确率验证。来源：https://github.com/ggml-org/whisper.cpp/blob/master/samples/jfk.wav 。
- 视觉接口尚未通过真实图像验证；不要仅因为文字模型有视觉能力就宣称当前托管接口支持图像。
