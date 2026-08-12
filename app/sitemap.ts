import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{
    url: "https://dawn-reader-keeplearning.zhangboy.chatgpt.site",
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 1,
  }];
}
