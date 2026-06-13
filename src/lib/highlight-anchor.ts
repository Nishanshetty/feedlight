// Text-quote anchoring (W3C Web Annotation style): a highlight is stored as the
// exact quoted text plus ~30 chars of surrounding context, and re-anchored by
// searching the rendered article's concatenated text-node content. Survives
// re-extraction; ambiguous quotes are disambiguated by prefix/suffix matching.

export type TextAnchor = {
  quote: string;
  prefix: string | null;
  suffix: string | null;
};

const CONTEXT_LEN = 30;

type TextIndex = {
  text: string;
  starts: number[];
  nodes: Text[];
};

function buildIndex(container: HTMLElement): TextIndex {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = "";
  let n: Node | null;
  while ((n = walker.nextNode())) {
    nodes.push(n as Text);
    starts.push(text.length);
    text += (n as Text).data;
  }
  return { text, starts, nodes };
}

export function anchorFromRange(container: HTMLElement, range: Range): TextAnchor | null {
  const idx = buildIndex(container);
  let start = -1;
  let end = -1;
  for (let i = 0; i < idx.nodes.length; i++) {
    const node = idx.nodes[i];
    if (!range.intersectsNode(node)) continue;
    if (start < 0) {
      const so = node === range.startContainer ? range.startOffset : 0;
      start = idx.starts[i] + so;
    }
    const eo = node === range.endContainer ? range.endOffset : node.data.length;
    end = idx.starts[i] + eo;
  }
  if (start < 0 || end <= start) return null;
  const quote = idx.text.slice(start, end);
  if (!quote.trim()) return null;
  return {
    quote,
    prefix: idx.text.slice(Math.max(0, start - CONTEXT_LEN), start) || null,
    suffix: idx.text.slice(end, end + CONTEXT_LEN) || null,
  };
}

function rangeFromOffsets(idx: TextIndex, start: number, end: number): Range | null {
  const range = document.createRange();
  let startSet = false;
  for (let i = 0; i < idx.nodes.length; i++) {
    const ns = idx.starts[i];
    const ne = ns + idx.nodes[i].data.length;
    if (!startSet && start >= ns && start < ne) {
      range.setStart(idx.nodes[i], start - ns);
      startSet = true;
    }
    if (startSet && end > ns && end <= ne) {
      range.setEnd(idx.nodes[i], end - ns);
      return range;
    }
  }
  return null;
}

export function findRange(container: HTMLElement, anchor: TextAnchor): Range | null {
  const idx = buildIndex(container);
  const { quote, prefix, suffix } = anchor;

  const candidates: number[] = [];
  let pos = idx.text.indexOf(quote);
  while (pos >= 0) {
    candidates.push(pos);
    pos = idx.text.indexOf(quote, pos + 1);
  }
  if (candidates.length === 0) return null;

  let best = candidates[0];
  if (candidates.length > 1) {
    let bestScore = -1;
    for (const c of candidates) {
      let score = 0;
      if (prefix && idx.text.slice(Math.max(0, c - prefix.length), c) === prefix) score += 2;
      if (suffix && idx.text.slice(c + quote.length, c + quote.length + suffix.length) === suffix) score += 2;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
  }
  return rangeFromOffsets(idx, best, best + quote.length);
}

// Wrapping preserves text content (text nodes are only re-parented), so the
// concatenated index stays valid for subsequently applied highlights.
export function wrapRangeWithMarks(range: Range, highlightId: string, hasNote: boolean): void {
  const root = range.commonAncestorContainer;
  const scope = root.nodeType === Node.TEXT_NODE ? root.parentElement : (root as Element);
  if (!scope) return;

  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const segments: Array<{ node: Text; start: number; end: number }> = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (!range.intersectsNode(n)) continue;
    const node = n as Text;
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.data.length;
    if (end > start) segments.push({ node, start, end });
  }

  for (const seg of segments) {
    let target = seg.node;
    if (seg.start > 0) target = target.splitText(seg.start);
    if (seg.end - seg.start < target.data.length) target.splitText(seg.end - seg.start);
    const mark = document.createElement("mark");
    mark.className = "reader-highlight" + (hasNote ? " reader-highlight--noted" : "");
    mark.dataset.highlightId = highlightId;
    target.parentNode?.replaceChild(mark, target);
    mark.appendChild(target);
  }
}

export function unwrapHighlights(container: HTMLElement, highlightId?: string): void {
  const selector = highlightId
    ? `mark.reader-highlight[data-highlight-id="${highlightId}"]`
    : "mark.reader-highlight";
  container.querySelectorAll(selector).forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}
