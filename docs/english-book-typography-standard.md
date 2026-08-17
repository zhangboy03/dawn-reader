# Dawn Reader 英文书排版规范

状态：`v1.1 · normative · core implemented`

制定日期：2026-08-17
适用范围：Dawn Reader 中以英文连续正文为主的 **reflowable EPUB、TXT 与 Markdown**。固定版式 EPUB、漫画、乐谱及主要依赖精确空间关系的出版物不适用本规范。

## 1. 目标

Dawn Reader 必须让来源不同、CSS 质量不同的英文书，首先呈现为稳定、安静、可连续阅读的“书”，同时保留标题、强调、诗歌、代码、表格、图片、脚注等内容的真实结构。

本规范中的“统一”不是把所有元素强行变成同一种样式，而是统一以下四件事：

1. 英文连续正文的字体、行长、行距、对齐、断词和段落节奏；
2. 特殊内容不被正文规则误伤；
3. Web 与 iPad 对同一本书采用相同的排版意图；
4. 读者始终能够调大文字、改变间距或切回更适合自己的对齐方式。

## 2. 研究结论

### 2.1 没有脱离条件的“最佳左右对齐”

Kindle 的 reflowable 英文正文默认采用两端对齐，但同时要求标题明确使用自己的对齐方式。Readium 也把 `text-align` 与 `hyphens` 视为一组设置：两端对齐若没有语言正确的自动断词，会产生明显的单词间“河流”和大空洞。

因此 Dawn 的默认策略是：

- 英文连续正文：**两端对齐 + 自动断词**；
- 缺少可靠英文语言信息或运行环境无法自动断词时：退回 **起始边对齐**，不允许以巨大词间距换取整齐右边缘；
- 标题、短列表、表格、代码、诗歌、图片说明等：不继承正文的强制两端对齐。

两端对齐是英文书的默认审美，不是不可取消的无障碍要求。Reader 必须提供“起始边对齐”选项，并将对齐与断词联动。

### 2.2 行长比“页边距数值”更重要

Readium CSS 2 以行长取代固定页边距作为核心布局变量，并以每行约 55 字符为理想值、40–70 字符为推荐工作区间。Dawn 也采用这个模型：屏幕变宽时优先增加页边空白或切为双页，而不是让一行无限增长。

### 2.3 Reader 负责正文基线，出版社负责语义差异

W3C EPUB Reading Systems 要求阅读器正常处理出版者 CSS，同时允许因用户操作覆盖部分样式。Dawn 的标准模式采用三层规则：

1. **内容语义层**：标题、引用、强调、诗歌、代码、表格、图片和脚注保持其结构与区别；
2. **Dawn 正文层**：纠正缺失、冲突或明显破坏阅读的正文样式；
3. **读者设置层**：字号、字体、行距、行长、主题、对齐和段落模式优先级最高。

以后应提供“Dawn 排版 / 出版社原版”切换。默认使用 Dawn 排版；原版用于设计意图很强或自动规范化判断错误的书。

## 3. 英文连续正文默认值

下表是 Dawn 标准模式的默认意图。平台可以用不同底层单位实现，但视觉结果必须相当。

| 项目 | 默认规范 | 可调范围或降级 |
| --- | --- | --- |
| 字体 | Iowan Old Style；后备 Baskerville、Georgia、系统 serif | 必须允许读者改用其他字体；不得依赖书内字体才能阅读 |
| 正文字号 | Web 19 CSS px；iPad 采用视觉等效的 1.0 scale | 至少支持默认值的 75%–200%；放大后必须重排 |
| 行距 | 1.55 | 常用选项 1.45 / 1.55 / 1.72 / 1.9；不得小于 1.4 |
| 行长 | 目标 55 字符 | 正常范围 40–70 字符；超过范围应改变版心或栏数 |
| 对齐 | `justify` | 仅在英文语言与自动断词可靠时启用；否则 `start` |
| 断词 | `hyphens: auto` | 必须由 `lang`/`xml:lang` 选择词典；不得把软连字符写入原文来伪造效果 |
| 字偶距 | `font-kerning: normal` | 正文不增加装饰性 `letter-spacing` |
| 换行优化 | `text-wrap: pretty` 渐进增强 | 不支持时自然降级；标题使用 `balance` 渐进增强 |
| 孤行控制 | `orphans: 2; widows: 2` | 引擎不支持时自然降级，不得用修改正文补偿 |
| 文字颜色 | 由纸白、暖纸、夜间主题成对提供 | 文字、链接、选区和背景必须一起换色并保持可辨识对比 |

