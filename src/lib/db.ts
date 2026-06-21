import Database from "@tauri-apps/plugin-sql";
import { v4 as uuidv4 } from "uuid";
import type {
  SubscribedFeed,
  TimelineItem,
  TimelineOptions,
  FeedAnalytics,
  FeedItemInsert,
  DigestItem,
  Highlight,
  HighlightWithArticle,
} from "../types/database";

const DB_PATH = "sqlite:feedlight.db";

let _db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!_db) {
    _db = await Database.load(DB_PATH);
  }
  return _db;
}

// ─── Feeds ────────────────────────────────────────────────────────────────────

export async function getSubscribedFeeds(): Promise<SubscribedFeed[]> {
  const db = await getDb();
  const rows = await db.select<
    Array<{
      id: string;
      url: string;
      title: string | null;
      site_url: string | null;
      last_fetched_at: string | null;
      etag: string | null;
      fetch_interval: number;
      created_at: string;
      folder: string | null;
      subscription_id: string;
    }>
  >(
    `SELECT f.*, s.folder, s.id AS subscription_id
     FROM feeds f
     JOIN subscriptions s ON s.feed_id = f.id
     ORDER BY s.folder NULLS LAST, f.title COLLATE NOCASE`
  );
  return rows;
}

export async function addFeed(
  feedData: {
    id: string;
    url: string;
    title: string | null;
    site_url: string | null;
  },
  folder: string | null,
  subscriptionId: string
): Promise<void> {
  const db = await getDb();
  // Stamp last_fetched_at now: addFeed is only ever called right after a
  // successful fetch_feed, so the feed has been fetched and shouldn't be flagged
  // as a sync failure before the first background crawl.
  await db.execute(
    `INSERT INTO feeds (id, url, title, site_url, last_fetched_at)
     VALUES ($1, $2, $3, $4, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT (url) DO UPDATE SET
       title           = excluded.title,
       site_url        = excluded.site_url,
       last_fetched_at = excluded.last_fetched_at`,
    [feedData.id, feedData.url, feedData.title, feedData.site_url]
  );
  await db.execute(
    `INSERT INTO subscriptions (id, feed_id, folder) VALUES ($1, $2, $3)
     ON CONFLICT (feed_id) DO NOTHING`,
    [subscriptionId, feedData.id, folder]
  );
}

export async function deleteFeed(feedId: string): Promise<void> {
  const db = await getDb();
  // Cascade deletes subscription; feed row kept if other users existed (future-proof).
  await db.execute(`DELETE FROM subscriptions WHERE feed_id = $1`, [feedId]);
  // Remove feed only if no other subscriptions reference it (none in single-user, but safe).
  await db.execute(
    `DELETE FROM feeds WHERE id = $1
     AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE feed_id = $2)`,
    [feedId, feedId]
  );
}

