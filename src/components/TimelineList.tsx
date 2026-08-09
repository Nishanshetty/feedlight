import { Fragment, useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getTimelineItems, getTotalUnreadCount, upsertItemState, markAllRead } from "../lib/db";
import { DATE_RANGE_OPTIONS } from "../lib/date-range";
import type { TimelineItem } from "../types/database";
import type { DateRange } from "../lib/date-range";
import { useKeyboardShortcuts } from "../lib/hooks/use-keyboard-shortcuts";
import FeedItemCard from "./FeedItemCard";
import { useReader } from "../lib/reader-context";

const FIRST_PAGE_CURSOR = "2099-12-31T23:59:59.999Z";

type Props = {
  feedIds: string[];
  filterLabel: string;
  filterKey: string;
  range: DateRange;
  since: string | null;
  starredOnly: boolean;
  tagId?: string;
  lockRange?: boolean;
  pageSize: number;
  onRangeChange: (r: DateRange) => void;
  onStatesChanged: () => void;
};

function dateGroup(iso: string | null): string {
  if (!iso) return "Earlier";
  const d = new Date(iso);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);
  if (d >= startOfToday) return "Today";
  if (d >= startOfYesterday) return "Yesterday";
  if (d >= startOfWeek) return "This Week";
  return "Earlier";
}

function setAdd(prev: Set<string>, id: string): Set<string> {
  return new Set(Array.from(prev).concat(id));
}
function setToggle(prev: Set<string>, id: string): Set<string> {
  return prev.has(id) ? new Set(Array.from(prev).filter((x) => x !== id)) : setAdd(prev, id);
}

