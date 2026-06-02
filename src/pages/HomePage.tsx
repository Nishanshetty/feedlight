import { useCallback, useEffect, useMemo, useState } from "react";
import { getSubscribedFeeds } from "../lib/db";
import { DEFAULT_RANGE } from "../lib/date-range";
import type { DateRange } from "../lib/date-range";
import type { SubscribedFeed } from "../types/database";
import type { NavFilter } from "../components/SidebarNav";
import { useFeedRefresh } from "../lib/hooks/use-feed-refresh";
import AppShell from "../components/AppShell";
import SidebarContent from "../components/SidebarContent";
import Timeline from "../components/Timeline";

export default function HomePage() {
  const [feeds, setFeeds] = useState<SubscribedFeed[]>([]);
  const [feedsRefreshKey, setFeedsRefreshKey] = useState(0);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);

  const [activeFeedId, setActiveFeedId] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [activeUnread, setActiveUnread] = useState(false);
  const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);

  useEffect(() => {
    getSubscribedFeeds().then(setFeeds).catch(console.error);
  }, [feedsRefreshKey]);

  // Re-render timeline + sidebar whenever the background crawler finishes
  const handleBackgroundRefresh = useCallback(() => {
    setSidebarRefreshKey((k) => k + 1);
    setTimelineRefreshKey((k) => k + 1);
  }, []);
  useFeedRefresh(handleBackgroundRefresh);

  function handleNavigate(filter: NavFilter) {
    setActiveFeedId(filter.feedId ?? null);
    setActiveFolder(filter.folder ?? null);
    setActiveUnread(filter.unread ?? false);
  }

  function handleFeedAdded() {
    setFeedsRefreshKey((k) => k + 1);
    setSidebarRefreshKey((k) => k + 1);
    setTimelineRefreshKey((k) => k + 1);
  }

  function handleFeedDeleted() {
    setActiveFeedId(null);
    setActiveFolder(null);
    setFeedsRefreshKey((k) => k + 1);
    setSidebarRefreshKey((k) => k + 1);
    setTimelineRefreshKey((k) => k + 1);
  }

  function handleStatesChanged() {
    setSidebarRefreshKey((k) => k + 1);
  }

  function handleRefreshComplete() {
    setSidebarRefreshKey((k) => k + 1);
    setTimelineRefreshKey((k) => k + 1);
  }

  const feedIds = useMemo(() => {
    if (activeFeedId) return [activeFeedId];
    if (activeFolder) return feeds.filter((f) => (f.folder ?? "Uncategorized") === activeFolder).map((f) => f.id);
    return feeds.map((f) => f.id);
  }, [feeds, activeFeedId, activeFolder]);

  const filterLabel = useMemo(() => {
    if (activeFeedId) return feeds.find((f) => f.id === activeFeedId)?.title ?? "Feed";
    if (activeFolder) return activeFolder;
    if (activeUnread) return "Unread";
    return "All Articles";
  }, [feeds, activeFeedId, activeFolder, activeUnread]);

  const sidebar = (
    <SidebarContent
      feeds={feeds}
      activeFeedId={activeFeedId}
      activeFolder={activeFolder}
      activeUnread={activeUnread}
      refreshKey={sidebarRefreshKey}
      onNavigate={handleNavigate}
      onFeedAdded={handleFeedAdded}
      onFeedDeleted={handleFeedDeleted}
    />
  );

  const main = (
    <Timeline
      feedIds={feedIds}
      filterLabel={activeUnread ? `${filterLabel} — Unread` : filterLabel}
      range={range}
      unreadOnly={activeUnread}
      refreshKey={timelineRefreshKey}
      onRangeChange={setRange}
      onStatesChanged={handleStatesChanged}
    />
  );

  return <AppShell sidebar={sidebar} main={main} onRefreshComplete={handleRefreshComplete} />;
}
