# PDF 外观对比实验

日期：2026-08-22

调研基线：`b3eaa5bf01649279ea1d25c1e4f1a2b24bb34f67`

实现基线：`732c075`

状态：用户已选择整页处理；正式菜单已收敛为原色、暖纸、夜读。

## 结论

Dawn 的正式 PDF 外观使用整页处理：工具栏与页面周围同步换色，每个完整 PDF 页面应用显示滤镜。原色不使用滤镜，作为精确颜色基准。

页面处理采用以下候选参数：

- 暖纸：`brightness(0.90) sepia(0.06)`。
- 夜读：`brightness(0.72)`。

滤镜作用于每个 `.pdfViewer .page`，使 PDF canvas、文字选择与搜索层、批注表单、链接和 Dawn 高亮作为同一组同步变化。它不作用于整个长文档容器，不触发 PDF.js 重绘，也不创建第二份 canvas。

## 为什么不直接使用 PDF.js `pageColors`

PDF.js 6.2.108 把 `pageColors` 作为高对比度机制应用于已合成页面。实现会把页面转为亮度映射，再映射到前景色和背景色，因此照片、扫描件、彩色图表和透明内容都会一起改变。打开文档后直接修改 `PDFViewer.pageColors` 也不是受支持的可靠热切换路径。

CSS `brightness()` 的取舍更小、更可预测：

- 不反色；
- 不旋转色相；
- 不修改 PDF 文件；
- 原色可以立即恢复；
- 仍会改变所有屏幕像素，不能称为颜色忠实模式。

## 量化候选

| 模式 | 白色输入约变为 | 相对亮度 | 黑字对比度 | 说明 |
|---|---:|---:|---:|---|
| 原色 | `#FFFFFF` | `1.000` | `21.00:1` | 当前精确显示 |
| 暖纸 | `#EAE8E5` | `0.809` | `17.17:1` | 亮度约降低 19%，加入很轻的暖色 |
| 夜读 | `#B8B8B8` | `0.479` | `10.59:1` | 白色计算亮度约降低 52%，黑色保持黑色 |

这些是 sRGB/WCAG 计算值，不是屏幕 nits、医学结论或舒适度保证。

## 成熟产品与社区信号

调研覆盖 Adobe Acrobat、Foxit、Xodo、PDF Expert、Okular、SumatraPDF、Zotero、Readwise Reader、Notability、KOReader 等产品。共同模式是：

1. 应用界面暗色与 PDF 页面变化通常是两件事。
2. 页面滤镜必须保留 Original/Day 入口。
3. 图片和图表是最常见的失败点；成熟产品会提供图片例外、不同算法或明确警告。
4. 没有证据支持一种通用滤镜可以同时保持所有论文图表、照片、扫描件、透明内容和批注的原始颜色意义。

主要一手来源：

- [PDF.js 6.2.108 render API](https://raw.githubusercontent.com/mozilla/pdf.js/v6.2.108/src/display/api.js)
- [PDF.js canvas implementation](https://raw.githubusercontent.com/mozilla/pdf.js/v6.2.108/src/display/canvas.js)
- [PDF.js filter implementation](https://raw.githubusercontent.com/mozilla/pdf.js/v6.2.108/src/display/filter_factory.js)
- [PDF.js runtime pageColors issue #19687](https://github.com/mozilla/pdf.js/issues/19687)
- [W3C Filter Effects](https://www.w3.org/TR/filter-effects-1/)
- [Adobe Reader accessibility colors](https://helpx.adobe.com/reader/desktop/accessibility-features.html)
- [Xodo color modes](https://feedback.xodo.com/support/solutions/articles/35000202871-viewing-in-night-mode-dark-mode-sepia-mode-and-custom-color-mode)
- [PDF Expert Day, Night, Sepia](https://support.readdle.com/pdfexpert/en_US/reading-pdfs/turn-on-the-night-or-sepia-theme)
- [Okular accessibility color algorithms](https://docs.kde.org/trunk_kf6/en/okular/okular/configaccessibility.html)
- [SumatraPDF theme colors](https://www.sumatrapdfreader.org/docs/Customize-theme-colors)
- [Zotero 8 appearance](https://www.zotero.org/blog/zotero-8/)
- [Readwise Reader PDF behavior](https://docs.readwise.io/reader/docs/faqs/pdfs)
- [Notability content themes](https://support.gingerlabs.com/hc/en-us/articles/5106468945434-Content-Matches-Theme)
- [Doq PDF.js reader mode](https://github.com/shivaprsd/doq)

## 验收边界

自动化必须证明：

- 原色的页面滤镜恒为 `none`；
- 页面暖纸只使用 `brightness(0.90) sepia(0.06)`；
- 页面夜读只使用 `brightness(0.72)`，不含 `invert()` 或 `hue-rotate()`；
- 切换不调用 `PDFPageProxy.render`、`setDocument` 或新建 viewer/canvas；
- 页码、相对滚动位置、缩放、目录、搜索、选择、辅助卡和高亮状态不变；
- PDF 源文件与下载文件逐字节一致；
- 切换不产生 PDF 内容网络请求。

人工比较至少覆盖：

- 黑字白纸论文；
- 彩色科学图表与图例；
- 照片较多的 PDF；
- 灰度和彩色扫描件；
- 透明度与混合模式；
- 原生批注、表单、链接、搜索命中和选择；
- Dawn 黄色高亮和辅助卡；
- 密码、损坏页、大型文档与受限 canvas；
- authored dark page；
- 暗室环境下的白页亮度、阴影细节和一键原色检查。

## 已知风险

- 暖纸和夜读会改变所有屏幕像素；彩色图表必须回到原色核对。
- 夜读不是黑底白字，白页会变为中灰色。
- 暗部照片、浅灰扫描痕迹和原本就很暗的页面可能丢失细节。
- 整页滤镜会创建 stacking context，表单弹层、批注弹窗和浏览器原生控件必须实际测试。
- CSS 滤镜可能增加合成与 GPU 内存成本；长文档、高 DPR 和关闭硬件加速时需要性能检查。

正式 PDF 菜单只保留原色、暖纸、夜读三种色调；不再显示实验性的“环境 / 页面”选择。