export async function updateFeedFolder(feedId: string, folder: string | null): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE subscriptions SET folder = $1 WHERE feed_id = $2`, [folder, feedId]);
}

/**
 * Factory reset: removes every row from all data tables, returning the database
 * to its first-launch (empty) state. Deletes are run in FK-safe dependency order
 * so the wipe is complete regardless of whether the `foreign_keys` pragma is on.
 */
export async function eraseAllData(): Promise<void> {
  const db = await getDb();
  for (const table of ["highlights", "item_takeaways", "item_content", "item_states", "feed_items", "subscriptions", "feeds"]) {
    await db.execute(`DELETE FROM ${table}`);
  }
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export async function getTimelineItems(opts: TimelineOptions): Promise<TimelineItem[]> {
  const { feedIds, cursor, since, limit, unreadOnly, starredOnly, query } = opts;

  if (feedIds.length === 0) return [];

  const db = await getDb();
  const placeholders = feedIds.map((_, i) => `$${i + 1}`).join(", ");
  const baseParams: unknown[] = [...feedIds];

  let idx = feedIds.length + 1;
  baseParams.push(cursor);
  const cursorParam = `$${idx++}`;

  let sinceClause = "";
  if (since) {
    baseParams.push(since);
    sinceClause = `AND fi.published_at >= $${idx++}`;
  }

  let unreadClause = "";
  if (unreadOnly) {
    unreadClause = `AND COALESCE(ist.is_read, 0) = 0`;
  }

  let starredClause = "";
  if (starredOnly) {
    starredClause = `AND COALESCE(ist.is_starred, 0) = 1`;
  }

  let searchClause = "";
  if (query?.trim()) {
    const escaped = query.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
    baseParams.push(`%${escaped}%`);
    searchClause = `AND (fi.title LIKE $${idx} ESCAPE '\\' OR fi.content LIKE $${idx} ESCAPE '\\')`;
    idx++;
  }

  const rows = await db.select<
    Array<{
      id: string;
      title: string | null;
      link: string | null;
      content: string | null;
      published_at: string | null;
      feed_id: string;
      author: string | null;
      thumbnail_url: string | null;
      feed_title: string | null;
      is_read: number;
      is_saved: number;
      is_starred: number;
      read_progress: number;
    }>
  >(
    `SELECT
       fi.id, fi.title, fi.link, fi.content, fi.published_at,
       fi.feed_id, fi.author, fi.thumbnail_url,
       f.title AS feed_title,
       COALESCE(ist.is_read,    0) AS is_read,
       COALESCE(ist.is_saved,   0) AS is_saved,
       COALESCE(ist.is_starred, 0) AS is_starred,
       COALESCE(ist.read_progress, 0) AS read_progress
     FROM feed_items fi
     JOIN feeds f ON f.id = fi.feed_id
     LEFT JOIN item_states ist ON ist.item_id = fi.id
     WHERE fi.feed_id IN (${placeholders})
       AND fi.published_at < ${cursorParam}
       ${sinceClause}
       ${unreadClause}
       ${starredClause}
       ${searchClause}
     ORDER BY fi.published_at DESC
     LIMIT $${idx}`,
    [...baseParams, limit]
  );

  return rows.map((r) => ({
    ...r,
    is_read: r.is_read === 1,
    is_saved: r.is_saved === 1,
    is_starred: r.is_starred === 1,
  }));
}

export async function getTotalUnreadCount(feedIds: string[], since: string | null = null): Promise<number> {
  if (feedIds.length === 0) return 0;
  const db = await getDb();
  const placeholders = feedIds.map((_, i) => `$${i + 1}`).join(", ");
  const params: unknown[] = [...feedIds];

  let sinceClause = "";
  if (since) {
    params.push(since);
    sinceClause = `AND fi.published_at >= $${params.length}`;
  }

  const rows = await db.select<Array<{ count: number }>>(
    `SELECT COUNT(*) AS count
     FROM feed_items fi
     LEFT JOIN item_states ist ON ist.item_id = fi.id
     WHERE fi.feed_id IN (${placeholders})
       ${sinceClause}
       AND COALESCE(ist.is_read, 0) = 0`,
    params
  );
  return rows[0]?.count ?? 0;
}

export async function getUnreadCountsByFeed(feedIds: string[]): Promise<Record<string, number>> {
  if (feedIds.length === 0) return {};
  const db = await getDb();
  const placeholders = feedIds.map((_, i) => `$${i + 1}`).join(", ");

  const rows = await db.select<Array<{ feed_id: string; count: number }>>(
    `SELECT fi.feed_id, COUNT(*) AS count
     FROM feed_items fi
     LEFT JOIN item_states ist ON ist.item_id = fi.id
     WHERE fi.feed_id IN (${placeholders})
       AND COALESCE(ist.is_read, 0) = 0
     GROUP BY fi.feed_id`,
    [...feedIds]
  );
  return Object.fromEntries(rows.map((r) => [r.feed_id, r.count]));
}

// ─── Item states ──────────────────────────────────────────────────────────────

export async function upsertItemState(
  itemId: string,
  patch: Partial<{ is_read: boolean; is_saved: boolean; is_starred: boolean; read_progress: number }>
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO item_states (item_id, is_read, is_saved, is_starred, read_progress, updated_at)
     VALUES ($1, COALESCE($2, 0), COALESCE($3, 0), COALESCE($4, 0), COALESCE($5, 0), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
     ON CONFLICT (item_id) DO UPDATE SET
       is_read       = COALESCE($2, is_read),
       is_saved      = COALESCE($3, is_saved),
       is_starred    = COALESCE($4, is_starred),
       read_progress = COALESCE($5, read_progress),
       updated_at    = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
    [
      itemId,
      patch.is_read    !== undefined ? (patch.is_read    ? 1 : 0) : null,
      patch.is_saved   !== undefined ? (patch.is_saved   ? 1 : 0) : null,
      patch.is_starred !== undefined ? (patch.is_starred ? 1 : 0) : null,
      patch.read_progress ?? null,
    ]
  );
}

export async function getItemProgress(itemId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<Array<{ read_progress: number }>>(
    `SELECT read_progress FROM item_states WHERE item_id = $1`,
    [itemId]
  );
  return rows[0]?.read_progress ?? 0;
}

export async function markAllRead(feedIds: string[], since: string | null): Promise<void> {
  if (feedIds.length === 0) return;
  const db = await getDb();
  const placeholders = feedIds.map((_, i) => `$${i + 1}`).join(", ");
  const params: unknown[] = [...feedIds];

  let sinceClause = "";
  if (since) {
    params.push(since);
    sinceClause = `AND fi.published_at >= $${params.length}`;
  }

  await db.execute(
    `INSERT INTO item_states (item_id, is_read, updated_at)
     SELECT fi.id, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     FROM feed_items fi
     WHERE fi.feed_id IN (${placeholders}) ${sinceClause}
     ON CONFLICT (item_id) DO UPDATE SET
       is_read    = 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
    params
  );
}

