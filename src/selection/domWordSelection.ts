import { getWordBoundaries, wordAtOffset, type BoundaryAffinity } from './wordBoundary';

export interface DomPoint {
  node: Node;
  offset: number;
}

export const DEFAULT_ENDPOINT_WINDOW = 2048;

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'DD', 'DIV', 'DL', 'DT',
  'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5',
  'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION',
  'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
]);

const EXCLUDED_TEXT_SELECTOR = [
  'script', 'style', 'noscript', 'textarea', 'input', 'select', 'option',
  'a', 'button', 'label', 'audio', 'video', 'canvas',
  '[role="button"]', '[role="link"]',
  '[contenteditable="true"]', '[contenteditable="plaintext-only"]',
  '[aria-hidden="true"]', '.annotationLayer', '.linkAnnotation',
  '.dawn-selection-card', '[data-dawn-selection-control]', '[data-no-text-selection]',
].join(',');

type TextMap = {
  node: Text;
  flatStart: number;
  flatEnd: number;
};

type EndpointContext = {
  value: string;
  pointOffset: number;
  maps: TextMap[];
};

function ownerDocument(node: Node): Document | null {
  return node.nodeType === 9 ? (node as Document) : node.ownerDocument;
}

function maxOffset(node: Node): number {
  return node.nodeType === 3 || node.nodeType === 4
    ? (node.nodeValue?.length ?? 0)
    : node.childNodes.length;
}

function clampPoint(point: DomPoint): DomPoint {
  return { node: point.node, offset: Math.max(0, Math.min(point.offset, maxOffset(point.node))) };
}

function rootContains(root: Node, node: Node): boolean {
  return root === node || (typeof root.contains === 'function' && root.contains(node));
}

function isUsableText(node: Node): node is Text {
  if (node.nodeType !== 3 || !node.nodeValue) return false;
  const parent = node.parentElement;
  return !parent || !parent.closest(EXCLUDED_TEXT_SELECTOR);
}

function firstText(node: Node): Text | null {
  if (isUsableText(node)) return node;
  const document = ownerDocument(node);
  if (!document) return null;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
    acceptNode: candidate => isUsableText(candidate)
      ? NodeFilter.FILTER_ACCEPT
      : NodeFilter.FILTER_REJECT,
  });
  return walker.nextNode() as Text | null;
}

function lastText(node: Node): Text | null {
  if (isUsableText(node)) return node;
  const document = ownerDocument(node);
  if (!document) return null;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
    acceptNode: candidate => isUsableText(candidate)
      ? NodeFilter.FILTER_ACCEPT
      : NodeFilter.FILTER_REJECT,
  });
  let result: Text | null = null;
  let next: Node | null;
  while ((next = walker.nextNode())) result = next as Text;
  return result;
}

function resolveTextPoint(point: DomPoint, affinity: BoundaryAffinity): DomPoint | null {
  const clamped = clampPoint(point);
  if (isUsableText(clamped.node)) return clamped;

  const children = clamped.node.childNodes;
  if (affinity === 'forward') {
    for (let index = clamped.offset; index < children.length; index += 1) {
      const text = firstText(children[index]);
      if (text) return { node: text, offset: 0 };
    }
    for (let index = Math.min(clamped.offset, children.length) - 1; index >= 0; index -= 1) {
      const text = lastText(children[index]);
      if (text) return { node: text, offset: text.data.length };
    }
  } else {
    for (let index = Math.min(clamped.offset, children.length) - 1; index >= 0; index -= 1) {
      const text = lastText(children[index]);
      if (text) return { node: text, offset: text.data.length };
    }
    for (let index = clamped.offset; index < children.length; index += 1) {
      const text = firstText(children[index]);
      if (text) return { node: text, offset: 0 };
    }
  }
  return null;
}

function blockAncestor(node: Node, root: Node): Element | null {
  let element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  while (element && element !== root) {
    if (BLOCK_TAGS.has(element.tagName)) return element;
    element = element.parentElement;
  }
  return element === root && element.nodeType === 1 ? element : null;
}

