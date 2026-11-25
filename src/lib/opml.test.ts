import { describe, expect, it } from "vitest";

import { buildOpml } from "./opml";

function groups(): Map<string, Array<{ title: string; url: string; siteUrl: string | null }>> {
  return new Map([
    ["News", [{ title: "Hacker News", url: "https://news.ycombinator.com/rss", siteUrl: "https://news.ycombinator.com" }]],
    [
      "Blogs",
      [
        { title: "A & B", url: "https://a.example/feed.xml", siteUrl: null },
        { title: "Quoted \"one\"", url: "https://b.example/feed.xml", siteUrl: "https://b.example" },
      ],
    ],
  ]);
}

describe("buildOpml", () => {
  it("produces a valid OPML 2.0 envelope", () => {
    const xml = buildOpml(groups());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<opml version=\"2.0\">");
    expect(xml).toContain("<title>Feedlight Subscriptions</title>");
    expect(xml.trim().endsWith("</opml>")).toBe(true);
  });

  it("writes one outline per feed, with the folder as its parent", () => {
    const xml = buildOpml(groups());
    const rssLines = xml.split("\n").filter((l) => l.includes('type="rss"'));
    expect(rssLines).toHaveLength(3);
    expect(xml).toContain('<outline text="News" title="News">');
    expect(xml).toContain('xmlUrl="https://news.ycombinator.com/rss"');
  });

  it("omits htmlUrl when the feed has no site URL", () => {
    const xml = buildOpml(groups());
    expect(xml).toContain('xmlUrl="https://a.example/feed.xml"/>');
    expect(xml).toContain('xmlUrl="https://b.example/feed.xml" htmlUrl="https://b.example"');
  });

  it("escapes XML-significant characters in titles and URLs", () => {
    const xml = buildOpml(
      new Map([
        ["<F> & Co", [{ title: "Tom & Jerry <b>", url: "https://x.example/f?a=1&b=2", siteUrl: null }]],
      ])
    );
    expect(xml).toContain('<outline text="&lt;F&gt; &amp; Co" title="&lt;F&gt; &amp; Co">');
    expect(xml).toContain('text="Tom &amp; Jerry &lt;b&gt;"');
    expect(xml).toContain('xmlUrl="https://x.example/f?a=1&amp;b=2"');
    // Nothing unescaped may leak through.
    expect(xml).not.toContain("<F>");
    expect(xml).not.toContain("Jerry <b>");
  });

  it("produces a well-formed document for an empty subscription set", () => {
    const xml = buildOpml(new Map());
    expect(xml).toContain("<body>");
    expect(xml).toContain("</body>");
    expect(xml.match(/<outline/g) ?? []).toHaveLength(0);
  });
});
