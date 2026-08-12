# B2 阅读适配、模型选择与提示交互决策

更新时间：2026-08-10。价格和新模型变化很快，接入前必须重新核对官方页面。

## 当前产品决策

第一阶段采用 **API 优先、可随时切到本地模型** 的方式：

- 默认候选：DeepSeek V4 Flash API；
- 隐私与离线候选：Ollama + Qwen3.5 9B/27B；
- 对照候选：有 Meta Model API 访问资格时测试 Muse Spark 1.1；
- 不把应用绑定到任何一家：后端已经支持任意 OpenAI-compatible endpoint。

理由不是“API 永远比本地好”，而是我们的真实任务很窄：每次处理一个单词、短语或一句话，要求低延迟、稳定 JSON 和细腻英文解释。应先用便宜 API 快速收集 50–100 个真实卡点，再判断本地模型的隐私收益是否值得延迟和内存占用。

## 三个候选到底是什么

### DeepSeek V4 Flash

[DeepSeek 官方价格页](https://api-docs.deepseek.com/quick_start/pricing/)显示，当前 `deepseek-v4-flash` 支持 1M 上下文、JSON Output、Tool Calls 和 Responses API；cache miss 输入为 $0.14/百万 token，输出 $0.28/百万 token，cache hit 输入 $0.0028/百万 token。官方也明确预告未来可能显著涨价。

它对本产品的优势不是超长上下文，而是：短请求足够便宜，可以把“短释义、忠实改写、句子拆解”分成独立小调用，不必为了省钱把整章一次塞给模型。

### Meta Muse Spark 1.1

用户记忆里的名字基本正确：官方名称是 **Muse Spark 1.1**。[Meta 官方发布页](https://ai.meta.com/blog/introducing-muse-spark-meta-model-api/)称它是面向 agentic、computer-use、coding 和 multimodal 工作流的闭源模型，有 1M 上下文，并通过新的 Meta Model API public preview 提供。

官方发布页没有在正文给出 token 单价。[TokenCost 的当前目录](https://tokencost.app/models/muse-spark-1-1)列出 $1.25/百万输入、$4.25/百万输出，但这不是 Meta 的官方价目表，接入前需要在 Meta 控制台再次确认。它的强项比我们的需求更宽：长任务、工具调用和多模态并不会自动转化成更好的文学语义解释。因此它值得进入 A/B 测试，不应仅凭“Meta + 英文”直接成为默认模型。

关于网上出现的 Muse Spark 1.2：本轮只找到社区帖子，没有找到可核对的 Meta 官方发布页或稳定文档，因此暂不据此做架构决定。

### Qwen3.5-27B 本地

用户说的“3.8”更可能是 **Qwen3.5-27B**。[Qwen 官方模型卡](https://huggingface.co/Qwen/Qwen3.5-27B)标明它是 27B、Apache-2.0、原生 262,144 context，并支持 text-only 模式。[Ollama 当前模型页](https://ollama.com/library/qwen3.5/tags)提供约 17GB 的 `qwen3.5:27b` 和约 16GB 的 int4 版本。

在 32GB Apple Silicon 上，16–17GB 权重可以装下，并能留下约 15GB 给 macOS、Ollama 与 KV cache；但不能把“模型能装下”理解成“可以舒适跑满 256K 上下文”。本产品一次只需要短选区，限制在 8K–16K context 时是合理的。是否足够快，必须在这台 M4 上实测，不能从参数量推断。

更务实的本地顺序是：先用 6.6GB 的 Qwen3.5 9B 验证延迟；如果文学语义和忠实改写明显不够，再下载 27B。不要一开始就下载 17GB。

## 示例月成本

假设每天 100 次求助，每次平均 700 input token、120 output token，每月约 2.1M input + 0.36M output：

- DeepSeek V4 Flash：约 $0.40/月（未计缓存优惠）；
- Muse Spark 1.1：按第三方当前标价约 $4.16/月；
- 本地 Qwen：无 token 账单，但有模型下载、内存、耗电和较高首 token 延迟。

所以在个人晨读规模上，两种 API 都不贵；真正的决策变量是解释质量、延迟、区域可用性和是否接受把最多 1,200 字符的主动选区发给服务商。

## B2 不是一个静态标签，而是一套帮助策略

当前 B2 平衡模式遵循：

1. 单词：先给不超过约 45 个英文词的 contextual definition；
2. 短语：解释当前搭配，不展开所有词典义项；
3. 长句：先指出 core claim，再解释 modifier、connector 和 pronoun reference；
4. 不自动显示中文，原文始终保留；
5. 一段选择“略有挑战”代表处在目标区间，不立即降级；
6. 选择“明显吃力”时，下一处优先建议 sentence map；
7. 一页多次求助、连续多页都吃力，才考虑生成段落级 B2 companion text。

后续 learner model 应使用真实行为修正初始等级：每页求助次数、求助类型、同一 lemma/phrase 再次出现时是否仍求助，以及主观理解度。LexTALE 只负责冷启动。

## 成熟阅读器教会我们的提示交互

### Readest

[Readest](https://github.com/readest/readest)把选择动作分成轻量 quick action 与展开结果；其源码会根据工具数量控制 selection toolbar 宽度，词典浮层最大约 480×360，并在滚动时重新定位而非直接关闭。我们借鉴“先小后大”和桌面浮层/手机 sheet，不复制其 AGPL 源码。

### Foliate

[Foliate selection popover](https://github.com/johnfactotum/foliate/blob/gtk4/src/ui/selection-popover.ui)先只显示 Copy、Highlight、Find 等横向动作；Dictionary、Wikipedia、Translate 是第二层工具。我们借鉴“选区旁动作带”，但把最重要的三个动作改成 Meaning、Simpler、Sentence map。

### Flow

[Flow TextSelectionMenu](https://github.com/pacexy/flow/blob/main/apps/reader/src/components/TextSelectionMenu.tsx)根据选区方向和实际矩形把菜单放在文字上方，并用透明 overlay 处理退出。我们借鉴 selection anchoring，同时保留原文中的临时高亮，让提示与来源保持视觉联系。

### KOReader

[KOReader DictQuickLookup](https://github.com/koreader/koreader/blob/master/frontend/ui/widget/dictquicklookup.lua)强调长按后的快速查词，不让用户先经过复杂菜单。我们暂不自动弹出 AI，因为 B2 阅读需要更少打断；以后可把“单词选择后立即短释义”做成用户可开的 instant action。

## 本轮已经落实到界面

- 右侧提示不再永久占宽；
- 选中文字后先出现贴近选区的轻工具条；
- 请求解释后才滑出 margin note；手机端改为底部 sheet；
- EPUB 选区保留临时高亮，翻页时清理；
- 加入字号、行距、版心和纸色；
- 从 EPUB metadata 读取干净书名；
- IndexedDB 保存本地书籍，刷新后仍在书架；
- 加入进度滑杆与本地断点保存；
- B2 可手动确认，不必重复测试。
