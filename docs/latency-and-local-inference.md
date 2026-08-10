# B2 改写：延迟与本地推理决策

更新时间：2026-08-10。模型、价格和平台可用性变化很快，接入前应重新核对官方页面。

## 先修正测量对象

这个功能每次只生成一两句、最多约 70 个英文词。2026-08-10 的实际试用表明，逐 token 更新会让选区浮层产生视觉跳动；当前体验指标因此改为 **完整结果时间**，不再追求 TTFT。

本机实测同一个 DeepSeek V4 Flash 短改写：

- 原完整 JSON 路径：约 2.1 秒后一次性出现；此前真实 UI 测试曾达到 3.7–4.9 秒；
- 开启流式但保留默认 thinking：先流出不可展示的推理，最终正文仍然晚；
- 流式 + `thinking: disabled` + 96 token 上限：三次首段正文 732/1008/892 ms，完整 897/1238/1089 ms。

当前保留 DeepSeek 和 `thinking: disabled`，但服务端等待生成完成后返回 JSON，前端只渲染一次。带书名和前后文的实测完整响应为 1.21 秒。[DeepSeek 官方文档](https://api-docs.deepseek.com/api/create-chat-completion)说明 V4 默认开启 thinking，并支持 `thinking: {type: "disabled"}`。

## 当前网络路径也会决定结果

从这台 Mac 对各 API 公共端点连续请求三次，测得未认证或公共请求的首字节基线：

| 端点 | 首字节范围 | 说明 |
| --- | ---: | --- |
| DeepSeek | 128–207 ms | 当前网络路径明显最近 |
| Groq | 1.15–1.29 s | 未含模型生成 |
| Cerebras | 1.10–1.60 s | 公共模型目录，未含模型生成 |
| Google Gemini | 1.01–1.16 s | 未含模型生成 |

这不是跨时间的通用 benchmark，只是当前设备和网络的现实基线。对于 50 词以内的输出，美国高速推理平台即使生成极快，也可能先损失约一秒网络时间。

## 低延迟 API 候选

### 1. 当前默认：DeepSeek V4 Flash

- 官方价格：cache miss 输入 $0.14/M、输出 $0.28/M；
- 284B 总参数、13B 激活参数；支持 thinking/non-thinking；
- 优点：当前网络路径最近、价格低、英文改写质量已经够用；
- 决策：完整 JSON、non-thinking、最多 96 token，继续作为当前默认。

来源：[DeepSeek V4 发布说明](https://api-docs.deepseek.com/news/news260424/)、[官方价格](https://api-docs.deepseek.com/quick_start/pricing/)。

### 2. 速度 A/B 首选：Cerebras GPT-OSS 120B

- 官方模型目录列出约 3000 tokens/s；
- 公共模型 API 当前价格为输入 $0.35/M、输出 $0.75/M；
- 120B 模型比小模型更有希望保留文学语气；
- 风险：当前网络首字节基线约 1.1 秒以上，短输出未必比优化后的 DeepSeek 更快。

来源：[Cerebras 模型目录](https://inference-docs.cerebras.ai/models/overview)、[Cerebras 公共模型 API](https://api.cerebras.ai/public/v1/models)。

### 3. 低价速度 A/B：Groq GPT-OSS 20B

- 官方标称约 1000 tokens/s；输入 $0.075/M、输出 $0.30/M；
- Llama 3.1 8B Instant 更便宜：560 tokens/s，$0.05/M 输入、$0.08/M 输出；
- 风险：20B/8B 是否能稳定保留作者语气，需要用真实书段评测，不能只看通用 benchmark。

来源：[Groq 官方模型与价格](https://console.groq.com/docs/models)、[Groq 延迟指南](https://console.groq.com/docs/production-readiness/optimizing-latency)。

### 4. 翻译向候选：Gemini 3.5 Flash-Lite

- Google 将它定位为面向 translation 和简单数据处理的高性价比 GA 模型；
- 标准价格为 $0.30/M 输入、$2.50/M 输出；
- 官方没有在价格页提供可直接比较的 TTFT/tokens/s；当前网络基线也约一秒，因此不是第一替换项。

来源：[Gemini 官方价格页](https://ai.google.dev/gemini-api/docs/pricing)。

## 本地推理

### 最新系列与“小模型”的边界

截至 2026-08-10，Qwen 官方仓库把 Qwen3.6 称为最新系列，但已开放权重的尺寸只有 27B 和 35B-A3B；Ollama 的 Q4 包分别约 17GB 和 24GB。官方在 2026-03-02 发布的 Qwen3.5 0.8B、2B、4B、9B，仍是最新的 9B 及以下开放权重。因此本轮没有把“3B 激活”的 Qwen3.6-35B-A3B误当成小文件模型，而是下载 Qwen3.5 4B/9B 做低延迟对照。

来源：[Qwen 官方仓库与发布时间](https://github.com/QwenLM/Qwen3.6)、[Qwen3.6 Ollama 量化尺寸](https://ollama.com/library/qwen3.6/tags)。

[Ollama 官方模型页](https://ollama.com/library/qwen3.5/tags)当前列出：

- Qwen3.5 4B Q4：3.4GB；
- Qwen3.5 9B Q4：6.6GB；
- Qwen3.5 27B INT4：16GB，Q4：17GB；
- Qwen3.5 27B MLX：20GB。

32GB M4 可以容纳 27B 的 4-bit 权重，但这个任务没有理由使用 256K context。[Ollama context 文档](https://docs.ollama.com/context-length)也说明上下文越大占用内存越多。当前实现若切到 Ollama，会固定 4K context、96 token 输出，并让模型常驻 30 分钟，避免每次冷加载。

推荐本地顺序：

1. Qwen3.5 9B Q4：第一实测对象，质量和占用更平衡；
2. Qwen3.5 4B Q4：作为“最快但可能丢语气”的下界；
3. 只有 9B 在真实段落上明显不够忠实，才测试 27B。

也可用 Apple 的 [MLX-LM](https://github.com/ml-explore/mlx-lm)，它原生面向 Apple Silicon、支持量化和流式生成；第一轮仍优先用已经安装的 Ollama，减少工具链变量。

### 2026-08-10 本机实测

设备为 32GB Apple M4，Ollama 0.32.6。已下载并校验：

- `qwen3.5:4b-q4_K_M`：3.4GB；运行时报告约 3.1GB、100% GPU；
- `qwen3.5:9b-q4_K_M`：6.6GB；运行时报告约 5.5GB、100% GPU；
- 两者都只使用 4096 context、96 token 上限、`think: false`，常驻 30 分钟。

先用一段冷启动，再用相同的五段英文障碍文本并发对照当前 DeepSeek。下表是五段常驻均值：

| 模型 | 首段可见 | 完整输出 | 生成速度 | 试验结论 |
| --- | ---: | ---: | ---: | --- |
| DeepSeek V4 Flash | 464–498 ms | 720–801 ms | 云端未直接换算 | 最快且最忠实，继续默认 |
| Qwen3.5 4B Q4 | 565 ms | 1437 ms | 27.3 tok/s | 可作离线兜底，语义偏移明显 |
| Qwen3.5 9B Q4 | 857 ms | 2540 ms | 17.2 tok/s | 比 4B 稍忠实，但仍慢且会加解释 |

冷启动不能代表每日连续阅读：9B 首段 7.26 秒、总计 9.66 秒，其中加载权重约 5.87 秒；4B 首段 10.07 秒、总计 11.28 秒，其中加载约 9.34 秒。异常的 4B 冷启动更慢与当时两个模型切换、统一内存状态有关，不能推导出 4B 天生加载更慢。

五段试验已经暴露了决定性的质量风险：

- 4B 把机械故障隐喻中的 `serious argument` 改成人与人的 `big fight`；
- 4B 擅自加入 `ending all debates`，并遗漏原文的 listen/compare 过程；
- 9B 也会把隐喻改成 `big fight`，或给 aesthetics 增添原文没有的解释；
- DeepSeek 在同样提示下基本保留了故障隐喻、动作顺序和句子边界。

结论：本地推理的网络延迟优势确实存在，但这台机器上的 4B/9B 生成速度和忠实度都没有超过已经优化的 DeepSeek。当前产品保持 DeepSeek 默认；4B 可作为断网兜底，9B保留用于后续更严格的 30 段评测，不自动切换。

## 不能只比速度：30 段 A/B

从正在阅读的书中匿名截取 30 个真实障碍段，每段只保留必要上下文，比较：

1. 完整结果时间；
2. B2 可读性；
3. 意义忠实度；
4. 文学语气保留；
5. 是否擅自解释或新增事实。

五段探索性测试已经完成；下一轮扩大到 30 段时，继续比较 DeepSeek 完整响应、Qwen3.5 4B 和 9B。只有拿到 Groq/Cerebras key 后，再加入云端速度对照。最终选择仍应基于真实段落，而不是供应商宣称的 tokens/s。
