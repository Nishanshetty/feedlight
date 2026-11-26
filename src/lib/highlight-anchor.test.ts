import { afterEach, describe, expect, it } from "vitest";

import {
  anchorFromRange,
  findRange,
  unwrapHighlights,
  wrapRangeWithMarks,
} from "./highlight-anchor";

const mounted: HTMLElement[] = [];

function container(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  document.body.appendChild(el);
  mounted.push(el);
  return el;
}

afterEach(() => {
  mounted.splice(0).forEach((el) => el.remove());
});

function textOf(el: HTMLElement): string {
  return el.textContent ?? "";
}

/** Selects the nth occurrence of `needle` in the container's text (0-based). */
function rangeFor(el: HTMLElement, needle: string, nth = 0): Range {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);

  const full = nodes.map((node) => node.data).join("");
  let start = -1;
  for (let i = 0; i <= nth; i++) {
    start = full.indexOf(needle, start + 1);
    if (start < 0) throw new Error(`needle not found: ${needle}`);
  }
  const end = start + needle.length;

  const range = document.createRange();
  let offset = 0;
  let started = false;
  for (const node of nodes) {
    const next = offset + node.data.length;
    if (!started && start >= offset && start < next) {
      range.setStart(node, start - offset);
      started = true;
    }
    if (started && end > offset && end <= next) {
      range.setEnd(node, end - offset);
      return range;
    }
    offset = next;
  }
  throw new Error("range could not be built");
}

describe("anchorFromRange", () => {
  it("quotes the selection and captures surrounding context", () => {
    const el = container("<p>The quick brown fox jumps over the lazy dog.</p>");
    const anchor = anchorFromRange(el, rangeFor(el, "brown fox"))!;

    expect(anchor.quote).toBe("brown fox");
    expect(anchor.prefix).toBe("The quick ");
    expect(anchor.suffix).toBe(" jumps over the lazy dog.");
  });

  it("spans several text nodes across element boundaries", () => {
    const el = container("<p>alpha <strong>beta</strong> gamma</p>");
    const anchor = anchorFromRange(el, rangeFor(el, "pha beta g"))!;
    expect(anchor.quote).toBe("pha beta g");
  });

  it("returns null for a whitespace-only selection", () => {
    const el = container("<p>a  b</p>");
    const textNode = el.querySelector("p")!.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 1);
    range.setEnd(textNode, 3);
    expect(anchorFromRange(el, range)).toBeNull();
  });

  it("leaves prefix and suffix null at the edges of the article", () => {
    const el = container("<p>short</p>");
    const anchor = anchorFromRange(el, rangeFor(el, "short"))!;
    expect(anchor.prefix).toBeNull();
    expect(anchor.suffix).toBeNull();
  });
});

describe("findRange", () => {
  it("re-anchors a quote in a freshly rendered container", () => {
    const source = container(
      "<p>The quick brown fox jumps over the lazy dog.</p>",
    );
    const anchor = anchorFromRange(source, rangeFor(source, "brown fox"))!;

    const fresh = container(
      "<p>The quick brown fox jumps over the lazy dog.</p>",
    );
    const range = findRange(fresh, anchor);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe("brown fox");
  });

  it("picks the occurrence its prefix and suffix match when the quote is ambiguous", () => {
    const el = container(
      "<p>first: the recurring phrase appears here. second: the recurring phrase appears again.</p>",
    );
    // The quote itself repeats, so only the stored context says which one it is.
    const anchor = anchorFromRange(
      el,
      rangeFor(el, "the recurring phrase", 1),
    )!;
    expect(el.textContent!.split("the recurring phrase").length - 1).toBe(2);

    const range = findRange(el, anchor)!;
    expect(range.toString()).toBe("the recurring phrase");
    // The anchor was taken from the second occurrence: scoring must land there.
    const text = el.textContent!;
    expect(range.startOffset).toBe(text.lastIndexOf("the recurring phrase"));
  });

  it("falls back to the first occurrence when no context matches", () => {
    const el = container("<p>dup dup dup</p>");
    const range = findRange(el, { quote: "dup", prefix: null, suffix: null })!;
    expect(range.toString()).toBe("dup");
    expect(range.startOffset).toBe(0);
  });

  it("returns null when the quote is gone", () => {
    const el = container("<p>nothing here</p>");
    expect(
      findRange(el, { quote: "absent quote", prefix: null, suffix: null }),
    ).toBeNull();
  });
});

describe("wrapRangeWithMarks", () => {
  it("wraps the selection in a mark carrying the highlight id", () => {
    const el = container("<p>The quick brown fox jumps.</p>");
    wrapRangeWithMarks(
      findRange(el, {
        quote: "brown fox",
        prefix: "The quick ",
        suffix: " jumps.",
      })!,
      "h1",
      false,
    );

    const marks = el.querySelectorAll<HTMLModElement>("mark.reader-highlight");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("brown fox");
    expect(marks[0].dataset.highlightId).toBe("h1");
    expect(el.textContent).toBe("The quick brown fox jumps.");
  });

  it("marks every text node the range crosses", () => {
    const el = container("<p>alpha <strong>beta</strong> gamma</p>");
    wrapRangeWithMarks(rangeFor(el, "pha beta g"), "h2", true);

    const marks = el.querySelectorAll<HTMLModElement>("mark.reader-highlight");
    expect(marks).toHaveLength(3);
    expect(el.textContent).toBe("alpha beta gamma");
    expect(el.querySelector("mark.reader-highlight--noted")).not.toBeNull();
  });

  it("keeps the concatenated text stable so a second highlight still anchors", () => {
    const el = container("<p>one two three four</p>");
    wrapRangeWithMarks(rangeFor(el, "two"), "h1", false);
    const second = findRange(el, {
      quote: "three",
      prefix: "two ",
      suffix: " four",
    });
    expect(second).not.toBeNull();
    wrapRangeWithMarks(second!, "h2", false);

    expect(
      el.querySelectorAll<HTMLModElement>("mark.reader-highlight"),
    ).toHaveLength(2);
    expect(textOf(el)).toBe("one two three four");
  });
});

describe("unwrapHighlights", () => {
  it("removes one highlight and leaves the text intact", () => {
    const el = container("<p>one two three</p>");
    wrapRangeWithMarks(rangeFor(el, "two"), "h1", false);
    wrapRangeWithMarks(rangeFor(el, "three"), "h2", false);

    unwrapHighlights(el, "h1");
    expect(
      el.querySelectorAll<HTMLModElement>("mark.reader-highlight"),
    ).toHaveLength(1);
    expect(el.querySelector("mark[data-highlight-id='h2']")?.textContent).toBe(
      "three",
    );
    expect(textOf(el)).toBe("one two three");
  });

  it("removes every highlight when no id is given", () => {
    const el = container("<p>one two three</p>");
    wrapRangeWithMarks(rangeFor(el, "one"), "h1", false);
    wrapRangeWithMarks(rangeFor(el, "three"), "h2", false);

    unwrapHighlights(el);
    expect(el.querySelectorAll("mark")).toHaveLength(0);
    expect(textOf(el)).toBe("one two three");
  });
});
