import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getFeedDefaultTags, setFeedDefaultTags } from "../lib/db";
import type { Tag, TagWithCount } from "../types/database";

export type FeedEntry = {
  subId: string;
  feedId: string;
  title: string;
  siteUrl: string | null;
  unread: number;
};

export type NavFilter = {
  feedId?: string;
  folder?: string;
  analytics?: boolean;
  digest?: boolean;
  discover?: boolean;
  starred?: boolean;
  today?: boolean;
  highlights?: boolean;
  tagId?: string;
  tagName?: string;
};

type Props = {
  groups: Record<string, FeedEntry[]>;
  existingFolders: string[];
  activeFeedId: string | null;
  activeFolder: string | null;
  activeAnalytics: boolean;
  activeDigest: boolean;
  activeDiscover: boolean;
  activeStarred: boolean;
  activeToday: boolean;
  activeHighlights: boolean;
  activeTagId: string | null;
  tags: TagWithCount[];
  todayUnread: number;
  onNavigate: (filter: NavFilter) => void;
  onUnsubscribe: (subId: string, feedId: string, title: string) => void;
  onMoveToFolder: (feedId: string, folder: string | null) => void;
};

const NAV_ICONS = {
  all: "M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v12a2 2 0 002 2zm0 0a2 2 0 002-2v-7M7 8h6M7 12h6M7 16h4",
  today: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z",
  starred: "M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z",
  digest: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
  discover: "M12 21a9 9 0 100-18 9 9 0 000 18zm2.8-11.8l-1.9 4.7-4.7 1.9 1.9-4.7 4.7-1.9z",
  highlights: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
  analytics: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
} as const;

function faviconHost(siteUrl: string | null): string | null {
  if (!siteUrl) return null;
  try {
    return new URL(siteUrl).hostname;
  } catch {
    return null;
  }
}

