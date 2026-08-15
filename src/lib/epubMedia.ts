const HLS_MIME_TYPE = "application/vnd.apple.mpegurl";

export type EpubHlsTarget = {
  element: HTMLVideoElement;
  source: string;
};

export function isHlsSource(source: string) {
  return /\.m3u8(?:$|[?#])/i.test(source);
}

export function isEpubMediaControlTarget(target: EventTarget | null) {
  const element = target as { closest?: (selector: string) => Element | null } | null;
  return Boolean(element?.closest?.("video, audio, iframe, [data-dawn-media], [data-dawn-media-card]"));
}

export function prepareEpubMediaDocument(document: Document) {
  const hlsTargets: EpubHlsTarget[] = [];
  const media = Array.from(document.querySelectorAll<HTMLElement>("video, audio, iframe, [data-dawn-media]"));

  for (const element of media) {
    const tagName = element.tagName.toLowerCase();
    element.setAttribute("data-dawn-media", tagName);
    if (tagName === "video" || tagName === "audio") {
      const mediaElement = element as HTMLMediaElement;
      mediaElement.controls = true;
      mediaElement.preload = "metadata";
      if (tagName === "video") (mediaElement as HTMLVideoElement).playsInline = true;

      const source = element.dataset.dawnStream?.trim() || element.getAttribute("src")?.trim() || "";
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
      frame.setAttribute("allowfullscreen", "allowfullscreen");
      const allowed = new Set((element.getAttribute("allow") ?? "").split(";").map((item) => item.trim()).filter(Boolean));
      allowed.add("fullscreen");
      allowed.add("picture-in-picture");
      frame.setAttribute("allow", [...allowed].join("; "));
    }
  }

  for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="http://"], a[href^="https://"]'))) {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }

  return { mediaCount: media.length, hlsTargets };
}
