import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { addFeed, upsertFeedItems } from "../lib/db";
import { v4 as uuidv4 } from "uuid";
import type { SubscribedFeed } from "../types/database";

type RecommendedFeed = {
  name: string;
  url: string;
  tagline: string;
};

type Category = {
  label: string;
  feeds: RecommendedFeed[];
};

const RECOMMENDED: Category[] = [
  {
    label: "Tech",
    feeds: [
      { name: "Hacker News", url: "https://news.ycombinator.com/rss", tagline: "The pulse of the tech community" },
      { name: "The Verge", url: "https://www.theverge.com/rss/index.xml", tagline: "Tech, culture & gadgets" },
      { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", tagline: "In-depth tech journalism" },
      { name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/", tagline: "Emerging tech and innovation" },
    ],
  },
  {
    label: "Science",
    feeds: [
      { name: "Quanta Magazine", url: "https://api.quantamagazine.org/feed/", tagline: "Math, physics, and life sciences" },
      { name: "NASA Breaking News", url: "https://www.nasa.gov/rss/dyn/breaking_news.rss", tagline: "Space exploration and discoveries" },
      { name: "Scientific American", url: "https://www.scientificamerican.com/platform/syndication/rss/", tagline: "Science for the curious mind" },
    ],
  },
  {
    label: "Design & Dev",
    feeds: [
      { name: "Smashing Magazine", url: "https://www.smashingmagazine.com/feed/", tagline: "Design and front-end development" },
      { name: "CSS-Tricks", url: "https://css-tricks.com/feed/", tagline: "Web design tips and techniques" },
      { name: "A List Apart", url: "https://alistapart.com/main/feed/", tagline: "Web standards and best practices" },
    ],
  },
  {
    label: "News",
    feeds: [
      { name: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml", tagline: "World news from the BBC" },
      { name: "Reuters", url: "https://feeds.reuters.com/Reuters/worldNews", tagline: "Impartial global reporting" },
      { name: "The Guardian", url: "https://www.theguardian.com/world/rss", tagline: "Independent journalism since 1821" },
    ],
  },
  {
    label: "Culture",
    feeds: [
      { name: "Kottke.org", url: "https://feeds.kottke.org/main", tagline: "The best of the web since 1998" },
      { name: "The Marginalian", url: "https://www.themarginalian.org/feed/", tagline: "Ideas on art, science & philosophy" },
      { name: "Wait But Why", url: "https://waitbutwhy.com/feed", tagline: "Long-form essays on everything" },
    ],
  },
];

type ParsedFeedItem = {
  id: string;
  guid: string;
  title: string | null;
  link: string | null;
  content: string | null;
  content_hash: string | null;
  published_at: string | null;
  author: string | null;
  thumbnail_url: string | null;
};

type ParsedFeed = {
  title: string | null;
  site_url: string | null;
  items: ParsedFeedItem[];
};

type FeedStatus = "idle" | "pending" | "done" | "error";

type Props = { feeds: SubscribedFeed[]; onFeedAdded: () => void };

export default function DiscoverView({ feeds, onFeedAdded }: Props) {
  const [statuses, setStatuses] = useState<Record<string, FeedStatus>>({});

  const subscribedUrls = new Set(feeds.map((f) => f.url));

  function setStatus(url: string, status: FeedStatus) {
    setStatuses((prev) => ({ ...prev, [url]: status }));
  }

  async function handleSubscribe(rec: RecommendedFeed) {
    setStatus(rec.url, "pending");
    try {
      const parsed = await invoke<ParsedFeed>("fetch_feed", { url: rec.url });
      const feedId = uuidv4();
      const subscriptionId = uuidv4();
      await addFeed(
        { id: feedId, url: rec.url, title: parsed.title ?? rec.name, site_url: parsed.site_url },
        null,
        subscriptionId
      );
      await upsertFeedItems(parsed.items.map((item) => ({ ...item, feed_id: feedId })));
      setStatus(rec.url, "done");
      onFeedAdded();
    } catch {
      setStatus(rec.url, "error");
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center border-b border-outline-variant/40 bg-background/80 backdrop-blur-xl px-6">
        <span className="font-headline text-lg font-bold tracking-[0.2em] text-primary uppercase">Discover</span>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-10">
          {RECOMMENDED.map(({ label, feeds: recs }) => (
            <section key={label}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[10px] font-label font-bold uppercase tracking-widest text-outline">{label}</span>
                <div className="flex-1 border-t border-outline-variant/30" />
              </div>
              <ul className="space-y-1">
                {recs.map((rec) => {
                  const alreadySubscribed = subscribedUrls.has(rec.url);
                  const status = alreadySubscribed ? "done" : (statuses[rec.url] ?? "idle");

                  return (
                    <li key={rec.url}
                      className="flex items-center justify-between gap-4 border border-outline-variant/40 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-body text-on-surface">{rec.name}</p>
                        <p className="text-[11px] font-label text-outline mt-0.5">{rec.tagline}</p>
                      </div>

                      {status === "done" ? (
                        <span className="shrink-0 flex items-center gap-1 text-[11px] font-label font-bold text-primary">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          Subscribed
                        </span>
                      ) : status === "error" ? (
                        <button onClick={() => handleSubscribe(rec)}
                          className="shrink-0 text-[11px] font-label font-bold text-error hover:underline">
                          Retry
                        </button>
                      ) : (
                        <button onClick={() => handleSubscribe(rec)} disabled={status === "pending"}
                          className="shrink-0 border border-outline-variant/60 px-3 py-1.5 text-[11px] font-label font-bold uppercase tracking-widest text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:opacity-40">
                          {status === "pending" ? "Adding…" : "+ Add"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
