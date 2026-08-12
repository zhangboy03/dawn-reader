import type { Metadata } from "next";
import "../src/styles.css";
import "../src/landing-minimal.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://dawn-reader-keeplearning.zhangboy.chatgpt.site"),
  title: "Dawn Reader · 读原文。读下去。",
  description: "读原文。读下去。",
  openGraph: {
    title: "Dawn Reader · 读原文。读下去。",
    description: "读原文。读下去。",
    type: "website",
    locale: "zh_CN",
    images: [{ url: "/og.png", width: 1024, height: 1024, alt: "Dawn Reader 图标" }],
  },
  twitter: {
    card: "summary",
    title: "Dawn Reader · 读原文。读下去。",
    description: "读原文。读下去。",
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