// ─── Feed items (used by crawler) ─────────────────────────────────────────────

export async function upsertFeedItems(items: FeedItemInsert[]): Promise<void> {
  if (items.length === 0) return;
  const db = await getDb();
  for (const item of items) {
    await db.execute(
      `INSERT INTO feed_items
         (id, feed_id, title, link, content, published_at, guid, author, thumbnail_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (feed_id, guid) DO UPDATE SET
         title         = excluded.title,
         link          = excluded.link,
         content       = excluded.content,
         author        = excluded.author,
         thumbnail_url = excluded.thumbnail_url`,
      [
        item.id, item.feed_id, item.title, item.link, item.content,
        item.published_at, item.guid, item.author, item.thumbnail_url,
      ]
    );
  }
}

export async function updateFeedMeta(
  feedId: string,
  meta: { last_fetched_at: string; etag: string | null }
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE feeds SET last_fetched_at = $1, etag = $2 WHERE id = $3`,
    [meta.last_fetched_at, meta.etag, feedId]
  );
}

// ─── Highlights ───────────────────────────────────────────────────────────────

export async function getHighlightsForItem(itemId: string): Promise<Highlight[]> {
  const db = await getDb();
  return db.select<Highlight[]>(
    `SELECT * FROM highlights WHERE item_id = $1 ORDER BY created_at ASC`,
    [itemId]
  );
}

export async function addHighlight(h: {
  id: string;
  item_id: string;
  quote: string;
  prefix: string | null;
  suffix: string | null;
  note: string | null;
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO highlights (id, item_id, quote, prefix, suffix, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [h.id, h.item_id, h.quote, h.prefix, h.suffix, h.note]
  );
}

export async function updateHighlightNote(id: string, note: string | null): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE highlights SET note = $1 WHERE id = $2`, [note, id]);
}

