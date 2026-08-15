export type EpubTocItem = {
  id: string;
  label: string;
  href: string;
  subitems: EpubTocItem[];
};

type RawTocItem = {
  label?: unknown;
  href?: unknown;
  subitems?: unknown;
};

export function tocHrefKey(href: string) {
  const withoutFragment = href.split("#", 1)[0]?.split("?", 1)[0] ?? "";
  try {
    return decodeURIComponent(withoutFragment).replace(/^(\.\.\/|\.\/)+/, "");
  } catch {
    return withoutFragment.replace(/^(\.\.\/|\.\/)+/, "");
  }
}

export function normalizeEpubToc(items: unknown, parentId = "toc"): EpubTocItem[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((candidate, index) => {
    const item = candidate as RawTocItem;
    const href = typeof item.href === "string" ? item.href.trim() : "";
    const label = typeof item.label === "string" ? item.label.replace(/\s+/g, " ").trim() : "";
    if (!href || !label) return [];
    const id = `${parentId}-${index}`;
    return [{
      id,
      label,
      href,
      subitems: normalizeEpubToc(item.subitems, id),
    }];
  });
}

export function tocItemIsCurrent(itemHref: string, currentHref: string) {
  const itemKey = tocHrefKey(itemHref);
  const currentKey = tocHrefKey(currentHref);
  return Boolean(itemKey && currentKey && itemKey === currentKey);
}
