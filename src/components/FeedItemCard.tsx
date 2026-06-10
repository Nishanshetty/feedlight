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
  onActivate: () => void;
  onOpen: () => void;
  onToggleStar: (e: React.MouseEvent) => void;
  elRef: (el: HTMLLIElement | null) => void;
};

function YouTubeCard({
  item, isRead, isStarred, isSelected, accent, onActivate, onOpen, onToggleStar,
}: Omit<Props, "accentIndex" | "elRef"> & { accent: (typeof ACCENT_STYLES)[number] }) {
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
          <button onClick={onToggleStar} aria-label={isStarred ? "Unstar" : "Star"}
            className={["rounded p-0.5 transition-colors", isStarred ? "text-tertiary" : "text-outline opacity-0 group-hover:opacity-100 hover:text-tertiary"].join(" ")}>
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </button>
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

export default function FeedItemCard({ item, isRead, isStarred, isSelected, accentIndex, onActivate, onOpen, onToggleStar, elRef }: Props) {
  const accent = ACCENT_STYLES[accentIndex % 3];
  const stripped = item.content ? stripHtml(item.content) : null;
  const preview = stripped ? stripped.slice(0, 200) : null;
  const minutes = stripped ? readMinutes(stripped) : null;
  const imageUrl = !item.thumbnail_url && item.content ? extractFirstImage(item.content) : null;

  return (
    <li ref={elRef}
      className={["group relative flex flex-col bg-surface-container-lowest border transition-all duration-200",
        isSelected ? "border-primary/60 ring-1 ring-primary/20" : `border-outline-variant/40 ${accent.cardHover}`].join(" ")}>
      {item.thumbnail_url ? (
        <YouTubeCard item={item} isRead={isRead} isStarred={isStarred} isSelected={isSelected}
          accent={accent} onActivate={onActivate} onOpen={onOpen} onToggleStar={onToggleStar} />
      ) : (
        <div onClick={onActivate}
          className={`flex flex-col flex-1 cursor-pointer select-none ${isRead && !isSelected ? "opacity-50" : ""}`}>
          {imageUrl && (
            <div className="h-36 overflow-hidden bg-surface-container-high">
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
            <h3 className={`text-base font-headline font-semibold leading-snug mb-3 text-on-surface transition-colors ${accent.titleHover}`}>
              {item.title ?? "Untitled"}
            </h3>
            {preview && (
              <p className={`text-xs font-body text-on-surface-variant leading-relaxed mb-6 ${imageUrl ? "line-clamp-2" : "line-clamp-3"}`}>{preview}</p>
            )}
            <div className="mt-auto pt-4 border-t border-outline-variant/30 flex items-center justify-between gap-2">
              <span className="text-[9px] font-label text-outline uppercase truncate">
                {item.author ?? item.feed_title ?? ""}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={onToggleStar} aria-label={isStarred ? "Unstar" : "Star"}
                  className={["rounded p-0.5 transition-colors", isStarred ? "text-tertiary" : "text-outline opacity-0 group-hover:opacity-100 hover:text-tertiary"].join(" ")}>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </button>
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
    </li>
  );
}