function characterRect(text: Text, start: number, end: number): DOMRect | null {
  const document = text.ownerDocument;
  if (!document || start < 0 || end > text.length || start >= end) return null;
  try {
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, end);
    const rect = range.getBoundingClientRect();
    return rect && (rect.width || rect.height) ? rect : null;
  } catch {
    return null;
  }
}

function pdfSeparator(left: Text, right: Text): string {
  const leftLayer = left.parentElement?.closest('.textLayer');
  const rightLayer = right.parentElement?.closest('.textLayer');
  if (!leftLayer || leftLayer !== rightLayer || !left.data || !right.data) return '';

  const leftRect = characterRect(left, Math.max(0, left.length - 1), left.length);
  const rightRect = characterRect(right, 0, Math.min(1, right.length));
  if (!leftRect || !rightRect) return '';

  const height = Math.max(leftRect.height, rightRect.height, 1);
  const verticalDistance = Math.abs(
    (leftRect.top + leftRect.height / 2) - (rightRect.top + rightRect.height / 2),
  );
  if (verticalDistance > height * 0.65) return '\n';
  if (rightRect.left - leftRect.right > height * 0.25) return ' ';
  return '';
}

function separatorBetween(left: Text, right: Text, root: Node): string {
  if (/\s$/u.test(left.data) || /^\s/u.test(right.data)) return '';
  const pdf = pdfSeparator(left, right);
  if (pdf) return pdf;
  const leftBlock = blockAncestor(left, root);
  const rightBlock = blockAncestor(right, root);
  return leftBlock !== rightBlock ? '\n' : '';
}

function endpointContext(
  point: DomPoint,
  root: Node,
  affinity: BoundaryAffinity,
  windowSize: number,
): EndpointContext | null {
  if (!rootContains(root, point.node)) return null;
  const resolved = resolveTextPoint(point, affinity);
  if (!resolved || !rootContains(root, resolved.node)) return null;
  const center = resolved.node as Text;
  const document = ownerDocument(root);
  if (!document) return null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: candidate => isUsableText(candidate)
      ? NodeFilter.FILTER_ACCEPT
      : NodeFilter.FILTER_REJECT,
  });
  walker.currentNode = center;

  const before: Text[] = [];
  let beforeLength = 0;
  let previous: Node | null;
  while (beforeLength < windowSize && (previous = walker.previousNode())) {
    const text = previous as Text;
    before.unshift(text);
    beforeLength += text.length + 1;
  }

  walker.currentNode = center;
  const after: Text[] = [];
  let afterLength = 0;
  let next: Node | null;
  while (afterLength < windowSize && (next = walker.nextNode())) {
    const text = next as Text;
    after.push(text);
    afterLength += text.length + 1;
  }

  const nodes = [...before, center, ...after];
  const maps: TextMap[] = [];
  let value = '';
  let pointOffset = 0;
  nodes.forEach((text, index) => {
    if (index > 0) value += separatorBetween(nodes[index - 1], text, root);
    const flatStart = value.length;
    value += text.data;
    const flatEnd = value.length;
    maps.push({ node: text, flatStart, flatEnd });
    if (text === center) pointOffset = flatStart + Math.min(resolved.offset, text.length);
  });

  return { value, pointOffset, maps };
}

function flatPoint(context: EndpointContext, offset: number, affinity: BoundaryAffinity): DomPoint | null {
  if (affinity === 'forward') {
    for (const map of context.maps) {
      if (offset >= map.flatStart && offset < map.flatEnd) {
        return { node: map.node, offset: offset - map.flatStart };
      }
      if (offset === map.flatStart) return { node: map.node, offset: 0 };
    }
  } else {
    for (let index = context.maps.length - 1; index >= 0; index -= 1) {
      const map = context.maps[index];
      if (offset > map.flatStart && offset <= map.flatEnd) {
        return { node: map.node, offset: offset - map.flatStart };
      }
      if (offset === map.flatEnd) return { node: map.node, offset: map.node.length };
    }
  }
  return null;
}

