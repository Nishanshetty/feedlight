import { invoke } from "@tauri-apps/api/core";
import { getSubscribedFeeds, upsertFeedItems, updateFeedMeta } from "./db";
import type { FeedItemInsert } from "../types/database";

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

export async function refreshAllFeeds(): Promise<{ newItems: number; total: number }> {
  const feeds = await getSubscribedFeeds();
  let newItems = 0;

  for (const feed of feeds) {
    try {
      const parsed = await invoke<ParsedFeed>("fetch_feed", { url: feed.url });

      const insertItems: FeedItemInsert[] = parsed.items.map((item) => ({
        id: item.id,
        feed_id: feed.id,
        title: item.title,
        link: item.link,
        content: item.content,
        published_at: item.published_at,
        guid: item.guid,
        content_hash: item.content_hash,
        author: item.author,
        thumbnail_url: item.thumbnail_url,
      }));

      await upsertFeedItems(insertItems);
      newItems += insertItems.length;

      await updateFeedMeta(feed.id, {
        last_fetched_at: new Date().toISOString(),
        etag: null,
      });
    } catch (err) {
      console.error(`Failed to refresh feed ${feed.url}:`, err);
    }
  }

  return { newItems, total: feeds.length };
}
