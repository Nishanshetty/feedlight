import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ArchivedContent } from "./db";

/**
 * One article open at a time, owned above the views that open it.
 *
 * The reader used to be mounted separately by the timeline, saved, highlights
 * and ⌘L paths, which worked only because it positioned itself `fixed` and
 * escaped whatever container it landed in. Docking it beside the list means it
 * has to be a real sibling of that list, so the open article lives here instead.
 */
export type ReaderRequest = {
  url: string;
  title: string | null;
  /** When set, reading progress and highlights are persisted against this item. */
  itemId?: string | null;
  /** Pre-extracted content (a PDF, say) — skips fetching. */
  content?: ArchivedContent | null;
  /** Caller-specific cleanup, e.g. Highlights re-reading its list on close. */
  onClose?: () => void;
};

type ReaderContextValue = {
  request: ReaderRequest | null;
  isOpen: boolean;
  open: (request: ReaderRequest) => void;
  close: () => void;
};

const ReaderContext = createContext<ReaderContextValue | null>(null);

export function ReaderProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<ReaderRequest | null>(null);

  const open = useCallback((next: ReaderRequest) => {
    // Run the outgoing article's cleanup when replacing it directly, so opening
    // a second article from Highlights still refreshes the list behind it.
    setRequest((prev) => {
      if (prev && prev !== next) prev.onClose?.();
      return next;
    });
  }, []);

  const close = useCallback(() => {
    setRequest((prev) => {
      prev?.onClose?.();
      return null;
    });
  }, []);

  const value = useMemo<ReaderContextValue>(
    () => ({ request, isOpen: request !== null, open, close }),
    [request, open, close]
  );

  return <ReaderContext.Provider value={value}>{children}</ReaderContext.Provider>;
}

export function useReader(): ReaderContextValue {
  const ctx = useContext(ReaderContext);
  if (!ctx) throw new Error("useReader must be used inside a ReaderProvider");
  return ctx;
}
