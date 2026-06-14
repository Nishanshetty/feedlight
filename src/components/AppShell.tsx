import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ShortcutsModal from "./ShortcutsModal";
import ReadUrlModal from "./ReadUrlModal";
import ArticlePane from "./ArticlePane";
import { useKeyboardShortcuts } from "../lib/hooks/use-keyboard-shortcuts";
import { Link } from "@tanstack/react-router";

type Props = {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  onRefreshComplete: () => void;
};

export default function AppShell({ sidebar, main, onRefreshComplete }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [readUrlOpen, setReadUrlOpen] = useState(false);
  const [quickReadUrl, setQuickReadUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useKeyboardShortcuts({ "?": () => setShowShortcuts((v) => !v) });

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
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-outline-variant/40 bg-background/80 backdrop-blur-xl px-6 z-50">
        <button onClick={() => setSidebarOpen((v) => !v)} aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          className="rounded p-1.5 text-on-surface-variant transition-colors hover:text-primary">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>

        <span className="font-headline text-lg font-bold tracking-[0.2em] text-primary uppercase">FEEDLIGHT</span>

        <div className="flex-1" />

        <button onClick={handleRefresh} disabled={isRefreshing} aria-label="Refresh feeds"
          className="rounded p-1.5 text-on-surface-variant transition-colors hover:text-primary disabled:opacity-30">
          <svg className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <button onClick={() => setReadUrlOpen(true)} aria-label="Read article URL (⌘L)"
          className="rounded p-1.5 text-on-surface-variant transition-colors hover:text-primary">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </button>

        <button onClick={() => setShowShortcuts(true)} aria-label="Keyboard shortcuts (?)">
          <svg className="h-5 w-5 rounded p-0 text-on-surface-variant transition-colors hover:text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="2" y="6" width="20" height="13" rx="2" strokeWidth={1.75} />
            <path strokeLinecap="round" strokeWidth={1.75} d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
          </svg>
        </button>

        <Link to="/settings" aria-label="Settings"
          className="rounded p-1.5 text-on-surface-variant transition-colors hover:text-primary">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>
      </header>

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <aside className="w-64 shrink-0 overflow-y-auto border-r border-outline-variant/40 bg-surface">
            {sidebar}
          </aside>
        )}
        <main className="flex-1 overflow-y-auto scrollbar-hide bg-background">{main}</main>
      </div>

      <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {readUrlOpen && (
        <ReadUrlModal
          onSubmit={(url) => setQuickReadUrl(url)}
          onClose={() => setReadUrlOpen(false)}
        />
      )}

      {quickReadUrl && (
        <ArticlePane url={quickReadUrl} title={null} onClose={() => setQuickReadUrl(null)} />
      )}

      {toast && (
        <div role="status" aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 ghost-border bg-surface-container px-4 py-3 text-sm text-on-surface shadow-2xl">
          <svg className="h-4 w-4 shrink-0 text-primary" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
          </svg>
          <span className="font-label text-xs uppercase tracking-wide">{toast}</span>
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
