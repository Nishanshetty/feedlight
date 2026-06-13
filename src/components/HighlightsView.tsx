import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getAllHighlights, deleteHighlight } from "../lib/db";
import { getObsidianVaultPath } from "../lib/settings";
import type { HighlightWithArticle } from "../types/database";
import ArticlePane from "./ArticlePane";

type ArticleGroup = {
  itemId: string;
  title: string | null;
  link: string | null;
  feedTitle: string | null;
  highlights: HighlightWithArticle[];
};

function groupMarkdown(group: ArticleGroup): string {
  const lines: string[] = [`# ${group.title ?? "Untitled"}`, group.link ?? "", ""];
  for (const h of group.highlights) {
    lines.push(`> ${h.quote.trim().replace(/\s*\n\s*/g, " ")}`);
    if (h.note) lines.push("", h.note);
    lines.push("");
  }
  return lines.join("\n");
}

export default function HighlightsView() {
  const [all, setAll] = useState<HighlightWithArticle[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [vaultPath, setVaultPath] = useState("");
  const [exportStatus, setExportStatus] = useState<Record<string, "ok" | "error">>({});
  const [paneItem, setPaneItem] = useState<{ itemId: string; title: string | null; link: string } | null>(null);

  useEffect(() => {
    getAllHighlights().then(setAll).catch(console.error).finally(() => setLoaded(true));
    getObsidianVaultPath().then(setVaultPath).catch(() => {});
  }, []);

  const groups = useMemo<ArticleGroup[]>(() => {
    const map = new Map<string, ArticleGroup>();
    for (const h of all) {
      let g = map.get(h.item_id);
      if (!g) {
        g = { itemId: h.item_id, title: h.article_title, link: h.article_link, feedTitle: h.feed_title, highlights: [] };
        map.set(h.item_id, g);
      }
      g.highlights.push(h);
    }
    return Array.from(map.values());
  }, [all]);

  async function handleDelete(id: string) {
    try {
      await deleteHighlight(id);
      setAll((prev) => prev.filter((h) => h.id !== id));
    } catch (err) {
      console.error("Failed to delete highlight:", err);
    }
  }

  async function sendToObsidian(group: ArticleGroup) {
    try {
      await invoke<string>("export_markdown", {
        dir: vaultPath,
        filename: group.title ?? "Untitled",
        content: groupMarkdown(group),
      });
      setExportStatus((prev) => ({ ...prev, [group.itemId]: "ok" }));
    } catch (err) {
      console.error("Export failed:", err);
      setExportStatus((prev) => ({ ...prev, [group.itemId]: "error" }));
    }
    setTimeout(() => setExportStatus((prev) => {
      const next = { ...prev };
      delete next[group.itemId];
      return next;
    }), 3000);
  }

  return (
    <div className="p-6">
      <div className="mb-5 flex items-baseline gap-2">
        <h3 className="text-[11px] font-headline font-bold uppercase tracking-widest text-outline">
          Highlights
        </h3>
        {all.length > 0 && (
          <span className="text-[10px] font-label text-outline opacity-60">
            {all.length} across {groups.length} article{groups.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loaded && all.length === 0 && (
        <div className="px-6 py-20 text-center">
          <p className="text-[12px] font-label text-outline uppercase tracking-widest">
            No highlights yet. Select text while reading an article to create one.
          </p>
        </div>
      )}

      <div className="mx-auto max-w-3xl space-y-6">
        {groups.map((group) => (
          <section key={group.itemId} className="border border-outline-variant/40 bg-surface-container-lowest">
            <div className="flex items-start justify-between gap-3 border-b border-outline-variant/30 px-5 py-3">
              <div className="min-w-0">
                <button
                  onClick={() => group.link && setPaneItem({ itemId: group.itemId, title: group.title, link: group.link })}
                  className="block max-w-full truncate text-left text-sm font-headline font-semibold text-on-surface transition-colors hover:text-primary">
                  {group.title ?? "Untitled"}
                </button>
                {group.feedTitle && (
                  <p className="text-[10px] font-label uppercase tracking-widest text-outline">{group.feedTitle}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button onClick={() => navigator.clipboard.writeText(groupMarkdown(group)).catch(() => {})}
                  className="text-[11px] font-label text-on-surface-variant transition-colors hover:text-on-surface">
                  Copy
                </button>
                {vaultPath && (
                  <button onClick={() => sendToObsidian(group)}
                    className={`text-[11px] font-label transition-colors ${
                      exportStatus[group.itemId] === "ok" ? "text-primary"
                      : exportStatus[group.itemId] === "error" ? "text-error"
                      : "text-on-surface-variant hover:text-on-surface"}`}>
                    {exportStatus[group.itemId] === "ok" ? "Sent ✓"
                      : exportStatus[group.itemId] === "error" ? "Failed"
                      : "Send to Obsidian"}
                  </button>
                )}
              </div>
            </div>
            <ul className="divide-y divide-outline-variant/20">
              {group.highlights.map((h) => (
                <li key={h.id} className="group flex items-start gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="border-l-2 border-primary/40 pl-3 text-[13px] font-body leading-relaxed text-on-surface">
                      {h.quote.trim()}
                    </p>
                    {h.note && (
                      <p className="mt-1.5 pl-3 text-xs font-body text-on-surface-variant">{h.note}</p>
                    )}
                    <p className="mt-1 pl-3 text-[9px] font-label uppercase tracking-widest text-outline">
                      {new Date(h.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                  <button onClick={() => handleDelete(h.id)} aria-label="Delete highlight"
                    className="shrink-0 rounded p-1 text-outline opacity-0 transition-colors hover:text-error group-hover:opacity-100">
                    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" clipRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {paneItem && (
        <ArticlePane
          url={paneItem.link}
          title={paneItem.title}
          itemId={paneItem.itemId}
          onClose={() => {
            setPaneItem(null);
            getAllHighlights().then(setAll).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
