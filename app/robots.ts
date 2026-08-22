import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/reader", "/join", "/admin/", "/api/"] },
    sitemap: "https://dawn-reader-keeplearning.zhangboy.chatgpt.site/sitemap.xml",
  };
}