function Favicon({ siteUrl, title }: { siteUrl: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  const host = faviconHost(siteUrl);

  if (!host || failed) {
    return (
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center bg-surface-container text-[8px] font-label font-bold uppercase text-outline">
        {title.charAt(0)}
      </span>
    );
  }
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`}
      alt="" loading="lazy" onError={() => setFailed(true)}
      className="h-3.5 w-3.5 shrink-0"
    />
  );
}

type FeedMenuProps = {
  entry: FeedEntry;
  currentFolder: string | null;
  existingFolders: string[];
  anchor: { top: number; bottom: number; right: number } | null;
  onMoveToFolder: (feedId: string, folder: string | null) => void;
  onUnsubscribe: (subId: string, feedId: string, title: string) => void;
  onClose: () => void;
};

function FeedMenu({ entry, currentFolder, existingFolders, anchor, onMoveToFolder, onUnsubscribe, onClose }: FeedMenuProps) {
  const [confirmingUnsub, setConfirmingUnsub] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [defaultTags, setDefaultTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState("");
  // tagsRef holds the latest set so payloads are never built from a stale render;
  // writeLock serializes writes so rapid add/remove can't overwrite each other.
  const tagsRef = useRef<Tag[]>([]);
  const writeLock = useRef<Promise<unknown>>(Promise.resolve());

  // Position the popover below the ⋯ button, but flip above it when there isn't
  // room below (e.g. the last feeds in the list) so it never runs off-screen.
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number }>(
    () => (anchor ? { top: anchor.bottom + 4, right: anchor.right } : { top: 8, right: 8 })
  );
  useLayoutEffect(() => {
    if (!anchor) return;
    const h = cardRef.current?.offsetHeight ?? 0;
    const fitsBelow = anchor.bottom + 4 + h <= window.innerHeight - 8;
    const roomAbove = anchor.top - 4 - h >= 8;
    setPos(!fitsBelow && roomAbove
      ? { bottom: window.innerHeight - anchor.top + 4, right: anchor.right }
      : { top: anchor.bottom + 4, right: anchor.right });
  }, [anchor, defaultTags.length, showNewFolder, confirmingUnsub]);

  function applyTags(t: Tag[]) { tagsRef.current = t; setDefaultTags(t); }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => { getFeedDefaultTags(entry.feedId).then(applyTags).catch(() => {}); }, [entry.feedId]);

  // Persist the full current set, queued behind any in-flight write, then
  // reconcile from storage (also fixes the optimistic temp ids).
  function persistDefaultTags() {
    const names = tagsRef.current.map((t) => t.name);
    writeLock.current = writeLock.current
      .then(() => setFeedDefaultTags(entry.feedId, names))
      .then(() => getFeedDefaultTags(entry.feedId))
      .then(applyTags)
      .catch(() => {});
  }

  function addDefaultTag() {
    const name = tagInput.trim();
    setTagInput("");
    if (!name || tagsRef.current.some((t) => t.name.toLowerCase() === name.toLowerCase())) return;
    applyTags([...tagsRef.current, { id: `tmp:${name.toLowerCase()}`, name }]);
    persistDefaultTags();
  }

  function removeDefaultTag(tag: Tag) {
    applyTags(tagsRef.current.filter((t) => t.id !== tag.id));
    persistDefaultTags();
  }

  function handleMove(folder: string | null) {
    onMoveToFolder(entry.feedId, folder);
    onClose();
  }

  function onSelectFolder(value: string) {
    if (value === "__new__") { setShowNewFolder(true); return; }
    handleMove(value === "" ? null : value);
  }

  const labelClass = "text-[10px] font-label font-bold uppercase tracking-widest text-outline";
  const fieldClass = "w-full ghost-border bg-surface-container-low px-2 py-1.5 text-xs font-body text-on-surface focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        ref={cardRef}
        role="menu"
        className="fixed z-50 w-60 max-w-[calc(100vw-1rem)] max-h-[calc(100vh-1rem)] overflow-y-auto space-y-3 rounded-lg border border-outline-variant/40 bg-surface-container p-3 shadow-xl"
        style={pos}
        onClick={(e) => e.stopPropagation()}>
        <p className="text-[10px] font-label font-bold uppercase tracking-widest text-primary">
          Feed settings
        </p>

        {/* Folder */}
        <div className="space-y-1">
          <p className={labelClass}>Folder</p>
          <select value={showNewFolder ? "__new__" : (currentFolder ?? "")}
            onChange={(e) => onSelectFolder(e.target.value)}
            className={`${fieldClass} cursor-pointer`}>
            <option value="">No folder</option>
            {existingFolders.map((f) => <option key={f} value={f}>{f}</option>)}
            <option value="__new__">＋ New folder…</option>
          </select>
          {showNewFolder && (
            <form onSubmit={(e) => { e.preventDefault(); const f = newFolder.trim(); if (f) handleMove(f); }}>
              <input autoFocus type="text" value={newFolder} onChange={(e) => setNewFolder(e.target.value)}
                placeholder="New folder name…" className={fieldClass} />
            </form>
          )}
        </div>

        {/* Default tags */}
        <div className="space-y-1">
          <p className={labelClass}>Default tags</p>
          <div className="flex flex-wrap items-center gap-1 ghost-border bg-surface-container-low px-2 py-1.5">
            {defaultTags.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-sm bg-surface-container-high px-1.5 py-0.5 text-[10px] text-on-surface-variant">
                #{t.name}
                <button onClick={() => removeDefaultTag(t)} aria-label={`Remove ${t.name}`} className="hover:text-on-surface">×</button>
              </span>
            ))}
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDefaultTag(); } }}
              placeholder={defaultTags.length ? "Add…" : "Add a tag…"}
              className="min-w-[4rem] flex-1 bg-transparent text-[11px] text-on-surface placeholder-outline focus:outline-none" />
          </div>
          <p className="text-[10px] font-body text-outline">Applied to new articles from this feed.</p>
        </div>

        {/* Unsubscribe */}
        <div className="border-t border-outline-variant/20 pt-2">
          {confirmingUnsub ? (
            <button onClick={() => { onUnsubscribe(entry.subId, entry.feedId, entry.title); onClose(); }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-body font-bold text-error transition-colors hover:bg-error/10">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Confirm unsubscribe?
            </button>
          ) : (
            <button onClick={() => setConfirmingUnsub(true)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-body text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-error">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Unsubscribe
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export default function SidebarNav({ groups, existingFolders, activeFeedId, activeFolder, activeAnalytics, activeDigest, activeDiscover, activeStarred, activeToday, activeHighlights, activeTagId, tags, todayUnread, onNavigate, onUnsubscribe, onMoveToFolder }: Props) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; bottom: number; right: number } | null>(null);
  const [showAllTags, setShowAllTags] = useState(false);
  const TAG_LIMIT = 10;

  function toggleFolder(folder: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      next.has(folder) ? next.delete(folder) : next.add(folder);
      return next;
    });
  }

  const isAllActive = !activeFeedId && !activeFolder && !activeAnalytics && !activeDigest && !activeDiscover && !activeStarred && !activeToday && !activeHighlights && !activeTagId;
  const totalUnread = Object.values(groups).flat().reduce((sum, e) => sum + e.unread, 0);

  const sectionLabel = (label: string) => (
    <p className="px-4 pb-1 text-[10px] font-label font-bold uppercase tracking-[0.1em] text-outline">
      {label}
    </p>
  );

  const navRow = (label: string, icon: keyof typeof NAV_ICONS, active: boolean, badge: number | null, onClick: () => void) => (
    <button onClick={onClick}
      className={["flex w-full items-center justify-between px-3 py-2 text-[13px] font-body transition-all duration-200",
        active ? "border-l-2 border-primary bg-surface-container-low text-primary font-bold"
               : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface border-l-2 border-transparent",
      ].join(" ")}>
      <span className="flex items-center gap-2.5">
        <svg className="h-3.5 w-3.5 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={NAV_ICONS[icon]} />
        </svg>
        <span>{label}</span>
      </span>
      {badge !== null && badge > 0 && (
        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-label font-bold text-primary">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );

  return (
    <nav className="flex-1 overflow-y-auto scrollbar-hide py-3">
      {sectionLabel("Views")}
      {navRow("All Articles", "all", isAllActive, totalUnread, () => onNavigate({}))}
      {navRow("Today", "today", activeToday, todayUnread, () => onNavigate({ today: true }))}
      {navRow("Saved", "starred", activeStarred, null, () => onNavigate({ starred: true }))}
      {navRow("Highlights", "highlights", activeHighlights, null, () => onNavigate({ highlights: true }))}
      {navRow("Digest", "digest", activeDigest, null, () => onNavigate({ digest: true }))}
      {navRow("Discover", "discover", activeDiscover, null, () => onNavigate({ discover: true }))}
      {navRow("Analytics & Stats", "analytics", activeAnalytics, null, () => onNavigate({ analytics: true }))}

      {(() => {
        const inUse = tags.filter((t) => t.count > 0);
        if (inUse.length === 0) return null;
        const shown = showAllTags ? inUse : inUse.slice(0, TAG_LIMIT);
        return (
          <div className="mt-5">
            {sectionLabel("Tags")}
            <div className={showAllTags ? "max-h-64 overflow-y-auto scrollbar-hide" : ""}>
              {shown.map((tag) => (
                <button key={tag.id} onClick={() => onNavigate({ tagId: tag.id, tagName: tag.name })}
                  className={["flex w-full items-center justify-between px-3 py-1.5 text-[13px] font-body transition-all duration-200",
                    activeTagId === tag.id
                      ? "border-l-2 border-primary bg-surface-container-low text-primary font-bold"
                      : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface border-l-2 border-transparent",
                  ].join(" ")}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="text-outline">#</span>
                    <span className="truncate">{tag.name}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-surface-container-high px-1.5 py-0.5 text-[10px] font-label text-on-surface-variant">
                    {tag.count}
                  </span>
                </button>
              ))}
            </div>
            {inUse.length > TAG_LIMIT && (
              <button onClick={() => setShowAllTags((v) => !v)}
                className="flex w-full items-center gap-1 px-3 py-1.5 text-[11px] font-label text-outline transition-colors hover:text-on-surface">
                {showAllTags ? "Show less" : `Show all ${inUse.length}`}
              </button>
            )}
          </div>
        );
      })()}

      {Object.keys(groups).length === 0 ? (
        <p className="px-4 py-3 text-xs text-outline font-label">No feeds yet. Add one above.</p>
      ) : (
        <div className="mt-5">{sectionLabel("Feeds")}</div>
      )}

      {Object.entries(groups).map(([folder, entries]) => {
        const isFolderActive = activeFolder === folder && !activeFeedId;
        const folderUnread = entries.reduce((sum, e) => sum + e.unread, 0);
        const isCollapsed = collapsedFolders.has(folder);
        const multiFolder = Object.keys(groups).length > 1;

        return (
          <div key={folder} className="mt-3">
            <div className="flex items-center gap-1 mb-1">
              {multiFolder ? (
                <button onClick={() => onNavigate({ folder })}
                  className={["flex flex-1 items-center gap-1.5 px-4 py-1 transition-colors",
                    isFolderActive ? "text-primary" : "text-outline hover:text-on-surface-variant"].join(" ")}>
                  <span className="text-[10px] font-label font-bold uppercase tracking-[0.1em]">{folder}</span>
                  {folderUnread > 0 && !isCollapsed && (
                    <span className="text-[10px] font-label opacity-60">{folderUnread > 99 ? "99+" : folderUnread}</span>
                  )}
                </button>
              ) : (
                <div className="flex-1 px-4 py-1">
                  <span className="text-[10px] font-label font-bold uppercase tracking-[0.1em] text-outline">{folder}</span>
                </div>
              )}
              <button onClick={() => toggleFolder(folder)} aria-label={isCollapsed ? "Expand folder" : "Collapse folder"}
                className="mr-2 p-1 text-outline transition-colors hover:text-on-surface-variant">
                <svg className={`h-3 w-3 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {!isCollapsed && (
              <ul>
                {entries.map((entry) => {
                  const isActive = activeFeedId === entry.feedId;
                  const isMenuOpen = menuFor === entry.subId;
                  return (
                    <li key={entry.subId}>
                      <div
                        className={["group flex items-center transition-all duration-200",
                          isActive ? "border-l-2 border-primary bg-surface-container-low" : "border-l-2 border-transparent hover:bg-surface-container"].join(" ")}>
                        <button onClick={() => onNavigate({ feedId: entry.feedId })}
                          className={["flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-[13px] font-body",
                            isActive ? "text-primary font-bold" : "text-on-surface-variant hover:text-on-surface"].join(" ")}>
                          <Favicon siteUrl={entry.siteUrl} title={entry.title} />
                          <span className="min-w-0 flex-1 truncate text-left">{entry.title}</span>
                          {entry.unread > 0 && (
                            <span className="shrink-0 rounded-full bg-surface-container-high px-1.5 py-0.5 text-[10px] font-label text-on-surface-variant">
                              {entry.unread > 99 ? "99+" : entry.unread}
                            </span>
                          )}
                        </button>
                        <button onClick={(e) => {
                            if (isMenuOpen) { setMenuFor(null); return; }
                            const r = e.currentTarget.getBoundingClientRect();
                            setMenuAnchor({ top: r.top, bottom: r.bottom, right: Math.max(8, window.innerWidth - r.right) });
                            setMenuFor(entry.subId);
                          }}
                          aria-label={`Feed options for ${entry.title}`} aria-expanded={isMenuOpen}
                          className={["mr-2 shrink-0 rounded p-1 text-outline transition-colors hover:text-on-surface group-hover:opacity-100",
                            isMenuOpen ? "opacity-100 text-on-surface" : "opacity-0"].join(" ")}>
                          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
                          </svg>
                        </button>
                      </div>
                      {isMenuOpen && (
                        <FeedMenu
                          entry={entry}
                          currentFolder={folder === "Uncategorized" ? null : folder}
                          existingFolders={existingFolders}
                          anchor={menuAnchor}
                          onMoveToFolder={onMoveToFolder}
                          onUnsubscribe={onUnsubscribe}
                          onClose={() => setMenuFor(null)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
