import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { deleteFeed, getTotalUnreadCount, getUnreadCountsByFeed, listTags, updateFeedFolder } from "../lib/db";
import { rangeToSince } from "../lib/date-range";
import type { SubscribedFeed, TagWithCount } from "../types/database";
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
  activeHighlights: boolean;
  activeTagId: string | null;
  refreshKey: number;
  onNavigate: (filter: NavFilter) => void;
  onFeedAdded: () => void;
  onFeedDeleted: () => void;
};

export default function SidebarContent({
  feeds, activeFeedId, activeFolder, activeAnalytics, activeDigest, activeDiscover, activeStarred, activeToday, activeHighlights, activeTagId,
  refreshKey, onNavigate, onFeedAdded, onFeedDeleted,
}: Props) {
  const [unreadByFeed, setUnreadByFeed] = useState<Record<string, number>>({});
  const [todayUnread, setTodayUnread] = useState(0);
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [opmlOpen, setOpmlOpen] = useState(false);

  useEffect(() => {
    listTags().then(setTags).catch(console.error);
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
      {/* Masthead. Lumina puts the brand at the top of the rail rather than in a
          top bar, so the content canvas stays uninterrupted paper. */}
      <div className="px-6 pt-7 pb-6">
        <p className="font-headline text-headline-md tracking-tight text-primary">Feedlight</p>
        <p className="mt-1 font-label text-ui-small text-on-surface-variant">Focused Reading</p>
      </div>
      <div className="px-3 pb-3">
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
        activeHighlights={activeHighlights}
        activeTagId={activeTagId}
        tags={tags}
        todayUnread={todayUnread}
        onNavigate={onNavigate}
        onUnsubscribe={handleUnsubscribe}
        onMoveToFolder={handleMoveToFolder}
      />
      <div className="border-t border-outline-variant/60 p-3">
        <button onClick={() => setOpmlOpen((v) => !v)} aria-expanded={opmlOpen}
          className="flex w-full items-center justify-between font-label text-ui-small font-semibold uppercase tracking-[0.1em] text-outline transition-colors hover:text-on-surface-variant">
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

      {/* Settings sits at the foot of the rail, as in the Lumina screens. */}
      <Link to="/settings"
        className="flex items-center gap-3 border-t border-outline-variant/60 px-6 py-4 font-label text-ui-label text-on-surface-variant transition-colors hover:bg-secondary-container hover:text-primary">
        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Settings
      </Link>
    </div>
  );
}
