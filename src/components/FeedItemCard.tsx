import type { TimelineItem } from "../types/database";

const ACCENT_STYLES = [
  {
    badge:      "text-primary bg-primary/10 border border-primary/20",
    cardHover:  "hover:border-primary/50",
    titleHover: "group-hover:text-primary",
    iconHover:  "group-hover:text-primary",
  },
  {
    badge:      "text-secondary bg-secondary/10 border border-secondary/20",
    cardHover:  "hover:border-secondary/50",
    titleHover: "group-hover:text-secondary",
    iconHover:  "group-hover:text-secondary",
  },
  {
    badge:      "text-tertiary bg-tertiary/10 border border-tertiary/20",
    cardHover:  "hover:border-tertiary/50",
    titleHover: "group-hover:text-tertiary",
    iconHover:  "group-hover:text-tertiary",
  },
] as const;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractFirstImage(html: string): string | null {
  const src = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? null;
  return src && /^https?:\/\//i.test(src) ? src : null;
}

function readMinutes(text: string): number {
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 220));
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(diff / 3_600_000);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Props = {
  item: TimelineItem;
  isRead: boolean;
  isStarred: boolean;
  isSelected: boolean;
  accentIndex: number;
  layout: "card" | "row";
  hero?: boolean;
  onActivate: () => void;
  onOpen: () => void;
  onToggleStar: (e: React.MouseEvent) => void;
  elRef: (el: HTMLLIElement | null) => void;
};

function ProgressLine({ progress }: { progress: number }) {
  if (progress <= 0 || progress >= 0.97) return null;
  return (
    <div className="absolute bottom-0 left-0 h-0.5 bg-primary/70 pointer-events-none"
      style={{ width: `${progress * 100}%` }} />
  );
}

function StarButton({ isStarred, onToggleStar }: { isStarred: boolean; onToggleStar: (e: React.MouseEvent) => void }) {
  return (
    <button onClick={onToggleStar} aria-label={isStarred ? "Remove from Saved" : "Save"}
      className={["rounded p-0.5 transition-colors", isStarred ? "text-tertiary" : "text-outline opacity-0 group-hover:opacity-100 hover:text-tertiary"].join(" ")}>
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill={isStarred ? "currentColor" : "none"} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    </button>
  );
}

