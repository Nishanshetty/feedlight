import { describe, expect, it } from "vitest";

import { classifyFeeds, type AnalyticsResult } from "./analytics";
import type { FeedAnalytics } from "../types/database";

const DAY_MS = 86_400_000;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function feed(overrides: Partial<FeedAnalytics> = {}): FeedAnalytics {
  return {
    feed_id: "feed-1",
    feed_title: "Feed",
    feed_url: "https://example.com/feed.xml",
    site_url: "https://example.com",
    folder: null,
    total_items: 0,
    read_items: 0,
    starred_items: 0,
    last_fetched_at: isoDaysAgo(0),
    fetch_interval: 900,
    oldest_item_date: null,
    newest_item_date: null,
    ...overrides,
  };
}

function emptyResult(): AnalyticsResult {
  return classifyFeeds([]);
}

describe("classifyFeeds — per feed", () => {
  it("computes read rate and unread count", () => {
    const result = classifyFeeds([feed({ total_items: 40, read_items: 10 })]);
    expect(result.totalFeeds).toBe(1);
    expect(result.totalUnreads).toBe(30);
    expect(result.overallReadRate).toBe(25);
  });

  it("never reports negative unreads when read_items exceeds total_items", () => {
    const result = classifyFeeds([feed({ total_items: 5, read_items: 9 })]);
    expect(result.totalUnreads).toBe(0);
  });

  it("falls back to the feed URL when the title is missing", () => {
    // A feed that was never fetched is always classified, so the title
    // fallback is observable there.
    const result = classifyFeeds([feed({ feed_title: null, last_fetched_at: null })]);
    expect(result.deadFeeds[0]?.feedTitle).toBe("https://example.com/feed.xml");
  });

  it("defaults an unset folder to Uncategorized", () => {
    const result = classifyFeeds([feed({ folder: null })]);
    expect(result.folderBreakdown).toEqual([{ folder: "Uncategorized", count: 1 }]);
  });

  it("estimates weekly post volume from the item date span", () => {
    // 70 items across 14 days -> 5 per day -> 35 per week.
    const result = classifyFeeds([
      feed({
        total_items: 70,
        oldest_item_date: isoDaysAgo(14),
        newest_item_date: isoDaysAgo(0),
      }),
    ]);
    expect(result.noisyFeeds[0]?.weeklyPostVolume).toBe(35);
  });

  it("treats items sharing one date as a one-day span instead of dividing by zero", () => {
    const same = isoDaysAgo(3);
    const result = classifyFeeds([
      feed({ total_items: 3, oldest_item_date: same, newest_item_date: same }),
    ]);
    // 3 items / 1 day * 7 -> 21 per week, and finite rather than Infinity/NaN.
    expect(result.noisyFeeds[0]?.weeklyPostVolume).toBe(21);
  });

  it("leaves post volume at zero when the feed has no dated items", () => {
    const result = classifyFeeds([feed({ total_items: 12 })]);
    expect(result.noisyFeeds).toHaveLength(0);
    expect(result.ignoredFeeds[0]?.weeklyPostVolume).toBe(0);
  });
});

describe("classifyFeeds — classification buckets", () => {
  it("flags feeds posting more than 15 items a week as noisy, most noisy first", () => {
    const result = classifyFeeds([
      feed({ feed_id: "a", total_items: 70, oldest_item_date: isoDaysAgo(14), newest_item_date: isoDaysAgo(0) }),
      feed({ feed_id: "b", total_items: 140, oldest_item_date: isoDaysAgo(14), newest_item_date: isoDaysAgo(0) }),
      feed({ feed_id: "c", total_items: 15, oldest_item_date: isoDaysAgo(14), newest_item_date: isoDaysAgo(0) }),
    ]);
    expect(result.noisyFeeds.map((f) => f.feedId)).toEqual(["b", "a"]);
  });

  it("flags ignored feeds only from 10 items upward and below a 10% read rate", () => {
    const result = classifyFeeds([
      feed({ feed_id: "few", total_items: 9, read_items: 0 }),
      feed({ feed_id: "low", total_items: 50, read_items: 2 }),
      feed({ feed_id: "half", total_items: 50, read_items: 25 }),
    ]);
    expect(result.ignoredFeeds.map((f) => f.feedId)).toEqual(["low"]);
  });

  it("flags a feed as dead when nothing posted for 30 days", () => {
    const result = classifyFeeds([
      feed({
        feed_id: "stale",
        total_items: 4,
        newest_item_date: isoDaysAgo(45),
        oldest_item_date: isoDaysAgo(60),
      }),
    ]);
    expect(result.deadFeeds.map((f) => f.feedId)).toEqual(["stale"]);
    expect(result.deadFeeds[0].daysSinceLastPost).toBe(45);
  });

  it("flags a feed as dead when it was never fetched", () => {
    const result = classifyFeeds([feed({ feed_id: "never", last_fetched_at: null })]);
    expect(result.deadFeeds.map((f) => f.feedId)).toEqual(["never"]);
  });

  it("flags a feed as dead when its last fetch is far past three fetch intervals", () => {
    const result = classifyFeeds([
      feed({ feed_id: "broken", last_fetched_at: isoDaysAgo(3), fetch_interval: 900 }),
    ]);
    expect(result.deadFeeds.map((f) => f.feedId)).toEqual(["broken"]);
  });

  it("scales the dead threshold to a long fetch interval", () => {
    // 12h interval: the threshold is 3 x 12h = 36h, not the 24h floor.
    // 30h old is still alive; 40h old is dead. A dropped `* 1000` or a wrong
    // multiplier would flip one of these two.
    const alive = classifyFeeds([
      feed({ feed_id: "slow", last_fetched_at: isoDaysAgo(30 / 24), fetch_interval: 43_200 }),
    ]);
    expect(alive.deadFeeds.map((f) => f.feedId)).toEqual([]);

    const dead = classifyFeeds([
      feed({ feed_id: "slow", last_fetched_at: isoDaysAgo(40 / 24), fetch_interval: 43_200 }),
    ]);
    expect(dead.deadFeeds.map((f) => f.feedId)).toEqual(["slow"]);
  });

  it("does not flag a recently fetched feed as dead", () => {
    const result = classifyFeeds([
      feed({
        feed_id: "healthy",
        total_items: 3,
        newest_item_date: isoDaysAgo(1),
        oldest_item_date: isoDaysAgo(2),
        last_fetched_at: isoDaysAgo(0),
      }),
    ]);
    expect(result.deadFeeds).toHaveLength(0);
  });
});

describe("classifyFeeds — aggregates", () => {
  it("handles an empty feed list without dividing by zero", () => {
    const result = emptyResult();
    expect(result.totalFeeds).toBe(0);
    expect(result.totalUnreads).toBe(0);
    expect(result.overallReadRate).toBe(0);
    expect(result.folderBreakdown).toEqual([]);
  });

  it("weights the overall read rate by item count, not by feed count", () => {
    const result = classifyFeeds([
      feed({ feed_id: "big", total_items: 90, read_items: 90 }),
      feed({ feed_id: "small", total_items: 10, read_items: 0 }),
    ]);
    expect(result.overallReadRate).toBe(90);
  });

  it("sorts the folder breakdown by feed count, descending", () => {
    const result = classifyFeeds([
      feed({ feed_id: "a", folder: "Tech" }),
      feed({ feed_id: "b", folder: "Tech" }),
      feed({ feed_id: "c", folder: "Blogs" }),
    ]);
    expect(result.folderBreakdown).toEqual([
      { folder: "Tech", count: 2 },
      { folder: "Blogs", count: 1 },
    ]);
  });
});