### 3.1 断词的必要前提

自动断词只在下列条件同时满足时启用：

1. 包内 `dc:language` 或当前 XHTML 根元素声明 `en`、`en-US`、`en-GB` 等有效英语标签；
2. Reader 将语言传递给实际排版文档；
3. 渲染引擎对该语言有可用断词词典。

优先级为“当前元素语言 → XHTML 根语言 → EPUB 主语言”。书中局部法语、德语等片段必须保留自己的 `lang`，不能全部覆盖成英语。

支持时可使用以下渐进增强限制，减少难看的断词：

```css
hyphens: auto;
-webkit-hyphens: auto;
hyphenate-limit-chars: 6 3 3;
```

`hyphenate-limit-chars` 尚未在所有引擎中一致实现，因此它只能增强，不能成为正确排版的前提。

## 4. 段落与章节

### 4.1 默认采用书籍段落，而非网页段落

英文书的连续正文默认采用：

- 同一节内普通段落首行缩进 `1.25em`；
- 普通段落之间不额外留一整行空白；
- 章标题、节标题、场景分隔符、图片、表格、块引用之后的第一个正文段落不缩进；
- 书内已经明确标记为 `no-indent`、opening paragraph 或 scene break 的语义应保留。

不要同时使用明显首行缩进和明显段后空白。Readium 指出的两种有效段落体系是“缩进无段距”或“段距无缩进”；一本书应选定一种，不得因来源 CSS 混乱而随机混用。

课程讲义、文章合集等确实以 block paragraph 为结构单位的内容，可以使用：无首行缩进、段后 `0.75em`。这属于内容 profile，不得由单个段落临时猜测。

### 4.2 标题与分页

- `h1`–`h6` 必须使用 `start` 或来源明确指定的居中对齐，不断词；
- 标题行可使用 `text-wrap: balance`，但不得拉伸词间距；
- 标题应与随后至少一个正文块保持在同页；
- 新章可以另起页，普通小节不应制造大面积空白；
- 章节首段不得因 drop cap、small caps 或负边距而丢字、重叠或被裁切。

## 5. 不得被正文规则覆盖的内容

以下内容必须由语义优先，不得被一条全局 `p { ... !important }` 粗暴统一：

| 内容 | 规范 |
| --- | --- |
| 标题、题记、献词 | 保留明确的 start/center/end；默认不自动断词 |
| 诗歌、歌词、书信原格式 | 保留有意义的换行和缩进；允许水平滚动或缩小版心，不把每一行拉满 |
| 戏剧对白 | 保留人物名、舞台提示和悬挂缩进关系 |
| `pre`、`code`、公式 | 等宽或数学字体；保持空白语义；窄屏允许安全换行或局部滚动 |
| 表格 | 表头、列关系和数字对齐优先；不得对单元格短文本强制两端对齐 |
| 列表 | 标记与正文基线对齐；短条目使用 `start`，长条目可按正文 profile 排版 |
| 块引用 | 缩小版心并保持可辨识层级；不得叠加夸张字号缩小和低对比颜色 |
| 图片、图注、媒体卡 | 图片等比缩放；图注使用较短行长和 `start`/center，不强制两端对齐 |
| 脚注、尾注、参考文献 | 保留返回链接与编号；较小字号仍须可调，不得低于正文的约 80% |
| URL、DOI、长标识符 | 只在必要时安全折行；不得溢出到下一页栏；不得改写可复制文本 |
| RTL、CJK、竖排 | 进入对应语言 profile；禁用英文断词和英文段落规则 |

## 6. 响应式分页