export async function deleteHighlight(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM highlights WHERE id = $1`, [id]);
}

export async function getAllHighlights(): Promise<HighlightWithArticle[]> {
  const db = await getDb();
  return db.select<HighlightWithArticle[]>(
    `SELECT h.*, fi.title AS article_title, fi.link AS article_link, f.title AS feed_title
     FROM highlights h
     JOIN feed_items fi ON fi.id = h.item_id
     JOIN feeds f ON f.id = fi.feed_id
     ORDER BY h.created_at DESC`
  );
}

export type ArchivedContent = {
  title: string;
  byline: string | null;
  siteName: string | null;
  content: string; // sanitized article HTML
};

export async function getItemContent(itemId: string): Promise<ArchivedContent | null> {
  const db = await getDb();
  const rows = await db.select<Array<{ content_json: string }>>(
    `SELECT content_json FROM item_content WHERE item_id = $1`,
    [itemId]
  );
  if (!rows[0]) return null;
  try {
    return JSON.parse(rows[0].content_json) as ArchivedContent;
  } catch {
    return null;
  }
}

export async function setItemContent(itemId: string, content: ArchivedContent): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO item_content (item_id, content_json) VALUES ($1, $2)
     ON CONFLICT (item_id) DO NOTHING`,
    [itemId, JSON.stringify(content)]
  );
}

// ─── Key takeaways cache ────────────────────────────────────────────────────────

export async function getItemTakeaways(
  itemId: string
): Promise<{ takeaways: string[]; model: string | null } | null> {
  const db = await getDb();
  const rows = await db.select<Array<{ takeaways_json: string; model: string | null }>>(
    `SELECT takeaways_json, model FROM item_takeaways WHERE item_id = $1`,
    [itemId]
  );
  if (!rows[0]) return null;
  try {
    return { takeaways: JSON.parse(rows[0].takeaways_json) as string[], model: rows[0].model };
  } catch {
    return null;
  }
}

