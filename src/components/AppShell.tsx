import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ShortcutsModal from "./ShortcutsModal";
import ReadUrlModal from "./ReadUrlModal";
import ArticlePane from "./ArticlePane";
import { useKeyboardShortcuts } from "../lib/hooks/use-keyboard-shortcuts";
import { useFeedRefresh } from "../lib/hooks/use-feed-refresh";
import { getLastSyncedAt } from "../lib/db";
import { ReaderProvider, useReader } from "../lib/reader-context";

/**
 * Below this the window can't seat rail + reader + list at once: 256 rail +
 * 320 list + 920 reader, where 920 is the 680px column with the brief's 120px
 * margins. Under it the rail steps aside while reading.
 */
const THREE_COLUMN_MIN = 1500;

/** Under this there isn't room to dock at all, so the reader stays an overlay. */
const DOCK_MIN = 1100;

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Turn extracted PDF text into simple paragraph HTML for the reader. */
function pdfTextToHtml(text: string): string {
  const byBlank = text.split(/\n\s*\n/).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  const paras = byBlank.length > 1 ? byBlank : text.split(/\n/).map((s) => s.trim()).filter(Boolean);
  return paras.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
}

function pdfTitleFromPath(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? "Document";
  return base.replace(/\.pdf$/i, "");
}

