const HLS_MIME_TYPE = "application/vnd.apple.mpegurl";

export type EpubHlsTarget = {
  element: HTMLVideoElement;
  source: string;
};

export type EpubImageTarget = {
  element: HTMLElement;
  source: string;
  label: string;
  caption: string;
  sourceHref: string;
};

export type EpubEmbedTarget = {
  element: HTMLButtonElement;
  source: string;
  title: string;
};

type PrepareEpubMediaOptions = {
  onImageActivate?: (target: EpubImageTarget) => void;
  onEmbedActivate?: (target: EpubEmbedTarget) => void;
  onIntrinsicSizeChange?: (element: HTMLElement) => void;
};

const TRUSTED_VIDEO_EMBED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "www.youtube-nocookie.com",
  "player.vimeo.com",
]);

export function isHlsSource(source: string) {
  return /\.m3u8(?:$|[?#])/i.test(source);
}

export function isEpubMediaControlTarget(target: EventTarget | null) {
  const element = target as { closest?: (selector: string) => Element | null } | null;
  return Boolean(element?.closest?.("img, picture, figure, video, audio, iframe, [data-dawn-media], [data-dawn-media-card], [data-dawn-image-action]"));
}

function normalizedHttpUrl(value: string, baseUrl: string) {
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function nearestPrecedingHeading(element: Element) {
  let cursor: Element | null = element;
  while (cursor) {
    let sibling = cursor.previousElementSibling;
    while (sibling) {
      if (sibling.matches("h1, h2, h3, h4, h5, h6")) return sibling.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const nested = Array.from(sibling.querySelectorAll("h1, h2, h3, h4, h5, h6")).at(-1);
      if (nested?.textContent?.trim()) return nested.textContent.replace(/\s+/g, " ").trim();
      sibling = sibling.previousElementSibling;
    }
    cursor = cursor.parentElement;
  }
  return "";
}

function imageTargetFromElement(image: HTMLImageElement, trigger: HTMLElement = image): EpubImageTarget {
  const figure = image.closest("figure");
  const caption = figure?.querySelector("figcaption")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const alt = image.getAttribute("alt")?.replace(/\s+/g, " ").trim() ?? "";
  const sectionTitle = nearestPrecedingHeading(figure ?? image);
  const sourceAnchor = image.closest<HTMLAnchorElement>("a[href]");
  const sourceUrl = sourceAnchor ? normalizedHttpUrl(sourceAnchor.href, image.ownerDocument.baseURI) : null;
  return {
    element: trigger,
    source: image.currentSrc || image.src,
    label: alt || caption || (sectionTitle ? `${sectionTitle} · 插图` : "插图"),
    caption,
    sourceHref: sourceUrl?.href ?? "",
  };
}

function isMeaningfulImage(image: HTMLImageElement) {
  if (image.getAttribute("aria-hidden") === "true" || image.getAttribute("role") === "presentation") return false;
  const width = Number(image.getAttribute("width") ?? 0);
  const height = Number(image.getAttribute("height") ?? 0);
  return Boolean(image.closest("figure") || image.getAttribute("alt")?.trim() || width >= 120 || height >= 120 || (!width && !height));
}

function addExternalFallback(element: HTMLElement, source: URL | null, label: string) {
  if (!source || element.nextElementSibling?.hasAttribute("data-dawn-media-fallback")) return;
  const link = element.ownerDocument.createElement("a");
  link.href = source.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  link.setAttribute("data-dawn-media-fallback", "external");
  element.insertAdjacentElement("afterend", link);
}

export function prepareEpubMediaDocument(document: Document, options: PrepareEpubMediaOptions = {}) {
  const hlsTargets: EpubHlsTarget[] = [];
  const imageTargets: EpubImageTarget[] = [];
  const embedTargets: EpubEmbedTarget[] = [];
  const cleanupCallbacks: Array<() => void> = [];
  const media = Array.from(document.querySelectorAll<HTMLElement>("video, audio, iframe, [data-dawn-media]:not(img)"));

  for (const image of Array.from(document.querySelectorAll<HTMLImageElement>("img"))) {
    image.loading = "lazy";
    image.decoding = "async";
    image.setAttribute("data-dawn-media", "image");
    const onLoad = () => options.onIntrinsicSizeChange?.(image);
    const onError = () => {
      image.setAttribute("data-dawn-media-state", "unavailable");
      options.onIntrinsicSizeChange?.(image);
    };
    image.addEventListener("load", onLoad);
    image.addEventListener("error", onError);
    cleanupCallbacks.push(() => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
    });

    if (!isMeaningfulImage(image)) continue;
    image.setAttribute("data-dawn-inspectable", "true");
    const launcher = document.createElement("button");
    launcher.type = "button";
    launcher.textContent = "查看大图";
    launcher.setAttribute("data-dawn-image-action", "open");
    launcher.setAttribute("aria-label", `查看大图：${imageTargetFromElement(image).label}`);
    const insertionPoint = image.closest("a") ?? image;
    insertionPoint.insertAdjacentElement("afterend", launcher);
    (image.closest("figure") ?? image.parentElement)?.setAttribute("data-dawn-media-root", "image");
    const activate = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      options.onImageActivate?.(imageTargetFromElement(image, launcher));
    };
    image.addEventListener("click", activate);
    launcher.addEventListener("click", activate);
    cleanupCallbacks.push(() => {
      image.removeEventListener("click", activate);
      launcher.removeEventListener("click", activate);
    });
    imageTargets.push(imageTargetFromElement(image, launcher));
  }

  for (const element of media) {
    const tagName = element.tagName.toLowerCase();
    element.setAttribute("data-dawn-media", tagName);
    if (tagName === "video" || tagName === "audio") {
      const mediaElement = element as HTMLMediaElement;
      mediaElement.controls = true;
      mediaElement.autoplay = false;
      mediaElement.removeAttribute("autoplay");
      if (tagName === "video") (mediaElement as HTMLVideoElement).playsInline = true;
      const onError = () => {
        element.setAttribute("data-dawn-media-state", "unavailable");
        options.onIntrinsicSizeChange?.(element);
      };
      const onMetadata = () => options.onIntrinsicSizeChange?.(element);
      mediaElement.addEventListener("error", onError);
      mediaElement.addEventListener("loadedmetadata", onMetadata);
      cleanupCallbacks.push(() => {
        mediaElement.removeEventListener("error", onError);
        mediaElement.removeEventListener("loadedmetadata", onMetadata);
      });

      const rawSource = element.dataset.dawnStream?.trim() || element.getAttribute("src")?.trim() || "";
      const sourceUrl = normalizedHttpUrl(rawSource, document.baseURI);
      const source = sourceUrl?.href ?? rawSource;
      mediaElement.preload = sourceUrl ? "none" : "metadata";
      addExternalFallback(element, sourceUrl, "媒体无法播放？在浏览器中打开");
      if (!source || !isHlsSource(source) || element.dataset.dawnMediaState === "attached") continue;
      if (mediaElement.canPlayType(HLS_MIME_TYPE)) {
        if (element.getAttribute("src") !== source) mediaElement.src = source;
        element.dataset.dawnMediaState = "native";
      } else if (tagName === "video") {
        element.removeAttribute("src");
        hlsTargets.push({ element: element as HTMLVideoElement, source });
      }
      continue;
    }

    if (tagName === "iframe") {
      const frame = element as HTMLIFrameElement;
      frame.loading = "lazy";
      frame.referrerPolicy = "no-referrer";
      if (!frame.title.trim()) frame.title = "嵌入式媒体";
      const rawSource = frame.getAttribute("src")?.trim() ?? "";
      const source = normalizedHttpUrl(rawSource, document.baseURI);
      if (rawSource && !source) {
        frame.removeAttribute("src");
        frame.setAttribute("data-dawn-media-state", "unavailable");
      }
      const trustedVideo = Boolean(source && TRUSTED_VIDEO_EMBED_HOSTS.has(source.hostname));
      frame.setAttribute("sandbox", trustedVideo
        ? "allow-scripts allow-same-origin allow-presentation"
        : "");
      frame.setAttribute("data-dawn-embed-policy", trustedVideo ? "trusted-video" : "restricted");
      frame.setAttribute("allowfullscreen", "allowfullscreen");
      frame.setAttribute("allow", trustedVideo ? "fullscreen; picture-in-picture; encrypted-media" : "fullscreen");
      const width = Number(frame.getAttribute("width") ?? 0);
      const height = Number(frame.getAttribute("height") ?? 0);
      frame.style.aspectRatio = width > 0 && height > 0 ? `${width} / ${height}` : "16 / 9";
      if (trustedVideo && source && options.onEmbedActivate) {
        const launcher = document.createElement("button");
        launcher.type = "button";
        launcher.textContent = "在阅读器中打开视频";
        launcher.setAttribute("data-dawn-embed-action", "open");
        const target: EpubEmbedTarget = { element: launcher, source: source.href, title: frame.title };
        const activate = (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          options.onEmbedActivate?.(target);
        };
        launcher.addEventListener("click", activate);
        cleanupCallbacks.push(() => launcher.removeEventListener("click", activate));
        frame.hidden = true;
        frame.removeAttribute("src");
        frame.setAttribute("data-dawn-embed-policy", "host-controlled");
        frame.insertAdjacentElement("afterend", launcher);
        addExternalFallback(launcher, source, "在浏览器中打开视频");
        embedTargets.push(target);
      } else {
        if (!trustedVideo) frame.hidden = true;
        addExternalFallback(frame, source, trustedVideo ? "在浏览器中打开视频" : "此嵌入内容受限，在浏览器中打开");
      }
    }
  }

  for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="http://"], a[href^="https://"]'))) {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }
  for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="javascript:"]'))) {
    anchor.removeAttribute("href");
    anchor.setAttribute("data-dawn-link-state", "blocked");
  }

  return {
    mediaCount: media.length,
    imageCount: imageTargets.length,
    imageTargets,
    embedTargets,
    hlsTargets,
    cleanup: () => cleanupCallbacks.splice(0).forEach((callback) => callback()),
  };
}
