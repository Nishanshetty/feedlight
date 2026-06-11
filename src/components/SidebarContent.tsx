import { useEffect, useState } from "react";
import { deleteFeed, getTotalUnreadCount, getUnreadCountsByFeed, updateFeedFolder } from "../lib/db";
import { rangeToSince } from "../lib/date-range";
import type { SubscribedFeed } from "../types/database";
import AddFeedForm from "./AddFeedForm";
import OpmlControls from "./OpmlControls";
import SidebarNav from "./SidebarNav";
import type { FeedEntry, NavFilter } from "./SidebarNav";

type Props = {
  feeds: SubscribedFeed[];
  activeFeedId: string | null;
  activeFolder: string | null;
  activeAnalytics: boolean;
  activeDigest: boolean;
  activeDiscover: boolean;
  activeStarred: boolean;
  activeToday: boolean;
  refreshKey: number;
  onNavigate: (filter: NavFilter) => void;
  onFeedAdded: () => void;
  onFeedDeleted: () => void;
};

export default function SidebarContent({
  feeds, activeFeedId, activeFolder, activeAnalytics, activeDigest, activeDiscover, activeStarred, activeToday,
  refreshKey, onNavigate, onFeedAdded, onFeedDeleted,
}: Props) {
  const [unreadByFeed, setUnreadByFeed] = useState<Record<string, number>>({});
  const [todayUnread, setTodayUnread] = useState(0);
  const [opmlOpen, setOpmlOpen] = useState(false);

  useEffect(() => {
    if (feeds.length === 0) { setUnreadByFeed({}); setTodayUnread(0); return; }
    const feedIds = feeds.map((f) => f.id);
    Promise.all([
      getUnreadCountsByFeed(feedIds),
      getTotalUnreadCount(feedIds, rangeToSince("1d")),
    ]).then(([byFeed, today]) => {
      setUnreadByFeed(byFeed);
      setTodayUnread(today);
    }).catch(console.error);
  }, [feeds, refreshKey]);

  // Build groups: folder → FeedEntry[]
  const groups: Record<string, FeedEntry[]> = {};
  for (const feed of feeds) {
    const folder = feed.folder ?? "Uncategorized";
    if (!groups[folder]) groups[folder] = [];
    groups[folder].push({
      subId: feed.subscription_id,
      feedId: feed.id,
      title: feed.title ?? feed.url,
      siteUrl: feed.site_url ?? feed.url,
      unread: unreadByFeed[feed.id] ?? 0,
    });
  }

  const existingFolders = Object.keys(groups).filter((f) => f !== "Uncategorized");

  async function handleUnsubscribe(_subId: string, feedId: string, _title: string) {
    try {
      await deleteFeed(feedId);
      if (activeFeedId === feedId) onNavigate({});
      onFeedDeleted();
    } catch (err) {
      console.error("Failed to delete feed:", err);
    }
  }

  async function handleMoveToFolder(feedId: string, folder: string | null) {
    try {
      await updateFeedFolder(feedId, folder);
      onFeedAdded(); // re-fetches feeds, which rebuilds the folder groups
    } catch (err) {
      console.error("Failed to move feed:", err);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-outline-variant/20 p-3">
        <AddFeedForm existingFolders={existingFolders} onFeedAdded={onFeedAdded} />
      </div>
      <SidebarNav
        groups={groups}
        existingFolders={existingFolders}
        activeFeedId={activeFeedId}
        activeFolder={activeFolder}
        activeAnalytics={activeAnalytics}
        activeDigest={activeDigest}
        activeDiscover={activeDiscover}
        activeStarred={activeStarred}
        activeToday={activeToday}
        todayUnread={todayUnread}
        onNavigate={onNavigate}
        onUnsubscribe={handleUnsubscribe}
        onMoveToFolder={handleMoveToFolder}
      />
      <div className="border-t border-outline-variant/20 p-3">
        <button onClick={() => setOpmlOpen((v) => !v)} aria-expanded={opmlOpen}
          className="flex w-full items-center justify-between text-[10px] font-label font-bold uppercase tracking-widest text-outline transition-colors hover:text-on-surface-variant">
          Import / Export
          <svg className={`h-3 w-3 transition-transform duration-200 ${opmlOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {opmlOpen && (
          <div className="mt-2">
            <OpmlControls onImportComplete={onFeedAdded} />
          </div>
        )}
      </div>
    </div>
  );
}