function snapPoint(
  point: DomPoint,
  root: Node,
  edge: 'start' | 'end',
  locale?: string,
  windowSize = DEFAULT_ENDPOINT_WINDOW,
): DomPoint {
  const affinity: BoundaryAffinity = edge === 'start' ? 'forward' : 'backward';
  const context = endpointContext(point, root, affinity, windowSize);
  if (!context) return clampPoint(point);
  const word = wordAtOffset(getWordBoundaries(context.value, locale), context.pointOffset, affinity);
  if (!word) return clampPoint(point);
  return flatPoint(context, edge === 'start' ? word.start : word.end, affinity) ?? clampPoint(point);
}

export function compareDomPoints(left: DomPoint, right: DomPoint): number {
  if (left.node === right.node) return Math.sign(left.offset - right.offset);
  const document = ownerDocument(left.node);
  if (!document || document !== ownerDocument(right.node)) return 0;
  try {
    const leftRange = document.createRange();
    leftRange.setStart(left.node, Math.max(0, Math.min(left.offset, maxOffset(left.node))));
    leftRange.collapse(true);
    const rightRange = document.createRange();
    rightRange.setStart(right.node, Math.max(0, Math.min(right.offset, maxOffset(right.node))));
    rightRange.collapse(true);
    return Math.sign(leftRange.compareBoundaryPoints(0, rightRange));
  } catch {
    return 0;
  }
}

function setDirectionalSelection(selection: Selection, anchor: DomPoint, focus: DomPoint): boolean {
  try {
    selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
    return true;
  } catch {
    const document = ownerDocument(anchor.node);
    if (!document || document !== ownerDocument(focus.node)) return false;
    try {
      const forward = compareDomPoints(anchor, focus) <= 0;
      const range = document.createRange();
      const start = forward ? anchor : focus;
      const end = forward ? focus : anchor;
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      selection.removeAllRanges();
      selection.addRange(range);
      if (!forward && typeof selection.extend === 'function') {
        selection.collapse(anchor.node, anchor.offset);
        selection.extend(focus.node, focus.offset);
      }
      return true;
    } catch {
      return false;
    }
  }
}

/** Expand an active DOM Selection while retaining its anchor/focus direction. */
export function snapSelectionToWholeWords(
  selection: Selection,
  root: Node,
  locale?: string,
  windowSize = DEFAULT_ENDPOINT_WINDOW,
): boolean {
  if (!selection.anchorNode || !selection.focusNode || selection.isCollapsed) return false;
  if (!rootContains(root, selection.anchorNode) || !rootContains(root, selection.focusNode)) return false;

  const anchor = { node: selection.anchorNode, offset: selection.anchorOffset };
  const focus = { node: selection.focusNode, offset: selection.focusOffset };
  const forward = compareDomPoints(anchor, focus) <= 0;
  const snappedAnchor = snapPoint(anchor, root, forward ? 'start' : 'end', locale, windowSize);
  const snappedFocus = snapPoint(focus, root, forward ? 'end' : 'start', locale, windowSize);
  if (
    snappedAnchor.node === anchor.node
    && snappedAnchor.offset === anchor.offset
    && snappedFocus.node === focus.node
    && snappedFocus.offset === focus.offset
  ) return true;
  return setDirectionalSelection(selection, snappedAnchor, snappedFocus);
}

/** Clone and expand a document-order Range without modifying the supplied Range. */
export function expandRangeToWholeWords(
  range: Range,
  root: Node,
  locale?: string,
  windowSize = DEFAULT_ENDPOINT_WINDOW,
): Range {
  const expanded = range.cloneRange();
  if (range.collapsed || !rootContains(root, range.startContainer) || !rootContains(root, range.endContainer)) {
    return expanded;
  }
  const start = snapPoint(
    { node: range.startContainer, offset: range.startOffset }, root, 'start', locale, windowSize,
  );
  const end = snapPoint(
    { node: range.endContainer, offset: range.endOffset }, root, 'end', locale, windowSize,
  );
  try {
    expanded.setStart(start.node, start.offset);
    expanded.setEnd(end.node, end.offset);
  } catch {
    return range.cloneRange();
  }
  return expanded;
}
