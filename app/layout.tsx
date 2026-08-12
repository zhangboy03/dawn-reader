import type { Metadata } from "next";
import "../src/styles.css";
import "../src/landing-minimal.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://dawn-reader-keeplearning.zhangboy.chatgpt.site"),
  title: "Dawn Reader · 英文原著阅读器",
  description: "不是把英文书改简单，而是让你有能力继续读下去。原文优先，卡住才帮。",
  openGraph: {
    title: "Dawn Reader · 原文优先，卡住才帮",
    description: "为中文母语者做的开源英文原著阅读器。",
    type: "website",
    locale: "zh_CN",
    images: [{ url: "/og.png", width: 1024, height: 1024, alt: "Dawn Reader 图标" }],
  },
  twitter: {
    card: "summary",
    title: "Dawn Reader · 原文优先，卡住才帮",
    description: "为中文母语者做的开源英文原著阅读器。",
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