### 6.1 栏数由可读行长决定

- 手机和窄窗口：单页；
- 平板竖屏：通常单页；
- 平板横屏和宽桌面：只有在每一页仍能保持约 40–70 字符/行时才采用双页；
- 不允许为了固定“双页感”把每栏压成报纸式窄列；
- 字号放大后应自动从双页退为单页。

### 6.2 版心与留白

版心应通过“目标行长 + 安全区 + 阅读控件”计算，不以书内任意 `body` margin 为准。正常正文的左右 padding 必须由 Reader 接管；内嵌图片、表格等可以在内容区内使用自己的局部宽度。

## 7. 用户设置与无障碍

Reader 至少必须允许读者改变：

- 字体与字号；
- 行距；
- 行长或等效的版心宽度；
- 纸白、暖纸、夜间主题；
- “两端对齐 + 断词”与“起始边对齐 + 可选断词”；
- 书籍段落与 block paragraph（高级设置）；
- Dawn 排版与出版社原版（后续设置）。

设置改变后必须保持视觉阅读位置，而不是只恢复到章节开头或粗略百分比。

WCAG 1.4.12 的含义是内容在读者把行距调到至少 1.5、段距调到 2em、字距调到 0.12em、词距调到 0.16em 时不能丢失内容或功能；它不是要求 Dawn 默认使用这些全部极值。Dawn 默认值追求连续阅读，设置上限与回归测试负责无障碍兼容。

## 8. 导入与规范化顺序

每个 reflowable EPUB 的渲染应按以下顺序处理：

1. 识别 layout；fixed-layout 直接退出本规范；
2. 读取 publication language、reading direction、writing mode；
3. 保留原始文件与正文，不修改可搜索、可复制的文本；
4. 识别语义元素和少量可靠角色/类别，如 poem、verse、code、table、footnote；
5. 注入 Dawn 基线与兼容补丁；
6. 应用该书的内容 profile；
7. 应用读者设置；
8. 重新分页并恢复 CFI/Locator 对应的视觉阅读位置。

禁止在导入时永久删除出版者 CSS。标准模式可以在渲染时覆盖它，但原文件必须保持可恢复。

## 9. Web 与 iPad 一致性合同

| 行为 | Web（EPUB.js） | iPad（Readium） | 一致性要求 |
| --- | --- | --- | --- |
| 字体与字号 | Reader theme/user override | `EPUBPreferences` | 默认视觉尺寸相当，设置档位同名 |
| 行距 | user override | `lineHeight` | 默认值和可选值一致 |
| 行长/双页 | viewport + pagination policy | line length/column policy | 相同窗口类型下不出现一端超长、一端过窄 |
| 对齐/断词 | language-aware CSS | `textAlign` + `hyphens` | 英文正文采用相同组合与降级条件 |
| 出版者样式 | Dawn override + exception layer | `publisherStyles` policy | 都保留特殊内容，不允许一端全关、一端半开而无补丁 |
| 位置恢复 | EPUB CFI | Readium Locator | 改设置后目标句仍处于原视觉区域附近 |

当前实现状态（2026-08-17）：

- Web 已实现 EPUB/XHTML 语言传递、英文正文两端对齐与断词、书籍/段间距模式、特殊内容例外、Calibre 段落型 `div` 识别和原版回退；
- iPad 已将相同设置映射到 Readium 3.9，改用响应式栏数，按 publication language 区分英语与其他语言，并注入相同的特殊内容例外；
- Web 与 iPad 均提供“两端/左齐”“书籍/段间距”“Dawn/原版”，并通过同步状态保存新增设置；
- Web 已用坏 CSS 测试 EPUB、真实英文书和中文书完成窄屏、平板竖屏、宽屏双页视觉验收；iPad 已完成编译和自动测试。

尚未完成的验证是 iPad 真机、VoiceOver、固定版式保护以及更大规模的特殊 EPUB 样本库。因此可以称“英文 reflowable EPUB 的核心规范已实现”，不得把范围扩大为所有语言或 fixed-layout 出版物。

## 10. 验收标准

### 10.1 自动检查