function YouTubeCard({
  item, isRead, isStarred, isSelected, accent, onActivate, onOpen, onToggleStar,
}: Omit<Props, "accentIndex" | "elRef" | "layout" | "hero"> & { accent: (typeof ACCENT_STYLES)[number] }) {
  return (
    <div onClick={onActivate} className="flex flex-col flex-1 cursor-pointer select-none">
      <div className="relative aspect-video overflow-hidden bg-surface-container-high">
        <img
          src={item.thumbnail_url!}
          alt={item.title ?? ""}
          className={`h-full w-full object-cover transition-opacity duration-200 ${isRead && !isSelected ? "opacity-40" : "opacity-100"}`}
        />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <div className="flex h-10 w-10 items-center justify-center bg-primary/90">
            <svg className="h-4 w-4 translate-x-0.5 text-on-primary" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
      <div className="flex flex-col flex-1 p-4">
        <div className="flex justify-between items-start mb-2">
          {item.feed_title && (
            <span className={`text-[9px] font-label font-bold tracking-widest uppercase px-2 py-0.5 truncate ${accent.badge}`}>
              {item.feed_title}
            </span>
          )}
          <span className="text-[9px] font-label text-outline uppercase shrink-0 ml-auto pl-2">
            {formatRelative(item.published_at)}
          </span>
        </div>
        <h3 className={`text-sm font-headline font-semibold leading-snug text-on-surface transition-colors ${accent.titleHover} ${isRead && !isSelected ? "opacity-50" : ""}`}>
          {item.title ?? "Untitled"}
        </h3>
        <div className="mt-auto pt-3 flex items-center justify-end gap-2">
          <StarButton isStarred={isStarred} onToggleStar={onToggleStar} />
          <button onClick={(e) => { e.stopPropagation(); onOpen(); }} aria-label="Open video"
            className={`rounded p-0.5 text-outline transition-colors opacity-0 group-hover:opacity-100 ${accent.iconHover}`}>
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FeedItemCard({ item, isRead, isStarred, isSelected, accentIndex, layout, hero, onActivate, onOpen, onToggleStar, elRef }: Props) {
  const accent = ACCENT_STYLES[accentIndex % 3];
  const stripped = item.content ? stripHtml(item.content) : null;
  const minutes = stripped ? readMinutes(stripped) : null;
  const imageUrl = !item.thumbnail_url && item.content ? extractFirstImage(item.content) : null;
  const isHero = !!hero && layout === "card" && !item.thumbnail_url;
  const preview = stripped ? stripped.slice(0, isHero ? 320 : 200) : null;

  if (layout === "row") {
    return (
      <li ref={elRef} onClick={onActivate}
        className={["group relative flex items-center gap-3 px-4 py-2 border-l-2 cursor-pointer select-none transition-colors",
          isSelected ? "border-primary bg-surface-container-low" : "border-transparent hover:bg-surface-container",
          isRead && !isSelected ? "opacity-50" : ""].join(" ")}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isRead ? "bg-outline-variant/60" : "bg-primary"}`} />
        {item.feed_title && (
          <span className={`hidden sm:inline-block shrink-0 max-w-[9rem] truncate text-[9px] font-label font-bold tracking-widest uppercase px-2 py-0.5 ${accent.badge}`}>
            {item.feed_title}
          </span>
        )}
        <span className={`min-w-0 flex-1 truncate text-[13px] font-body text-on-surface transition-colors ${accent.titleHover}`}>
          {item.title ?? "Untitled"}
        </span>
        <span className="shrink-0 text-[9px] font-label text-outline uppercase">
          {minutes ? `${minutes} min · ` : ""}{formatRelative(item.published_at)}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <StarButton isStarred={isStarred} onToggleStar={onToggleStar} />
          <button onClick={(e) => { e.stopPropagation(); onOpen(); }} aria-label="Open article"
            className={`rounded p-0.5 text-outline transition-colors opacity-0 group-hover:opacity-100 ${accent.iconHover}`}>
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        </div>
        <ProgressLine progress={item.read_progress} />
      </li>
    );
  }

  return (
    <li ref={elRef}
      className={["group relative flex flex-col bg-surface-container-lowest border transition-all duration-200",
        isHero ? "col-span-full" : "",
        isSelected ? "border-primary/60 ring-1 ring-primary/20" : `border-outline-variant/40 ${accent.cardHover}`].join(" ")}>
      {item.thumbnail_url ? (
        <YouTubeCard item={item} isRead={isRead} isStarred={isStarred} isSelected={isSelected}
          accent={accent} onActivate={onActivate} onOpen={onOpen} onToggleStar={onToggleStar} />
      ) : (
        <div onClick={onActivate}
          className={`flex flex-col flex-1 cursor-pointer select-none ${isRead && !isSelected ? "opacity-50" : ""}`}>
          {imageUrl && (
            <div className={`overflow-hidden bg-surface-container-high ${isHero ? "h-60" : "h-36"}`}>
              <img src={imageUrl} alt="" loading="lazy"
                onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
                className="h-full w-full object-cover" />
            </div>
          )}
          <div className="flex flex-col flex-1 p-5">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2 min-w-0">
                {!isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                {item.feed_title && (
                  <span className={`text-[9px] font-label font-bold tracking-widest uppercase px-2 py-0.5 truncate ${accent.badge}`}>
                    {item.feed_title}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-label text-outline uppercase shrink-0 ml-2">
                {minutes ? `${minutes} min · ` : ""}{formatRelative(item.published_at)}
              </span>
            </div>
            <h3 className={`font-headline font-semibold leading-snug mb-3 text-on-surface transition-colors ${accent.titleHover} ${isHero ? "text-2xl" : "text-base"}`}>
              {item.title ?? "Untitled"}
            </h3>
            {preview && (
              <p className={`font-body text-on-surface-variant leading-relaxed mb-6 ${isHero ? "text-sm line-clamp-3 max-w-3xl" : imageUrl ? "text-xs line-clamp-2" : "text-xs line-clamp-3"}`}>{preview}</p>
            )}
            <div className="mt-auto pt-4 border-t border-outline-variant/30 flex items-center justify-between gap-2">
              <span className="text-[9px] font-label text-outline uppercase truncate">
                {item.author ?? item.feed_title ?? ""}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <StarButton isStarred={isStarred} onToggleStar={onToggleStar} />
                <button onClick={(e) => { e.stopPropagation(); onOpen(); }} aria-label="Open article"
                  className={`rounded p-0.5 text-outline transition-colors opacity-0 group-hover:opacity-100 ${accent.iconHover}`}>
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ProgressLine progress={item.read_progress} />
    </li>
  );
}
