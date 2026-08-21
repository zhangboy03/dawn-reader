import {
  installReadingSelectionController,
  type ReadingSelectionController,
} from './readingSelectionController';

const DIRECT_SURFACE_SELECTOR = [
  '[data-dawn-reading-surface]',
  '.pdf-reader',
  '.pdf-reader-container',
  '.reader-content',
  '.text-reader-content',
].join(',');

const controllers = new WeakMap<Element, ReadingSelectionController>();
const observedDocuments = new WeakSet<Document>();
const observers = new WeakMap<Document, MutationObserver>();
const installedFrames = new WeakSet<HTMLIFrameElement>();

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

function topLevelCandidates(candidates: Element[]): Element[] {
  return candidates.filter(candidate => !candidates.some(other => (
    other !== candidate && other.contains(candidate)
  )));
}

export function discoverReadingSurfaces(document: Document): Element[] {
  const candidates = Array.from(document.querySelectorAll(DIRECT_SURFACE_SELECTOR));
  return topLevelCandidates(candidates);
}

function disposeDisconnected(document: Document) {
  for (const surface of discoverReadingSurfaces(document)) {
    if (!surface.isConnected) {
      controllers.get(surface)?.destroy();
      controllers.delete(surface);
    }
  }
}

function installSurface(surface: Element) {
  if (controllers.has(surface)) return;
  controllers.set(surface, installReadingSelectionController(surface));
}

function sameOriginDocument(frame: HTMLIFrameElement): Document | null {
  try {
    return frame.contentDocument;
  } catch {
    return null;
  }
}

function isBookFrame(frame: HTMLIFrameElement): boolean {
  return Boolean(frame.closest('[data-dawn-reading-surface="book"], .epub-reader, .reader-content'));
}

function installFrame(frame: HTMLIFrameElement) {
  if (installedFrames.has(frame)) return;
  installedFrames.add(frame);
  const install = () => {
    const child = sameOriginDocument(frame);
    if (!child) return;
    if (isBookFrame(frame) && child.body) {
      child.body.setAttribute('data-dawn-reading-surface', 'epub');
    }
    observeDocument(child);
  };
  frame.addEventListener('load', install, { once: false });
  install();
}

function scan(document: Document) {
  discoverReadingSurfaces(document).forEach(installSurface);
  document.querySelectorAll('iframe').forEach(installFrame);
  disposeDisconnected(document);
}

function observeDocument(document: Document) {
  if (observedDocuments.has(document)) {
    scan(document);
    return;
  }
  observedDocuments.add(document);
  scan(document);
  const Observer = document.defaultView?.MutationObserver;
  if (!Observer) return;
  const observer = new Observer(records => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (!isElement(node)) continue;
        if (node.matches(DIRECT_SURFACE_SELECTOR)) installSurface(node);
        node.querySelectorAll(DIRECT_SURFACE_SELECTOR).forEach(installSurface);
        if (node.tagName === 'IFRAME') installFrame(node as HTMLIFrameElement);
        node.querySelectorAll('iframe').forEach(installFrame);
      }
      for (const node of Array.from(record.removedNodes)) {
        if (!isElement(node)) continue;
        const removed = [node, ...Array.from(node.querySelectorAll(DIRECT_SURFACE_SELECTOR))];
        removed.forEach(element => {
          controllers.get(element)?.destroy();
          controllers.delete(element);
        });
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  observers.set(document, observer);
}

export function autoInstallReadingSelection(document: Document = window.document) {
  observeDocument(document);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => autoInstallReadingSelection(document), { once: true });
  } else {
    autoInstallReadingSelection(document);
  }
}
