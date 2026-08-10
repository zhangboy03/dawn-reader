import type { Metadata } from "next";
import "../src/styles.css";

export const metadata: Metadata = {
  title: "Dawn Reader",
  description: "A quiet reader for English originals with contextual plain-English help.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
