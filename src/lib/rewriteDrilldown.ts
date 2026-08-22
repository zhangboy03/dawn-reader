export type RewriteDrilldownSelection = {
  selection: Selection;
  text: string;
};

/**
 * Read a native selection only when the complete range belongs to one
 * selectable rewrite result. This prevents a drag into the card chrome from
 * accidentally replacing the active reading selection.
 */
export function rewriteDrilldownSelection(
  root: HTMLElement,
): RewriteDrilldownSelection | null {
  const selection = root.ownerDocument.defaultView?.getSelection() ?? null;
  if (!selection?.rangeCount || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;

  const text = selection.toString().replace(/\s+/g, " ").trim();
  return text ? { selection, text } : null;
}
