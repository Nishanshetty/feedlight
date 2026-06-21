import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getSavedItems, unsaveItem, upsertItemState } from "../lib/db";
import type { TimelineItem } from "../types/database";
import { useKeyboardShortcuts } from "../lib/hooks/use-keyboard-shortcuts";
import FeedItemCard from "./FeedItemCard";
import ArticlePane from "./ArticlePane";

type Props = {
  refreshKey: number;
  onStatesChanged: () => void;
};

export default function SavedView({ refreshKey, onStatesChanged }: Props) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [paneItem, setPaneItem] = useState<TimelineItem | null>(null);
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
    setPaneItem(item);
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
    Escape: () => setPaneItem(null),
    s: () => { if (selectedIndex >= 0) handleUnsave(selectedIndex); },
  });

  return (
    <div className="relative">
      <div className={`h-0.5 w-full transition-all duration-300 ${isLoading ? "bg-primary/60" : "bg-transparent"}`}>
        {isLoading && <div className="h-full w-1/3 bg-primary animate-[slide_1.2s_ease-in-out_infinite]" />}
      </div>

      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-outline-variant/40 bg-background/80 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[11px] font-headline font-bold uppercase tracking-widest text-outline">
            Queue / Saved
          </h3>
          {items.length > 0 && (
            <span className="text-[10px] font-label text-outline opacity-60">{items.length} saved</span>
          )}
        </div>
      </div>

      {items.length === 0 && !isLoading ? (
        <div className="px-6 py-20 text-center">
          <p className="text-[12px] font-label text-outline uppercase tracking-widest">
            Nothing saved yet. Bookmark an article or save one you open with ⌘L.
          </p>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 p-6">
            {items.map((item, index) => (
              <FeedItemCard key={item.id} item={item}
                isRead={readIds.has(item.id)} isStarred={true}
                isSelected={index === selectedIndex} accentIndex={index}
                layout="card" hero={false}
                onActivate={() => selectAndRead(index)}
                onOpen={() => { if (item.link) openUrl(item.link); }}
                onToggleStar={(e) => handleUnsave(index, e)}
                elRef={(el) => { itemRefs.current[index] = el; }} />
            ))}
          </ul>
          {loadError && <p className="pb-8 text-center text-[11px] font-label text-error">{loadError}</p>}
        </>
      )}

      {paneItem?.link && (
        <ArticlePane url={paneItem.link} title={paneItem.title} itemId={paneItem.id} onClose={() => setPaneItem(null)} />
      )}
    </div>
  );
}
