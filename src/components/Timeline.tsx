import type { DateRange } from "../lib/date-range";
import { rangeToSince } from "../lib/date-range";
import TimelineList from "./TimelineList";

type Props = {
  feedIds: string[];
  filterLabel: string;
  range: DateRange;
  starredOnly: boolean;
  lockRange?: boolean;
  refreshKey: number;
  onRangeChange: (r: DateRange) => void;
  onStatesChanged: () => void;
};

const PAGE_SIZE = 20;

export default function Timeline({ feedIds, filterLabel, range, starredOnly, lockRange, refreshKey, onRangeChange, onStatesChanged }: Props) {
  const since = rangeToSince(range);
  const filterKey = `${feedIds.join(",")}|${range}|${starredOnly}|${refreshKey}`;

  return (
    <TimelineList
      feedIds={feedIds}
      filterLabel={filterLabel}
      filterKey={filterKey}
      range={range}
      since={since}
      starredOnly={starredOnly}
      lockRange={lockRange}
      pageSize={PAGE_SIZE}
      onRangeChange={onRangeChange}
      onStatesChanged={onStatesChanged}
    />
  );
}