function formatSynced(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const m = Math.floor(Math.max(0, now - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type Props = {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  onRefreshComplete: () => void;
};

export default function AppShell(props: Props) {
  return (
    <ReaderProvider>
      <AppShellInner {...props} />
    </ReaderProvider>
  );
}

function AppShellInner({ sidebar, main, onRefreshComplete }: Props) {
  const reader = useReader();
  const viewportWidth = useViewportWidth();
  const docked = reader.isOpen && viewportWidth >= DOCK_MIN;
  // Chat takes the right column while it's open; 340px is tight for a
  // conversation, so it widens a little.
  const chatInColumn = docked && reader.chatOpen && !reader.minimized;
  // Auto-collapse is a default, not a lock: toggling the rail by hand clears it
  // for as long as the article stays open.
  const [railOverride, setRailOverride] = useState(false);
  const autoCollapsed = docked && viewportWidth < THREE_COLUMN_MIN && !railOverride;
  useEffect(() => { if (!reader.isOpen) setRailOverride(false); }, [reader.isOpen]);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [readUrlOpen, setReadUrlOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useKeyboardShortcuts({ "?": () => setShowShortcuts((v) => !v) });

  // "Synced X ago" indicator: seed from the DB, refresh the relative label every
  // 30s, and update on any sync (manual or background — both emit the event).
  useEffect(() => {
    getLastSyncedAt().then(setLastSyncedAt).catch(() => {});
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  useFeedRefresh(useCallback(() => {
    setLastSyncedAt(new Date().toISOString());
    setNow(Date.now());
  }, []));
  const syncedLabel = formatSynced(lastSyncedAt, now);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey && e.key === "l") {
        e.preventDefault();
        setReadUrlOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }

  async function handleReadPdf(path: string) {
    showToast("Reading PDF…");
    try {
      const text = await invoke<string>("extract_pdf_text", { path });
      const content = pdfTextToHtml(text);
      if (!content) { showToast("Couldn't extract any text from that PDF"); return; }
      const title = pdfTitleFromPath(path);
      reader.open({ url: path, title, content: { title, byline: null, siteName: "PDF", content } });
      setToast(null);
    } catch (err) {
      console.error("PDF read failed:", err);
      showToast("Failed to read that PDF");
    }
  }

  async function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const result = await invoke<{ new_items: number; feeds_checked: number }>("refresh_feeds_now");
      showToast(
        result.new_items > 0
          ? `${result.new_items} item${result.new_items !== 1 ? "s" : ""} fetched across ${result.feeds_checked} feeds`
          : `${result.feeds_checked} feeds checked — already up to date`
      );
      onRefreshComplete();
    } catch {
      showToast("Refresh failed — check your connection");
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Ghost chrome: no border, no fill. The brand and Settings live in the
          rail now, so this strip carries only transient actions and fades into
          the page margin. */}
      <header className="flex h-14 shrink-0 items-center gap-1 bg-background px-6 z-50">
        <button
          onClick={() => {
            if (autoCollapsed) { setRailOverride(true); setSidebarOpen(true); return; }
            setSidebarOpen((v) => !v);
          }}
          aria-label={sidebarOpen && !autoCollapsed ? "Close sidebar" : "Open sidebar"}
          className="rounded p-1.5 text-outline transition-colors hover:text-primary">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>

        <div className="flex-1" />

        {syncedLabel && (
          <span
            title={lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}` : undefined}
            className="mr-2 hidden sm:inline font-label text-ui-small uppercase tracking-[0.1em] text-outline">
            Synced {syncedLabel}
          </span>
        )}

        <button onClick={handleRefresh} disabled={isRefreshing} aria-label="Refresh feeds"
          className="rounded p-1.5 text-outline transition-colors hover:text-primary disabled:opacity-30">
          <svg className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <button onClick={() => setReadUrlOpen(true)} aria-label="Read article URL (⌘L)"
          className="rounded p-1.5 text-outline transition-colors hover:text-primary">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </button>

        <button onClick={() => setShowShortcuts(true)} aria-label="Keyboard shortcuts (?)">
          <svg className="h-5 w-5 rounded p-0 text-outline transition-colors hover:text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="2" y="6" width="20" height="13" rx="2" strokeWidth={1.75} />
            <path strokeLinecap="round" strokeWidth={1.75} d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
          </svg>
        </button>

      </header>

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && !autoCollapsed && (
          <aside className="w-64 shrink-0 overflow-y-auto scrollbar-hide border-r border-outline-variant bg-surface">
            {sidebar}
          </aside>
        )}

        {/* Docked reader takes the centre; the list reflows to a narrow column
            on the right so what you're reading stays optically centred. */}
        {docked && reader.request && (
          <ArticlePane
            key={reader.request.url}
            url={reader.request.url}
            title={reader.request.title}
            itemId={reader.request.itemId}
            content={reader.request.content}
            docked
            onClose={reader.close}
          />
        )}

        {/* The list stays mounted behind the chat rather than unmounting, so
            its scroll position and loaded pages survive the round trip. */}
        <main
          className={[
            "overflow-y-auto scrollbar-hide bg-background",
            // Minimised, the reader gives its width back rather than leaving a gap.
            docked && !reader.minimized ? "w-[340px] shrink-0" : "flex-1",
            chatInColumn ? "hidden" : "",
          ].join(" ")}
        >
          {main}
        </main>

        {chatInColumn && (
          <div id="reader-chat-slot" className="w-[400px] shrink-0 overflow-hidden bg-reader-bg" />
        )}
      </div>

      <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {readUrlOpen && (
        <ReadUrlModal
          onSubmit={(url) => reader.open({ url, title: null, content: null })}
          onSubmitPdf={handleReadPdf}
          onClose={() => setReadUrlOpen(false)}
        />
      )}

      {!docked && reader.request && (
        <ArticlePane
          key={reader.request.url}
          url={reader.request.url}
          title={reader.request.title}
          itemId={reader.request.itemId}
          content={reader.request.content}
          onClose={reader.close}
        />
      )}

      {toast && (
        <div role="status" aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 ghost-border bg-surface-container-lowest px-4 py-3 text-sm text-on-surface ambient-shadow">
          <svg className="h-4 w-4 shrink-0 text-primary" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
          </svg>
          <span className="font-label text-ui-small uppercase tracking-[0.1em]">{toast}</span>
          <button onClick={() => setToast(null)} aria-label="Dismiss" className="ml-1 text-outline hover:text-on-surface">
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
