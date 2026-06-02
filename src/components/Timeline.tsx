import type { DateRange } from "../lib/date-range";
import { rangeToSince } from "../lib/date-range";
import TimelineList from "./TimelineList";

type Props = {
  feedIds: string[];
  filterLabel: string;
  range: DateRange;
  unreadOnly: boolean;
  refreshKey: number;
  onRangeChange: (r: DateRange) => void;
  onStatesChanged: () => void;
};

const PAGE_SIZE = 20;

export default function Timeline({ feedIds, filterLabel, range, unreadOnly, refreshKey, onRangeChange, onStatesChanged }: Props) {
  const since = rangeToSince(range);
  const filterKey = `${feedIds.join(",")}|${range}|${unreadOnly}|${refreshKey}`;

  return (
    <TimelineList
      feedIds={feedIds}
      filterLabel={filterLabel}
      filterKey={filterKey}
      range={range}
      since={since}
      unreadOnly={unreadOnly}
      pageSize={PAGE_SIZE}
      onRangeChange={onRangeChange}
      onStatesChanged={onStatesChanged}
    />
  );
}
