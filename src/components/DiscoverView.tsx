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
    label: "Tech & Engineering",
    feeds: [
      { name: "Cloudflare Blog", url: "https://blog.cloudflare.com/rss/", tagline: "How Cloudflare builds at scale" },
      { name: "Engineering at Meta", url: "https://engineering.fb.com/feed/", tagline: "Infrastructure and systems at Meta" },
      { name: "GitHub Blog", url: "https://github.blog/feed/", tagline: "Engineering and product from GitHub" },
      { name: "Stripe Blog", url: "https://stripe.com/blog/feed.rss", tagline: "Building financial infrastructure" },
      { name: "Netflix Tech Blog", url: "https://netflixtechblog.medium.com/feed", tagline: "Streaming at planet scale" },
      { name: "Airbnb Engineering", url: "https://medium.com/feed/airbnb-engineering", tagline: "Engineering and data science at Airbnb" },
      { name: "Fireship", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCsBjURrPoezykLs9EqgamOA", tagline: "Fast-paced web dev and tech" },
      { name: "ThePrimeagen", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC8ENHE5xdFSwx71u3fDH5Xw", tagline: "Programming, editors, and hot takes" },
      { name: "Computerphile", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC9-y-6csu5WGm29I7JiwpnA", tagline: "Computer science, explained" },
      { name: "Marques Brownlee", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCBJycsmduvYEL83R_U4JriQ", tagline: "Quality tech reviews (MKBHD)" },
    ],
  },
  {
    label: "AI",
    feeds: [
      { name: "Andrej Karpathy", url: "https://karpathy.github.io/feed.xml", tagline: "Deep learning, from the ground up" },
      { name: "Lilian Weng", url: "https://lilianweng.github.io/index.xml", tagline: "Deep dives into ML research" },
      { name: "Simon Willison", url: "https://simonwillison.net/atom/everything/", tagline: "LLMs, tools, and building in public" },
      { name: "Ahead of AI", url: "https://magazine.sebastianraschka.com/feed", tagline: "Sebastian Raschka on ML research" },
      { name: "Import AI", url: "https://importai.substack.com/feed", tagline: "Jack Clark's weekly AI digest" },
      { name: "Two Minute Papers", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCbfYPyITQ-7l4upoX8nvctg", tagline: "Latest AI research, distilled" },
      { name: "Yannic Kilcher", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCZHmQk67mSJgfCCTn7xBfew", tagline: "ML paper breakdowns" },
    ],
  },
  {
    label: "Science & Math",
    feeds: [
      { name: "Veritasium", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA", tagline: "Science and engineering, deeply explained" },
      { name: "Kurzgesagt", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCsXVk37bltHxD1rDPwtNM8Q", tagline: "Big questions, beautiful animation" },
      { name: "3Blue1Brown", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCYO_jab_esuFRV4b17AJtAw", tagline: "Mathematics, visualized" },
      { name: "Numberphile", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCoxcjq-8xIDTYp3uz647V5A", tagline: "Curious stories about numbers" },
      { name: "PBS Space Time", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC7_gcs09iThXybpVgjHZ_7g", tagline: "Physics and the cosmos" },
      { name: "Vsauce", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC6nSFpj9HTCZ5t-N3Rm3-HA", tagline: "The why, what, and how of everything" },
      { name: "SmarterEveryDay", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC6107grRI4m0o2-emgoDnAA", tagline: "Exploring the world through science" },
    ],
  },
  {
    label: "Founders & CEOs",
    feeds: [
      { name: "Sam Altman", url: "https://blog.samaltman.com/posts.atom", tagline: "Essays from the OpenAI CEO" },
      { name: "Paul Graham", url: "http://www.aaronsw.com/2002/feeds/pgessays.rss", tagline: "Essays on startups and curiosity" },
      { name: "DHH", url: "https://world.hey.com/dhh/feed.atom", tagline: "Basecamp co-founder, opinionated" },
      { name: "Jason Fried", url: "https://world.hey.com/jason/feed.atom", tagline: "On business, calm, and software" },
      { name: "Seth Godin", url: "https://seths.blog/feed/", tagline: "Daily ideas on marketing and work" },
      { name: "Fred Wilson (AVC)", url: "https://avc.com/feed/", tagline: "A VC on startups and venture" },
    ],
  },
  {
    label: "Psychology & Mind",
    feeds: [
      { name: "Astral Codex Ten", url: "https://www.astralcodexten.com/feed", tagline: "Scott Alexander on mind and society" },
      { name: "Psyche", url: "https://psyche.co/feed", tagline: "How to live well, from Aeon" },
      { name: "Nautilus", url: "https://nautil.us/feed/", tagline: "Science, philosophy, and human nature" },
      { name: "Farnam Street", url: "https://fs.blog/feed/", tagline: "Mental models and clear thinking" },
      { name: "The School of Life", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC7IcJI8PUf5Z3zKxnZvTBog", tagline: "Emotional intelligence and philosophy" },
      { name: "Academy of Ideas", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCiRiQGCHGjDLT9FQXFW0I3A", tagline: "Philosophy and psychology" },
    ],
  },
  {
    label: "Thinkers & Essays",
    feeds: [
      { name: "Marginal Revolution", url: "https://marginalrevolution.com/feed", tagline: "Tyler Cowen on economics and ideas" },
      { name: "The Marginalian", url: "https://www.themarginalian.org/feed/", tagline: "Ideas on art, science & philosophy" },
      { name: "Wait But Why", url: "https://waitbutwhy.com/feed", tagline: "Long-form essays on everything" },
      { name: "Stratechery", url: "https://stratechery.com/feed/", tagline: "Ben Thompson on tech strategy" },
      { name: "Aeon", url: "https://aeon.co/feed.rss", tagline: "Big questions in philosophy and culture" },
      { name: "TED", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCAuUUnT6oDeKwE6v1NGQxug", tagline: "Ideas worth spreading" },
      { name: "Big Think", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCvQECJukTDE2i6aCoMnS-Vg", tagline: "Experts on the big questions" },
      { name: "Lex Fridman", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCSHZKyawb77ixDdsGog4iWA", tagline: "Long-form conversations" },
      { name: "Wendover Productions", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC9RM-iSvTu1uPJb8X5yp3EQ", tagline: "How the world actually works" },
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

function Favicon({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  let host = "";
  try { host = new URL(url).hostname; } catch { /* ignore */ }

  // YouTube feeds all share one favicon, so show the YouTube play mark instead —
  // an unmistakable "this is a video channel" signal next to the article feeds.
  if (host.endsWith("youtube.com")) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#FF0000] text-white">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    );
  }

  if (failed || !host) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-primary-container text-sm font-headline font-bold text-on-primary-container">
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-9 w-9 shrink-0 rounded bg-surface-container-low object-contain p-0.5"
    />
  );
}

type Props = { feeds: SubscribedFeed[]; onFeedAdded: () => void };

export default function DiscoverView({ feeds, onFeedAdded }: Props) {
  const [statuses, setStatuses] = useState<Record<string, FeedStatus>>({});

  const subscribedUrls = new Set(feeds.map((f) => f.url));

  function setStatus(url: string, status: FeedStatus) {
    setStatuses((prev) => ({ ...prev, [url]: status }));
  }

  async function handleSubscribe(rec: RecommendedFeed, folder: string) {
    setStatus(rec.url, "pending");
    try {
      const parsed = await invoke<ParsedFeed>("fetch_feed", { url: rec.url });
      const feedId = uuidv4();
      const subscriptionId = uuidv4();
      await addFeed(
        { id: feedId, url: rec.url, title: parsed.title ?? rec.name, site_url: parsed.site_url },
        folder,
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
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {recs.map((rec) => {
                  const alreadySubscribed = subscribedUrls.has(rec.url);
                  const status = alreadySubscribed ? "done" : (statuses[rec.url] ?? "idle");

                  return (
                    <li key={rec.url}
                      className="group flex flex-col gap-3 border border-outline-variant/40 p-4 transition-colors hover:border-primary/50 hover:bg-surface-container-low/40">
                      <div className="flex items-start gap-3">
                        <Favicon url={rec.url} name={rec.name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-body font-medium text-on-surface">{rec.name}</p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] font-label text-outline">{rec.tagline}</p>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        {status === "done" ? (
                          <span className="flex items-center gap-1 text-[11px] font-label font-bold text-primary">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            Subscribed
                          </span>
                        ) : status === "error" ? (
                          <button onClick={() => handleSubscribe(rec, label)}
                            className="text-[11px] font-label font-bold text-error hover:underline">
                            Retry
                          </button>
                        ) : (
                          <button onClick={() => handleSubscribe(rec, label)} disabled={status === "pending"}
                            className="border border-outline-variant/60 px-3 py-1.5 text-[11px] font-label font-bold uppercase tracking-widest text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:opacity-40">
                            {status === "pending" ? "Adding…" : "+ Add"}
                          </button>
                        )}
                      </div>
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
