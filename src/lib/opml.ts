import { getSubscribedFeeds } from "./db";

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildOpml(
  groups: Map<string, Array<{ title: string; url: string; siteUrl: string | null }>>
): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    "  <head>",
    "    <title>Feedlight Subscriptions</title>",
    `    <dateCreated>${new Date().toUTCString()}</dateCreated>`,
    "  </head>",
    "  <body>",
  ];
  for (const [folder, entries] of groups) {
    lines.push(`    <outline text="${escapeXml(folder)}" title="${escapeXml(folder)}">`);
    for (const e of entries) {
      const htmlAttr = e.siteUrl ? ` htmlUrl="${escapeXml(e.siteUrl)}"` : "";
      lines.push(`      <outline type="rss" text="${escapeXml(e.title)}" title="${escapeXml(e.title)}" xmlUrl="${escapeXml(e.url)}"${htmlAttr}/>`);
    }
    lines.push("    </outline>");
  }
  lines.push("  </body>", "</opml>");
  return lines.join("\n");
}

/**
 * Builds an OPML backup of all subscribed feeds and triggers a file download.
 * Returns the number of feeds exported (0 if there are no subscriptions, in
 * which case no file is downloaded).
 */
export async function exportFeedsToOpml(): Promise<number> {
  const feeds = await getSubscribedFeeds();
  if (feeds.length === 0) return 0;

  const groups = new Map<string, Array<{ title: string; url: string; siteUrl: string | null }>>();
  for (const feed of feeds) {
    const folder = feed.folder ?? "Uncategorized";
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder)!.push({ title: feed.title ?? feed.url, url: feed.url, siteUrl: feed.site_url });
  }

  const xml = buildOpml(groups);
  const blob = new Blob([xml], { type: "text/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `feedlight-${new Date().toISOString().slice(0, 10)}.opml`;
  a.click();
  URL.revokeObjectURL(url);
  return feeds.length;
}