每次修改排版引擎至少验证：

- EPUB 的 `dc:language` 与 XHTML `lang`/`xml:lang` 是否存在并正确传递；
- 正文 computed style 的字体、行距、对齐和断词是否符合当前 profile；
- 标题、代码、表格、诗歌、图注没有继承正文两端对齐；
- 除明确允许的局部容器外，没有水平溢出；
- 字号 75%、100%、150%、200% 时内容不丢失；
- 主题切换和设置重排后，选择、搜索、CFI/Locator 与原始文本仍然有效。

### 10.2 视觉回归样本

固定测试书或测试章节必须覆盖：

1. 英文小说：长短段落、对白、章节首段、场景分隔；
2. 英文非虚构：多级标题、列表、引用、脚注；
3. 故意制作的坏 CSS EPUB：固定 px、超大 margin、错误全局居中、混合段距；
4. 长单词与不同英语地区标签；
5. 诗歌、代码、表格、公式、图片与长图注；
6. 局部法语/德语、RTL 与 CJK 片段；
7. fixed-layout EPUB，确认规范化不会误入。

每个样本至少检查窄屏、iPad 竖屏、iPad 横屏双页和桌面宽屏，以及纸白/暖纸/夜间、三个字号档位、两种对齐方式。

### 10.3 人工判定

以下任一情况都视为不合格：

- 两端对齐产生连续明显的巨大词间空隙；
- 单词在错误位置断开，或没有连字符却被硬拆；
- 每本书的普通正文呈现出不同字体、行距或段落节奏；
- 标题、诗歌、代码或表格被当成普通正文拉伸；
- 调整字号后当前句从视觉区域消失；
- 为了排版效果修改了原始文本、选区或搜索结果。

## 11. 实施优先级

1. 建立共享的 typography profile 数据模型与 Web/iPad 对照测试；
2. 先实现语言传递、英文正文 `justify + hyphens`、标题/特殊内容例外；
3. 统一默认行距、段落模型与行长驱动的栏数策略；
4. 加入“起始边对齐”和“出版社原版”开关；
5. 用真实书架中的好 EPUB、坏 EPUB 和特殊内容 EPUB 做视觉回归后，才将标准模式称为默认完成。

## 12. 主要依据

- [W3C EPUB 3.3](https://www.w3.org/TR/epub-33/)：reflowable/fixed-layout、出版物结构与语言元数据。
- [W3C EPUB Reading Systems 3.3](https://www.w3.org/TR/epub-rs-33/)：阅读器 CSS、出版者样式与用户覆盖的责任边界。
- [Readium CSS：User Settings and Themes](https://readium.org/css/docs/CSS12-user_prefs.html)：字体、行距、行长、对齐、断词与段落设置。
- [Readium CSS 2.0 release notes](https://blog.readium.org/release-note-readium-css-v2/)：40/55/70 字符行长模型与响应式栏数责任。
- [Readium CSS：User Settings Management](https://readium.org/css/docs/CSS14-user_settings_recs.html)：对齐例外、断词联动及两种有效段落体系。
- [Amazon Kindle Text Guidelines — Reflowable](https://kdp.amazon.com/en_US/help/topic/GH4DRT75GWWAGBTU)：英文 reflowable 正文默认两端对齐、标题例外及用户字体控制。
- [Apple Books — Best Practices for Fonts](https://help.apple.com/itc/booksassetguide/en.lproj/itcb303b7bb5.html)：流式图书的字体、字号和 justification 用户控制。
- [DAISY — Setting the Language](https://kb.daisy.org/publishing/docs/epub/language.html)：package、XHTML 与局部语言标记。
- [W3C CSS Text Module Level 4](https://www.w3.org/TR/css-text-4/)：对齐、换行和语言相关断词的标准行为。
- [W3C WCAG 2.2 — Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing)：可调文字间距时不得丢失内容或功能。
- [Butterick’s Practical Typography — Line length](https://practicaltypography.com/line-length.html)：英文正文 45–90 字符/行的较宽专业排版边界；Dawn 采用 Readium 更保守的 40–70。
