import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getOllamaSettings } from "../lib/settings";
import type { SubscribedFeed } from "../types/database";

type ResultItem = {
  title: string | null;
  link: string | null;
  published_at: string | null;
  author: string | null;
};

type ParsedFeed = {
  items: ResultItem[];
};

type QueryResult = {
  query: string;
  items: ResultItem[];
  error?: string;
};

type State =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "fetching"; queries: string[] }
  | { kind: "done"; results: QueryResult[] }
  | { kind: "error"; message: string };

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const hrs = Math.floor(diff / 3_600_000);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Props = { feeds: SubscribedFeed[] };

export default function DiscoverView({ feeds }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function discover() {
    setState({ kind: "generating" });

    try {
      const settings = await getOllamaSettings();
      const feedTitles = feeds.map((f) => f.title ?? f.url).filter(Boolean) as string[];

      let queries: string[];

      if (settings.enabled && feedTitles.length > 0) {
        try {
          queries = await invoke<string[]>("generate_discover_queries", {
            baseUrl: settings.url,
            model: settings.model,
            feedTitles,
          });
        } catch {
          queries = feedTitles.slice(0, 4);
        }
      } else {
        queries = feedTitles.slice(0, 4);
      }

      if (queries.length === 0) {
        setState({ kind: "error", message: "No feeds to discover from. Add some feeds first." });
        return;
      }

      setState({ kind: "fetching", queries });

      const results = await Promise.all(
        queries.map(async (query): Promise<QueryResult> => {
          try {
            const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
            const feed = await invoke<ParsedFeed>("fetch_feed", { url });
            return { query, items: feed.items.slice(0, 6) };
          } catch (e) {
            return { query, items: [], error: String(e) };
          }
        })
      );

      setState({ kind: "done", results });
    } catch (e) {
      setState({ kind: "error", message: String(e) });
    }
  }

  useEffect(() => { discover(); }, []);

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-outline-variant/40 bg-background/80 backdrop-blur-xl px-6">
        <span className="font-headline text-lg font-bold tracking-[0.2em] text-primary uppercase">Discover</span>
        {(state.kind === "done" || state.kind === "error") && (
          <button onClick={discover}
            className="text-[11px] font-label font-bold uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors">
            Refresh
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {state.kind === "idle" || state.kind === "generating" ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <p className="text-[11px] font-label uppercase tracking-widest text-outline animate-pulse">
              {state.kind === "generating" ? "Generating queries with AI…" : "Starting…"}
            </p>
          </div>
        ) : state.kind === "fetching" ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <p className="text-[11px] font-label uppercase tracking-widest text-outline animate-pulse">
              Fetching results…
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {state.queries.map((q) => (
                <span key={q} className="text-[10px] font-label px-2 py-0.5 border border-outline-variant/40 text-outline">
                  {q}
                </span>
              ))}
            </div>
          </div>
        ) : state.kind === "error" ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <p className="text-[11px] font-label uppercase tracking-widest text-error">{state.message}</p>
            <button onClick={discover}
              className="mt-2 border border-outline-variant/40 px-4 py-2 text-[11px] font-label font-bold uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors">
              Try Again
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-10">
            {state.results.map(({ query, items, error }) => (
              <section key={query}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-[10px] font-label font-bold uppercase tracking-widest text-outline">
                    {query}
                  </span>
                  <div className="flex-1 border-t border-outline-variant/30" />
                </div>

                {error ? (
                  <p className="text-[11px] font-label text-error px-1">{error}</p>
                ) : items.length === 0 ? (
                  <p className="text-[11px] font-label text-outline px-1">No results found.</p>
                ) : (
                  <ul className="space-y-2">
                    {items.map((item, i) => (
                      <li key={i}
                        className="group flex items-start justify-between gap-4 border border-outline-variant/40 px-4 py-3 hover:border-primary/40 transition-colors cursor-pointer"
                        onClick={() => item.link && openUrl(item.link)}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-body text-on-surface leading-snug group-hover:text-primary transition-colors line-clamp-2">
                            {item.title ?? "Untitled"}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {item.author && (
                              <span className="text-[10px] font-label text-outline truncate">{item.author}</span>
                            )}
                            {item.author && item.published_at && (
                              <span className="text-[10px] text-outline/50">·</span>
                            )}
                            {item.published_at && (
                              <span className="text-[10px] font-label text-outline shrink-0">
                                {formatRelative(item.published_at)}
                              </span>
                            )}
                          </div>
                        </div>
                        <svg className="h-3.5 w-3.5 shrink-0 mt-0.5 text-outline opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
