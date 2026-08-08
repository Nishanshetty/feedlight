import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getSavedItems, unsaveItem, upsertItemState } from "../lib/db";
import type { TimelineItem } from "../types/database";
import { useKeyboardShortcuts } from "../lib/hooks/use-keyboard-shortcuts";
import FeedItemCard from "./FeedItemCard";
import { useReader } from "../lib/reader-context";

type Props = {
  refreshKey: number;
  onStatesChanged: () => void;
};

export default function SavedView({ refreshKey, onStatesChanged }: Props) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const reader = useReader();
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    setIsLoading(true);
    setLoadError("");
    getSavedItems()
      .then((saved) => {
        setItems(saved);
        setReadIds(new Set(saved.filter((i) => i.is_read).map((i) => i.id)));
        setSelectedIndex(-1);
      })
      .catch((err) => setLoadError(String(err)))
      .finally(() => setIsLoading(false));
  }, [refreshKey]);

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
      setReadIds((prev) => new Set(Array.from(prev).concat(item.id)));
      upsertItemState(item.id, { is_read: true }).then(onStatesChanged).catch(console.error);
    }
  }

  function handleUnsave(index: number, e?: React.MouseEvent) {
    e?.stopPropagation();
    const item = items[index];
    if (!item) return;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setSelectedIndex(-1);
    unsaveItem({ id: item.id, feed_id: item.feed_id }).then(onStatesChanged).catch(console.error);
  }

  useKeyboardShortcuts({
    j: () => setSelectedIndex((prev) => (prev < 0 ? 0 : Math.min(prev + 1, items.length - 1))),
    k: () => setSelectedIndex((prev) => (prev < 0 ? 0 : Math.max(prev - 1, 0))),
    o: () => { if (selectedIndex >= 0) selectAndRead(selectedIndex); },
    Enter: () => { if (selectedIndex >= 0) selectAndRead(selectedIndex); },
    Escape: () => reader.close(),
    s: () => { if (selectedIndex >= 0) handleUnsave(selectedIndex); },
  });

  return (
    <div className="relative">
      <div className={`h-0.5 w-full transition-all duration-300 ${isLoading ? "bg-tertiary/30" : "bg-transparent"}`}>
        {isLoading && <div className="h-full w-1/3 bg-tertiary animate-[slide_1.2s_ease-in-out_infinite]" />}
      </div>

      <header className={reader.isOpen ? "px-4 pb-4 pt-unit" : "px-reading-margin-mobile lg:px-16 2xl:px-reading-margin-desktop pb-stack-md pt-unit"}>
        <h1 className={`font-headline text-primary ${reader.isOpen ? "text-headline-md" : "text-headline-lg-mobile md:text-headline-lg"}`}>Saved</h1>
        <p className="mt-2 font-label text-ui-label text-on-surface-variant">
          {items.length > 0 ? `${items.length} article${items.length !== 1 ? "s" : ""}` : "Nothing saved yet"}
        </p>
      </header>

      {items.length === 0 && !isLoading ? (
        <div className="px-reading-margin-mobile lg:px-16 2xl:px-reading-margin-desktop py-20 text-center">
          <p className="text-ui-label font-label text-outline uppercase tracking-[0.14em]">
            Nothing saved yet. Bookmark an article or save one you open with ⌘L.
          </p>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 p-6">
            {items.map((item, index) => (
              <FeedItemCard key={item.id} item={item}
                isRead={readIds.has(item.id)} isStarred={true}
                isSelected={index === selectedIndex}
                layout={reader.isOpen ? "compact" : "card"} hero={false}
                onActivate={() => selectAndRead(index)}
                onOpen={() => { if (item.link) openUrl(item.link); }}
                onToggleStar={(e) => handleUnsave(index, e)}
                elRef={(el) => { itemRefs.current[index] = el; }} />
            ))}
          </ul>
          {loadError && <p className="pb-8 text-center text-ui-small font-label text-error">{loadError}</p>}
        </>
      )}

    </div>
  );
}
