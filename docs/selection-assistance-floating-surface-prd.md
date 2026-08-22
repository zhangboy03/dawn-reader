# Dawn Reader 统一划线辅助浮窗 PRD

更新：2026-08-21

## 目标

EPUB、纯文本和 PDF 共用一套划线辅助系统。浮窗必须贴近用户实际结束划线的位置，同时始终保留可用的标题栏、关闭按钮和首段内容。任何选区、窗口尺寸或内容状态都不能把浮窗压成无法使用的一行细条。

## 问题与根因

旧书籍浮窗把 `Range.getBoundingClientRect()` 的联合矩形当作唯一锚点。跨行、跨栏选区会产生多个分离的 client rect；联合矩形可能覆盖大半个页面，导致上下可用空间计算失真。整张卡片再使用动态 `max-height` 和 `overflow:auto`，会把错误空间约束反馈给下一轮测量，最终形成截图中的底部细条。

PDF 虽然为高亮保存读取了 `getClientRects()`，却又把它们合并成联合框，并使用另一套命令式定位、样式和响应式规则。这让同一个用户动作在书籍和论文中表现为两个产品。

## 产品决策

统一的是外壳和行为，不是强行抹掉格式能力：

- EPUB/纯文本保留英文改写、中文详解和 Ask 对话。
- PDF 保留英文解释、按需中文和黄色本机高亮。
- 三种阅读内容共用端点锚定、碰撞处理、视口监听、标题/操作栏、正文滚动、关闭语义、键盘行为、日夜主题和移动端降级。
- 宽屏保持选区附近的非模态卡片；紧凑屏幕或上下空间都不足时，降级为安全区域内的底部卡片/边缘面板，不制造隐式折叠状态。

## 几何与布局规则

1. 从 `Range.getClientRects()` 读取真实片段，过滤零尺寸、离屏、重复和异常联合框。
2. 鼠标/触控笔优先选取最接近最终指针位置的片段；键盘或缺少端点时按选区方向选择 focus 端片段。
3. EPUB iframe 坐标必须同时换算偏移和缩放；PDF 从保存的 page-space quad 重新投影到当前缩放和滚动位置。
4. 宽屏优先在活动端点上方或下方放置。首选侧不足最小可用高度时翻转；横向始终限制在阅读安全区内。
5. 两侧都不足时使用显式 edge-panel；`<=720px` 使用 visual viewport、安全区和软键盘感知的 compact sheet。
6. 外壳固定标题/操作栏，仅正文区域滚动。异步回答增长不得改变锚点或形成测量振荡。

## 生命周期与交互

- 浮窗打开期间监听 window/`VisualViewport` resize 与 scroll、阅读区/PDF scroll、PDF zoom、EPUB reflow、选区变化和内容尺寸变化；关闭或替换选区时全部清理。
- 外部第一次 pointer down/up 由浮窗层完整消费，关闭浮窗但不能透传成 EPUB 翻页。
- `Escape` 关闭。宽屏不抢走阅读焦点；紧凑 Ask 卡片进入并约束焦点，关闭后返回合理位置。
- 触控操作目标保持至少 44 CSS px。浮窗内部滚动、选择和输入不触发阅读器手势。
- 浮窗在第一轮碰撞安全定位完成前保持隐藏，避免错误位置闪烁。

## 代码边界

- `src/lib/selectionAssistAnchor.ts`：Range rect 归一化、方向/端点选择、iframe 坐标。
- `src/lib/pdfSelectionAssistAnchor.ts`：PDF quad 到当前 viewport 的锚点重投影。
- `src/lib/selectionAssistPosition.ts`：above/below、flip/shift、edge-panel、compact-sheet 和尺寸约束。
- `src/lib/selectionAssistAutoUpdate.ts`：有界监听与清理。
- `src/components/selection-assist/`：共享 hook、外壳、焦点和 dismissal。
- `src/selection-assist.css`：统一设计语言；格式 CSS 只保留内容能力差异。

## 验收标准

- 跨栏联合框复现：旧算法只剩 98 px；端点锚定得到 420 px 可用卡片。
- 几何覆盖 320×568、390×844、768×1024、1024×768、1366×768、2340×1864 及所有边角。
- EPUB Rewrite、EPUB Ask、PDF Rewrite/Highlight 在宽屏、受限、紧凑、日间、夜间保持同一外壳语言。
- 当前主线本机验证：46/46 测试文件、234/234 测试通过；生产构建五阶段通过。
- 当前主线真实本地应用：跨栏 EPUB 反向划线浮窗完整显示；真实 PDF.js 大段划线浮窗完整显示，黄色标记入口保留。

## 证据边界

已验证的是本地 Web 测试、构建和浏览器交互。尚未验证生产部署、移动 Safari、实体 iPad/Apple Pencil 和原生 iOS 版本。本次没有推送或部署。

## 一手参考

- [CSSOM View Range geometry](https://www.w3.org/TR/cssom-view-1/)
- [MDN Range.getClientRects](https://developer.mozilla.org/en-US/docs/Web/API/Range/getClientRects)
- [Floating UI inline selections](https://floating-ui.com/docs/inline)
- [Floating UI virtual elements](https://floating-ui.com/docs/virtual-elements)
- [Floating UI flip, shift, size, autoUpdate](https://floating-ui.com/docs/flip)
- [Radix Popover collision and available size](https://www.radix-ui.com/primitives/docs/components/popover)
- [MDN VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)
- [Apple HIG Popovers](https://developer.apple.com/design/human-interface-guidelines/popovers/)
- [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