export async function setItemTakeaways(
  itemId: string,
  takeaways: string[],
  model: string | null
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO item_takeaways (item_id, takeaways_json, model, created_at)
     VALUES ($1, $2, $3, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
     ON CONFLICT (item_id) DO UPDATE SET
       takeaways_json = excluded.takeaways_json,
       model          = excluded.model,
       created_at     = excluded.created_at`,
    [itemId, JSON.stringify(takeaways), model]
  );
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getFeedAnalytics(): Promise<FeedAnalytics[]> {
  const db = await getDb();
  return db.select<FeedAnalytics[]>(
    `SELECT
       f.id                                                AS feed_id,
       f.title                                             AS feed_title,
       f.url                                               AS feed_url,
       f.site_url,
       s.folder,
       COUNT(fi.id)                                        AS total_items,
       SUM(CASE WHEN ist.is_read    = 1 THEN 1 ELSE 0 END) AS read_items,
       SUM(CASE WHEN ist.is_starred = 1 THEN 1 ELSE 0 END) AS starred_items,
       f.last_fetched_at,
       f.fetch_interval,
       MIN(fi.published_at)                                AS oldest_item_date,
       MAX(fi.published_at)                                AS newest_item_date
     FROM subscriptions s
     JOIN feeds f ON f.id = s.feed_id
     LEFT JOIN feed_items fi  ON fi.feed_id  = f.id
     LEFT JOIN item_states ist ON ist.item_id = fi.id
     GROUP BY f.id, f.title, f.url, f.site_url, s.folder,
              f.last_fetched_at, f.fetch_interval
     ORDER BY f.title COLLATE NOCASE`
  );
}

// ─── Digest ───────────────────────────────────────────────────────────────────

export async function get24hItems(): Promise<DigestItem[]> {
  const db = await getDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return db.select<DigestItem[]>(
    `SELECT fi.id, fi.title, fi.link, fi.content, fi.published_at,
            fi.feed_id, f.title AS feed_title
     FROM feed_items fi
     JOIN subscriptions s ON s.feed_id = fi.feed_id
     JOIN feeds f ON f.id = fi.feed_id
     WHERE fi.published_at >= $1
     ORDER BY fi.published_at DESC`,
    [since]
  );
}

// ─── Saved articles ─────────────────────────────────────────────────────────────
// "Saved" unifies starred feed items and saved external (⌘L) articles. External
// articles are stored as feed_items under a reserved, never-subscribed feed so
// they share the existing item_states (is_starred) and item_content machinery —
// which keeps them out of the sidebar feed list, analytics, and unread counts.

export const SAVED_FEED_ID = "__saved__";

async function ensureSavedFeed(db: Database): Promise<void> {
  await db.execute(
    `INSERT OR IGNORE INTO feeds (id, url, title, last_fetched_at)
     VALUES ($1, $2, $3, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
    [SAVED_FEED_ID, "feedlight://saved", "Saved"]
  );
}

/**
 * Saves an external article (one with no feed item of its own) so it appears in
 * the Saved view. Idempotent per URL: re-saving reuses the existing row. The
 * extracted content is archived so reopening is instant and survives link rot.
 */
export async function saveExternalArticle(article: {
  url: string;
  title: string | null;
  content: ArchivedContent | null;
}): Promise<string> {
  const db = await getDb();
  await ensureSavedFeed(db);
  const existing = await db.select<Array<{ id: string }>>(
    `SELECT id FROM feed_items WHERE feed_id = $1 AND guid = $2`,
    [SAVED_FEED_ID, article.url]
  );
  const id = existing[0]?.id ?? uuidv4();
  await db.execute(
    `INSERT INTO feed_items (id, feed_id, title, link, content, published_at, guid)
     VALUES ($1, $2, $3, $4, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), $5)
     ON CONFLICT (feed_id, guid) DO UPDATE SET
       title = excluded.title,
       link  = excluded.link`,
    [id, SAVED_FEED_ID, article.title, article.url, article.url]
  );
  await upsertItemState(id, { is_starred: true });
  if (article.content) await setItemContent(id, article.content);
  return id;
}

export async function isArticleSaved(url: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<Array<{ c: number }>>(
    `SELECT COUNT(*) AS c FROM feed_items fi
     JOIN item_states ist ON ist.item_id = fi.id
     WHERE fi.feed_id = $1 AND fi.guid = $2 AND ist.is_starred = 1`,
    [SAVED_FEED_ID, url]
  );
  return (rows[0]?.c ?? 0) > 0;
}

export async function removeSavedArticleByUrl(url: string): Promise<void> {
  const db = await getDb();
  // Cascade clears item_states + item_content for this saved article.
  await db.execute(
    `DELETE FROM feed_items WHERE feed_id = $1 AND guid = $2`,
    [SAVED_FEED_ID, url]
  );
}

/**
 * Removes an item from the Saved view. External saved articles are deleted
 * outright (cleanup); real feed items just have their saved flag cleared so they
 * remain in their feed.
 */
export async function unsaveItem(item: { id: string; feed_id: string }): Promise<void> {
  if (item.feed_id === SAVED_FEED_ID) {
    const db = await getDb();
    await db.execute(`DELETE FROM feed_items WHERE id = $1`, [item.id]);
  } else {
    await upsertItemState(item.id, { is_starred: false });
  }
}

/** All saved items (starred feed items + external saves), most recently saved first. */
export async function getSavedItems(): Promise<TimelineItem[]> {
  const db = await getDb();
  const rows = await db.select<
    Array<{
      id: string;
      title: string | null;
      link: string | null;
      content: string | null;
      published_at: string | null;
      feed_id: string;
      author: string | null;
      thumbnail_url: string | null;
      feed_title: string | null;
      is_read: number;
      is_saved: number;
      is_starred: number;
      read_progress: number;
    }>
  >(
    `SELECT
       fi.id, fi.title, fi.link, fi.content, fi.published_at,
       fi.feed_id, fi.author, fi.thumbnail_url,
       CASE WHEN fi.feed_id = $1 THEN NULL ELSE f.title END AS feed_title,
       COALESCE(ist.is_read,    0) AS is_read,
       COALESCE(ist.is_saved,   0) AS is_saved,
       COALESCE(ist.is_starred, 0) AS is_starred,
       COALESCE(ist.read_progress, 0) AS read_progress
     FROM feed_items fi
     JOIN feeds f ON f.id = fi.feed_id
     JOIN item_states ist ON ist.item_id = fi.id
     WHERE ist.is_starred = 1
     ORDER BY ist.updated_at DESC`,
    [SAVED_FEED_ID]
  );
  return rows.map((r) => ({
    ...r,
    is_read: r.is_read === 1,
    is_saved: r.is_saved === 1,
    is_starred: r.is_starred === 1,
  }));
}
