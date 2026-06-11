export type DateRange = "1d" | "7d" | "30d" | "all";

export const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "1d", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

export const DEFAULT_RANGE: DateRange = "7d";

export function isValidRange(v: string | undefined | null): v is DateRange {
  return v === "1d" || v === "7d" || v === "30d" || v === "all";
}

export function rangeToSince(range: DateRange): string | null {
  if (range === "all") return null;
  // "1d" means calendar-today, so subtract 0 days before flooring to midnight.
  const days = range === "1d" ? 0 : range === "7d" ? 7 : 30;
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
