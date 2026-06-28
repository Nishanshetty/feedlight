import { useCallback, useEffect, useMemo, useState } from "react";
import { getSubscribedFeeds, getFeedAnalytics } from "../lib/db";
import { DEFAULT_RANGE } from "../lib/date-range";
import type { DateRange } from "../lib/date-range";
import type { SubscribedFeed } from "../types/database";
import type { NavFilter } from "../components/SidebarNav";
import { classifyFeeds } from "../lib/analytics";
import type { AnalyticsResult } from "../lib/analytics";
import { useFeedRefresh } from "../lib/hooks/use-feed-refresh";
import AppShell from "../components/AppShell";
import SidebarContent from "../components/SidebarContent";
import Timeline from "../components/Timeline";
import AnalyticsDashboard from "../components/AnalyticsDashboard";
import DigestView from "../components/DigestView";
import DiscoverView from "../components/DiscoverView";
import HighlightsView from "../components/HighlightsView";
import SavedView from "../components/SavedView";

export default function HomePage() {
  const [feeds, setFeeds] = useState<SubscribedFeed[]>([]);
  const [feedsRefreshKey, setFeedsRefreshKey] = useState(0);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);

  const [activeFeedId, setActiveFeedId] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [activeAnalytics, setActiveAnalytics] = useState(false);
  const [activeDigest, setActiveDigest] = useState(false);
  const [activeDiscover, setActiveDiscover] = useState(false);
  const [activeStarred, setActiveStarred] = useState(false);
  const [activeToday, setActiveToday] = useState(false);
  const [activeHighlights, setActiveHighlights] = useState(false);
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [activeTagName, setActiveTagName] = useState<string | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsResult | null>(null);
  const [analyticsError, setAnalyticsError] = useState("");
  const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);

  useEffect(() => {
    getSubscribedFeeds().then((f) => {
      setFeeds(f);
      if (feedsRefreshKey === 0 && f.length === 0) setActiveDiscover(true);
    }).catch(console.error);
  }, [feedsRefreshKey]);

  // Re-render timeline + sidebar whenever the background crawler finishes
  const handleBackgroundRefresh = useCallback(() => {
    setSidebarRefreshKey((k) => k + 1);
    setTimelineRefreshKey((k) => k + 1);
  }, []);
  useFeedRefresh(handleBackgroundRefresh);

  async function loadAnalytics() {
    setAnalyticsData(null);
    setAnalyticsError("");
    try {
      const raw = await getFeedAnalytics();
      setAnalyticsData(classifyFeeds(raw));
    } catch (err) {
      setAnalyticsError(String(err));
    }
  }

  function handleNavigate(filter: NavFilter) {
    setActiveAnalytics(!!filter.analytics);
    setActiveDigest(!!filter.digest);
    setActiveDiscover(!!filter.discover);
    setActiveStarred(!!filter.starred);
    setActiveToday(!!filter.today);
    setActiveHighlights(!!filter.highlights);
    setActiveTagId(filter.tagId ?? null);
    setActiveTagName(filter.tagName ?? null);
    if (filter.analytics || filter.digest || filter.discover || filter.starred || filter.today || filter.highlights || filter.tagId) {
      setActiveFeedId(null);
      setActiveFolder(null);
    } else {
      setActiveFeedId(filter.feedId ?? null);
      setActiveFolder(filter.folder ?? null);
    }
    if (filter.analytics) loadAnalytics();
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
    if (activeAnalytics) loadAnalytics();
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
    if (activeTagId) return `#${activeTagName ?? "Tag"}`;
    if (activeToday) return "Today";
    if (activeStarred) return "Saved";
    if (activeFeedId) return feeds.find((f) => f.id === activeFeedId)?.title ?? "Feed";
    if (activeFolder) return activeFolder;
    return "All Articles";
  }, [feeds, activeFeedId, activeFolder, activeStarred, activeToday, activeTagId, activeTagName]);

  const sidebar = (
    <SidebarContent
      feeds={feeds}
      activeFeedId={activeFeedId}
      activeFolder={activeFolder}
      activeAnalytics={activeAnalytics}
      activeDigest={activeDigest}
      activeDiscover={activeDiscover}
      activeStarred={activeStarred}
      activeToday={activeToday}
      activeHighlights={activeHighlights}
      activeTagId={activeTagId}
      refreshKey={sidebarRefreshKey}
      onNavigate={handleNavigate}
      onFeedAdded={handleFeedAdded}
      onFeedDeleted={handleFeedDeleted}
    />
  );

  const main = activeHighlights ? (
    <HighlightsView />
  ) : activeStarred ? (
    <SavedView refreshKey={timelineRefreshKey} onStatesChanged={handleStatesChanged} />
  ) : activeDiscover ? (
    <DiscoverView feeds={feeds} onFeedAdded={handleFeedAdded} />
  ) : activeDigest ? (
    <DigestView />
  ) : activeAnalytics ? (
    <div>
      {analyticsError ? (
        <div className="flex items-center justify-center p-20">
          <p className="text-sm font-label text-error">{analyticsError}</p>
        </div>
      ) : !analyticsData ? (
        <div className="flex items-center justify-center p-20">
          <p className="text-[11px] font-label text-outline uppercase tracking-widest animate-pulse">Loading…</p>
        </div>
      ) : (
        <AnalyticsDashboard data={analyticsData} onFeedDeleted={handleFeedDeleted} />
      )}
    </div>
  ) : (
    <Timeline
      feedIds={feedIds}
      filterLabel={filterLabel}
      range={activeToday ? "1d" : range}
      starredOnly={activeStarred}
      tagId={activeTagId ?? undefined}
      lockRange={activeToday}
      refreshKey={timelineRefreshKey}
      onRangeChange={setRange}
      onStatesChanged={handleStatesChanged}
    />
  );

  return <AppShell sidebar={sidebar} main={main} onRefreshComplete={handleRefreshComplete} />;
}
