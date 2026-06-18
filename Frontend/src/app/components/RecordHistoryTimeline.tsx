import type { HistoryEntry } from "../data/apiClient";
import { GitBranch } from "lucide-react";
import { useMemo, useState } from "react";
import { RecordHistoryGraphDialog } from "./RecordHistoryGraphDialog";
import { formatTimestampMinute } from "../utils/dateTime";
import {
  formatHistoryEntryText,
  groupAdjacentHistoryUpdateEntries,
  getHistoryActionBadgeClass,
  parseQuotedReply,
  sortHistoryEntries,
} from "../utils/historyEntries";

export { formatHistoryEntryText } from "../utils/historyEntries";

interface RecordHistoryTimelineProps {
  history?: HistoryEntry[];
  emptyMessage?: string;
  initialVisibleCount?: number;
  onQuote?: (entry: HistoryEntry) => void;
  onReply?: (entry: HistoryEntry, comment: string) => Promise<void>;
  isReplying?: boolean;
}

type HistoryTimelineItem =
  | { kind: "entry"; entry: HistoryEntry }
  | { kind: "group"; id: string; entries: HistoryEntry[] };

const wrappingTextClass = "min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]";

function groupTimelineEntries(entries: HistoryEntry[]): HistoryTimelineItem[] {
  const items: HistoryTimelineItem[] = groupAdjacentHistoryUpdateEntries(
    entries.map((entry, index) => ({ entry, index })),
  ).map((group, groupIndex) => {
    if (group.entries.length === 1) return { kind: "entry", entry: group.entries[0] };

    return {
      kind: "group",
      id: `${group.key}|${group.indices[0] ?? groupIndex}`,
      entries: group.entries,
    };
  });

  return items;
}

export function RecordHistoryTimeline({
  history,
  emptyMessage = "No history available",
  initialVisibleCount = 5,
  onQuote,
  onReply,
  isReplying = false,
}: RecordHistoryTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isGraphOpen, setIsGraphOpen] = useState(false);
  const normalizedHistory = Array.isArray(history) ? history : [];
  const sortedHistory = useMemo(() => sortHistoryEntries(normalizedHistory, "desc"), [normalizedHistory]);
  const timelineItems = useMemo(() => groupTimelineEntries(sortedHistory), [sortedHistory]);

  if (timelineItems.length === 0) {
    return <p className="text-sm text-gray-500 italic">{emptyMessage}</p>;
  }

  const hasMore = timelineItems.length > initialVisibleCount;
  const visibleItems = isExpanded ? timelineItems : timelineItems.slice(0, initialVisibleCount);

  return (
    <div className="min-w-0 max-w-full space-y-3 overflow-x-hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {onQuote ? (
          <p className="text-xs text-gray-500">Click a history item to reply it instead of commenting.</p>
        ) : (
          <span />
        )}

        <button
          type="button"
          onClick={() => setIsGraphOpen(true)}
          className="inline-flex min-h-[34px] items-center justify-center gap-2 self-start rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
        >
          <GitBranch className="h-4 w-4" />
          Graph
        </button>
      </div>

      <RecordHistoryGraphDialog
        history={normalizedHistory}
        open={isGraphOpen}
        onOpenChange={setIsGraphOpen}
        onReply={onReply}
        isReplying={isReplying}
      />

      {hasMore && (
        <div className="flex justify-start">
          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="text-sm font-medium text-[#E31937] hover:underline"
          >
            {isExpanded ? "Show less" : `Show more (${timelineItems.length - initialVisibleCount} older)`}
          </button>
        </div>
      )}

      {visibleItems.map((item, index) => (
        item.kind === "group" ? (
          <HistoryEntryGroupButton key={item.id} entries={item.entries} onQuote={onQuote} />
        ) : (
          <HistoryEntryButton key={`${item.entry.timestamp}-${index}`} entry={item.entry} onQuote={onQuote} />
        )
      ))}
    </div>
  );
}

function HistoryEntryButton({ entry, onQuote }: { entry: HistoryEntry; onQuote?: (entry: HistoryEntry) => void }) {
  const quotedReply = parseQuotedReply(entry.changes);

  return (
    <button
      type="button"
      onClick={() => onQuote?.(entry)}
      className={`w-full max-w-full min-w-0 text-left flex flex-col sm:flex-row gap-3 sm:gap-4 p-4 bg-gray-50 rounded-lg overflow-hidden ${
        onQuote ? "hover:bg-gray-100 transition-colors" : ""
      }`}
    >
      <div className="w-full flex-shrink-0 sm:w-40">
        <div className={`text-sm text-gray-500 ${wrappingTextClass}`}>{formatTimestampMinute(entry.timestamp)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className={`text-sm font-medium text-gray-900 ${wrappingTextClass}`}>{entry.user}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${getHistoryActionBadgeClass(entry.action)}`}>
            {entry.action}
          </span>
        </div>

        {quotedReply ? <QuotedReplyContent quotedReply={quotedReply} /> : (
          <div className={`text-sm text-gray-700 ${wrappingTextClass}`}>{formatHistoryEntryText(entry)}</div>
        )}
      </div>
    </button>
  );
}

function HistoryEntryGroupButton({
  entries,
  onQuote,
}: {
  entries: HistoryEntry[];
  onQuote?: (entry: HistoryEntry) => void;
}) {
  const firstEntry = entries[0];
  const changeCountLabel = `${entries.length} changes`;

  return (
    <button
      type="button"
      onClick={() => onQuote?.(firstEntry)}
      className={`w-full max-w-full min-w-0 text-left flex flex-col sm:flex-row gap-3 sm:gap-4 p-4 bg-gray-50 rounded-lg overflow-hidden ${
        onQuote ? "hover:bg-gray-100 transition-colors" : ""
      }`}
    >
      <div className="w-full flex-shrink-0 sm:w-40">
        <div className={`text-sm text-gray-500 ${wrappingTextClass}`}>{formatTimestampMinute(firstEntry.timestamp)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={`text-sm font-medium text-gray-900 ${wrappingTextClass}`}>{firstEntry.user}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${getHistoryActionBadgeClass(firstEntry.action)}`}>
            {firstEntry.action}
          </span>
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
            {changeCountLabel}
          </span>
        </div>

        <div className="space-y-3">
          {entries.map((entry, entryIndex) => (
            <div key={`${entry.timestamp}-${entry.field}-${entryIndex}`} className={`text-sm leading-5 text-gray-700 ${wrappingTextClass}`}>
              {formatHistoryEntryText(entry)}
            </div>
          ))}
        </div>
      </div>
    </button>
  );
}

function QuotedReplyContent({ quotedReply }: { quotedReply: NonNullable<ReturnType<typeof parseQuotedReply>> }) {
  return (
    <div className="min-w-0 max-w-full space-y-2 overflow-hidden">
      <div className="min-w-0 max-w-full rounded-md border border-gray-200 bg-gray-100 px-3 py-2 border-l-4 border-l-[#6264A7] overflow-hidden">
        <p className={`text-xs text-gray-500 font-medium ${wrappingTextClass}`}>
          Replying to {quotedReply.quotedFrom} - {quotedReply.quotedAt}
        </p>
        <p className={`text-sm text-gray-700 mt-1 ${wrappingTextClass}`}>{quotedReply.quotedBody}</p>
      </div>
      <div className={`text-sm text-gray-800 ${wrappingTextClass}`}>{quotedReply.replyBody}</div>
    </div>
  );
}
