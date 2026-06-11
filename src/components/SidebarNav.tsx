import { useEffect, useState } from "react";

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
  todayUnread: number;
  onNavigate: (filter: NavFilter) => void;
  onUnsubscribe: (subId: string, feedId: string, title: string) => void;
  onMoveToFolder: (feedId: string, folder: string | null) => void;
};

const NAV_ICONS = {
  all: "M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v12a2 2 0 002 2zm0 0a2 2 0 002-2v-7M7 8h6M7 12h6M7 16h4",
  today: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z",
  starred: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.98 10.1c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
  digest: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
  discover: "M12 21a9 9 0 100-18 9 9 0 000 18zm2.8-11.8l-1.9 4.7-4.7 1.9 1.9-4.7 4.7-1.9z",
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
  onMoveToFolder: (feedId: string, folder: string | null) => void;
  onUnsubscribe: (subId: string, feedId: string, title: string) => void;
  onClose: () => void;
};

function FeedMenu({ entry, currentFolder, existingFolders, onMoveToFolder, onUnsubscribe, onClose }: FeedMenuProps) {
  const [confirmingUnsub, setConfirmingUnsub] = useState(false);
  const [newFolder, setNewFolder] = useState("");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const moveTargets = existingFolders.filter((f) => f !== currentFolder);

  function handleMove(folder: string | null) {
    onMoveToFolder(entry.feedId, folder);
    onClose();
  }

  const itemClass =
    "block w-full px-3 py-1.5 text-left text-xs font-body text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface";

  return (
    <div className="border-l-2 border-primary/30 bg-surface-container-low py-2">
      <p className="px-3 pb-1 text-[10px] font-label font-bold uppercase tracking-widest text-outline">
        Move to folder
      </p>
      {moveTargets.map((folder) => (
        <button key={folder} onClick={() => handleMove(folder)} className={itemClass}>
          {folder}
        </button>
      ))}
      {currentFolder !== null && (
        <button onClick={() => handleMove(null)} className={itemClass}>
          Remove from folder
        </button>
      )}
      <form
        className="px-3 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          const folder = newFolder.trim();
          if (folder) handleMove(folder);
        }}>
        <input
          type="text" value={newFolder} onChange={(e) => setNewFolder(e.target.value)}
          placeholder="New folder…"
          className="w-full ghost-border bg-surface-container px-2 py-1 text-xs text-on-surface placeholder-outline focus:outline-none focus:ring-1 focus:ring-primary font-body"
        />
      </form>
      <div className="mx-3 my-1 border-t border-outline-variant/20" />
      {confirmingUnsub ? (
        <button
          onClick={() => { onUnsubscribe(entry.subId, entry.feedId, entry.title); onClose(); }}
          className="block w-full px-3 py-1.5 text-left text-xs font-body font-bold text-error transition-colors hover:bg-surface-container">
          Confirm unsubscribe?
        </button>
      ) : (
        <button onClick={() => setConfirmingUnsub(true)} className={`${itemClass} hover:text-error`}>
          Unsubscribe…
        </button>
      )}
    </div>
  );
}

export default function SidebarNav({ groups, existingFolders, activeFeedId, activeFolder, activeAnalytics, activeDigest, activeDiscover, activeStarred, activeToday, todayUnread, onNavigate, onUnsubscribe, onMoveToFolder }: Props) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);

  function toggleFolder(folder: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      next.has(folder) ? next.delete(folder) : next.add(folder);
      return next;
    });
  }

  const isAllActive = !activeFeedId && !activeFolder && !activeAnalytics && !activeDigest && !activeDiscover && !activeStarred && !activeToday;
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
      {navRow("Starred", "starred", activeStarred, null, () => onNavigate({ starred: true }))}
      {navRow("Digest", "digest", activeDigest, null, () => onNavigate({ digest: true }))}
      {navRow("Discover", "discover", activeDiscover, null, () => onNavigate({ discover: true }))}
      {navRow("Analytics & Stats", "analytics", activeAnalytics, null, () => onNavigate({ analytics: true }))}

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
                        <button onClick={() => setMenuFor(isMenuOpen ? null : entry.subId)}
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