export default function TimelineList({
  feedIds, filterLabel, filterKey, range, since, starredOnly, tagId, lockRange, pageSize,
  onRangeChange, onStatesChanged,
}: Props) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [density, setDensity] = useState<"grid" | "list">(() => {
    try { return localStorage.getItem("feedlight:timeline-density") === "list" ? "list" : "grid"; }
    catch { return "grid"; }
  });
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const reader = useReader();
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);

  const prevFilterKeyRef = useRef(filterKey);

  // Reset unread toggle and search when the feed/folder selection changes
  useEffect(() => {
    if (filterKey !== prevFilterKeyRef.current) {
      setUnreadOnly(false);
      setSearchInput("");
      setSearchQuery("");
    }
    prevFilterKeyRef.current = filterKey;
  }, [filterKey]);

  // Reading collapses the list to a single narrow column; the saved density
  // preference is left untouched and comes back when the reader closes.
  const effectiveDensity = reader.isOpen ? "list" : density;

  function changeDensity(d: "grid" | "list") {
    setDensity(d);
    try { localStorage.setItem("feedlight:timeline-density", d); } catch { /* ignore */ }
  }

  // Debounce search input → query
  useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Load items whenever filter or unreadOnly changes
  useEffect(() => {
    if (feedIds.length === 0) { setItems([]); setTotalUnread(0); setHasMore(false); return; }
    setIsLoading(true);
    setLoadError("");

    Promise.all([
      getTimelineItems({ feedIds, cursor: FIRST_PAGE_CURSOR, since, limit: pageSize, unreadOnly, starredOnly, tagId, query: searchQuery || undefined }),
      // Feed-wide unread count / mark-all aren't tag-scoped, so suppress them in a tag view.
      tagId ? Promise.resolve(0) : getTotalUnreadCount(feedIds, since),
    ]).then(([newItems, count]) => {
      setItems(newItems);
      setReadIds(new Set(newItems.filter((i) => i.is_read).map((i) => i.id)));
      setStarredIds(new Set(newItems.filter((i) => i.is_starred).map((i) => i.id)));
      setHasMore(newItems.length === pageSize);
      setTotalUnread(count);
      setSelectedIndex(-1);
    }).catch((err) => {
      setLoadError(String(err));
    }).finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, unreadOnly, searchQuery]);

  // Infinite scroll: observer lives on a sentinel above the footer; the latest
  // handleLoadMore is kept in a ref so the observer never goes stale
  const handleLoadMoreRef = useRef<() => void>(() => {});
  const observerRef = useRef<IntersectionObserver | null>(null);
  function sentinelRef(el: HTMLDivElement | null) {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) handleLoadMoreRef.current(); },
      { rootMargin: "400px" }
    );
    obs.observe(el);
    observerRef.current = obs;
  }

  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    if (selectedIndex >= 0) itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex]);

  function selectAndRead(index: number) {
    const item = items[index];
    if (!item) return;
    setSelectedIndex(index);
    reader.open({ url: item.link ?? "", title: item.title, itemId: item.id });
    if (!readIds.has(item.id)) {
      setReadIds((prev) => setAdd(prev, item.id));
      setTotalUnread((prev) => Math.max(0, prev - 1));
      upsertItemState(item.id, { is_read: true }).then(onStatesChanged).catch(console.error);
    }
  }

  function handleToggleStar(index: number, id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIndex(index);
    const next = !starredIds.has(id);
    setStarredIds((prev) => setToggle(prev, id));
    upsertItemState(id, { is_starred: next }).catch(console.error);
  }

  function handleLoadMore() {
    if (isLoading || !hasMore) return;
    const cursor = items[items.length - 1]?.published_at;
    if (!cursor) return;
    setLoadError("");
    setIsLoading(true);
    getTimelineItems({ feedIds, cursor, since, limit: pageSize, unreadOnly, starredOnly, tagId, query: searchQuery || undefined })
      .then((more) => {
        if (more.length < pageSize) setHasMore(false);
        if (more.length > 0) setItems((prev) => [...prev, ...more]);
      })
      .catch((err) => setLoadError(String(err)))
      .finally(() => setIsLoading(false));
  }
  handleLoadMoreRef.current = handleLoadMore;

  function handleMarkAllRead() {
    if (totalUnread === 0) return;

    const visibleUnreadIds = items.filter((i) => !readIds.has(i.id)).map((i) => i.id);
    setReadIds((prev) => new Set(Array.from(prev).concat(visibleUnreadIds)));
    const prevTotal = totalUnread;
    setTotalUnread(0);
    setIsMarkingAll(true);

    markAllRead(feedIds, null)
      .then(onStatesChanged)
      .catch(() => {
        setReadIds((prev) => new Set(Array.from(prev).filter((id) => !visibleUnreadIds.includes(id))));
        setTotalUnread(prevTotal);
        setLoadError("Failed to mark items as read");
      })
      .finally(() => setIsMarkingAll(false));
  }

  useKeyboardShortcuts({
    j: () => setSelectedIndex((prev) => prev < 0 ? 0 : Math.min(prev + 1, items.length - 1)),
    k: () => setSelectedIndex((prev) => prev < 0 ? 0 : Math.max(prev - 1, 0)),
    o: () => { if (selectedIndex >= 0) selectAndRead(selectedIndex); },
    Enter: () => { if (selectedIndex >= 0) selectAndRead(selectedIndex); },
    // Peel one layer at a time: the conversation closes before the article.
    Escape: () => { if (reader.chatOpen) reader.setChatOpen(false); else reader.close(); },
    m: () => {
      const item = items[selectedIndex];
      if (!item) return;
      const next = !readIds.has(item.id);
      setReadIds((prev) => setToggle(prev, item.id));
      setTotalUnread((prev) => Math.max(0, next ? prev - 1 : prev + 1));
      upsertItemState(item.id, { is_read: next }).then(onStatesChanged).catch(() => {
        setReadIds((prev) => setToggle(prev, item.id));
      });
    },
    s: () => {
      const item = items[selectedIndex];
      if (!item) return;
      const next = !starredIds.has(item.id);
      setStarredIds((prev) => setToggle(prev, item.id));
      upsertItemState(item.id, { is_starred: next }).catch(console.error);
    },
    "Shift+A": handleMarkAllRead,
    "/": () => searchRef.current?.focus(),
  });

  return (
    <div className="relative">
      <div className={`h-0.5 w-full transition-all duration-300 ${isLoading || isMarkingAll ? "bg-tertiary/30" : "bg-transparent"}`}>
        {(isLoading || isMarkingAll) && <div className="h-full w-1/3 bg-tertiary animate-[slide_1.2s_ease-in-out_infinite]" />}
      </div>

      <header className="px-reading-margin-mobile @3xl:px-16 @6xl:px-reading-margin-desktop pb-4 pt-unit @3xl:pb-stack-md">
        <h1 className="font-headline text-headline-md text-primary @2xl:text-headline-lg-mobile @3xl:text-headline-lg">{filterLabel}</h1>
        <p className="mt-2 font-label text-ui-label text-on-surface-variant">
          {totalUnread > 0 ? `${totalUnread} unread` : "All caught up"}
        </p>
      </header>

      <div className="paper-glass sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-outline-variant py-3 px-reading-margin-mobile @3xl:px-16 @6xl:px-reading-margin-desktop">
        <div className={`flex items-center gap-2 ${reader.isOpen ? "w-full" : ""}`}>
          <input
            ref={searchRef}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setSearchInput(""); e.currentTarget.blur(); } }}
            placeholder="Search… ( / )"
            className={`ghost-border rounded bg-surface-container-lowest px-2.5 py-1.5 font-label text-ui-small text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary ${reader.isOpen ? "min-w-0 flex-1" : "w-40"}`}
          />
          {!reader.isOpen && (
          <div className="flex">
            <button onClick={() => changeDensity("grid")} aria-label="Grid view" title="Grid view"
              className={`ghost-border rounded-l px-2.5 py-1.5 transition-colors ${density === "grid" ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface-variant hover:text-primary"}`}>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button onClick={() => changeDensity("list")} aria-label="List view" title="List view"
              className={`ghost-border rounded-r border-l-0 px-2.5 py-1.5 transition-colors ${density === "list" ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface-variant hover:text-primary"}`}>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
          )}
          <button onClick={() => setUnreadOnly((v) => !v)}
            aria-pressed={unreadOnly}
            aria-label={unreadOnly ? "Showing unread only" : "Show unread only"}
            title={unreadOnly ? "Showing unread only" : "Show unread only"}
            className={`ghost-border shrink-0 rounded py-1.5 font-label text-ui-small font-semibold uppercase tracking-[0.14em] transition-colors ${reader.isOpen ? "px-2.5" : "px-3"} ${unreadOnly ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface-variant hover:text-primary"}`}>
            {reader.isOpen ? (
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill={unreadOnly ? "currentColor" : "none"} stroke="currentColor">
                <circle cx="12" cy="12" r="7" strokeWidth={2} />
              </svg>
            ) : "Unread"}
          </button>
          {!lockRange && !reader.isOpen && (
            <select value={range} onChange={(e) => onRangeChange(e.target.value as DateRange)}
              className="ghost-border cursor-pointer rounded bg-surface-container-lowest px-2.5 py-1.5 font-label text-ui-small text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-primary">
              {DATE_RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {totalUnread > 0 && !starredOnly && !tagId && !reader.isOpen && (
            <button onClick={handleMarkAllRead} disabled={isMarkingAll}
              className="ghost-border rounded bg-surface-container-lowest px-3 py-1.5 font-label text-ui-small font-semibold uppercase tracking-[0.14em] text-on-surface-variant transition-colors hover:text-primary disabled:opacity-40">
              {isMarkingAll ? "Marking…" : "Mark all read"}
            </button>
          )}
        </div>
      </div>

      {items.length === 0 && !isLoading ? (
        <div className="px-6 py-20 text-center">
          <p className="font-label text-ui-label uppercase tracking-[0.14em] text-outline">
            {feedIds.length === 0 ? "Add a feed from the sidebar to get started." : `No items in ${filterLabel} for this time period.`}
          </p>
        </div>
      ) : (
        <>
          <ul className={effectiveDensity === "grid"
            ? "grid grid-cols-1 gap-gutter px-reading-margin-mobile py-stack-md @2xl:grid-cols-2 @3xl:px-16 @4xl:grid-cols-3 @6xl:grid-cols-4 @6xl:px-reading-margin-desktop"
            : "flex flex-col py-4 px-reading-margin-mobile @3xl:px-16 @6xl:px-reading-margin-desktop @3xl:py-stack-md"}>
            {items.map((item, index) => {
              const group = dateGroup(item.published_at);
              const prevGroup = index > 0 ? dateGroup(items[index - 1].published_at) : null;
              return (
                <Fragment key={item.id}>
                  {group !== prevGroup && (
                    <li className={`col-span-full flex items-center gap-3 ${effectiveDensity === "grid" ? "pt-2 first:pt-0" : "pt-4 pb-2 first:pt-1"}`}>
                      <span className="font-label text-ui-small font-semibold uppercase tracking-[0.14em] text-outline">
                        {group}
                      </span>
                      <div className="h-px flex-1 bg-outline-variant" />
                    </li>
                  )}
                  <FeedItemCard item={item}
                    isRead={readIds.has(item.id)} isStarred={starredIds.has(item.id)}
                    isSelected={index === selectedIndex}
                    layout={reader.isOpen ? "compact" : effectiveDensity === "grid" ? "card" : "row"}
                    hero={effectiveDensity === "grid" && !searchQuery && index === 0}
                    onActivate={() => selectAndRead(index)}
                    onOpen={() => { if (item.link) openUrl(item.link); }}
                    onToggleStar={(e) => handleToggleStar(index, item.id, e)}
                    elRef={(el) => { itemRefs.current[index] = el; }} />
                </Fragment>
              );
            })}
          </ul>
          {hasMore && <div ref={sentinelRef} className="h-px" aria-hidden="true" />}
          <div className="py-8 text-center">
            {loadError && <p className="mb-3 font-label text-ui-small text-error">{loadError}</p>}
            {hasMore ? (
              <button onClick={handleLoadMore} disabled={isLoading}
                className="ghost-border rounded bg-surface-container-lowest px-4 py-2 font-label text-ui-small font-semibold uppercase tracking-[0.14em] text-on-surface-variant transition-colors hover:text-primary disabled:opacity-40">
                {isLoading ? "Loading…" : "Load more"}
              </button>
            ) : (
              <p className="font-label text-ui-small uppercase tracking-[0.14em] text-outline">You're all caught up</p>
            )}
          </div>
        </>
      )}

    </div>
  );
}
