import type { HistoryEntry } from "../data/apiClient";
import { GitBranch } from "lucide-react";
import { useMemo, useState } from "react";
import { RecordHistoryGraphDialog } from "./RecordHistoryGraphDialog";
import { formatTimestampMinute } from "../utils/dateTime";
import {
  formatHistoryEntryText,
  getHistoryEntryReplyKey,
  getHistoryActionBadgeClass,
  getQuotedReplyTargetKey,
  parseQuotedReply,
  sortHistoryEntries,
} from "../utils/historyEntries";

export { formatHistoryEntryText } from "../utils/historyEntries";

interface RecordHistoryTimelineProps {
  history?: HistoryEntry[];
  emptyMessage?: string;
  initialVisibleCount?: number;
  onQuote?: (entry: HistoryEntry) => void;
}

type HistoryTimelineItem =
  | { kind: "entry"; entry: HistoryEntry }
  | { kind: "group"; id: string; entries: HistoryEntry[] };

const wrappingTextClass = "min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]";

function isGroupableUpdateEntry(entry: HistoryEntry) {
  return (
    entry.action === "Updated" &&
    !parseQuotedReply(entry.changes) &&
    Boolean(entry.field && (entry.previousValue !== undefined || entry.newValue !== undefined))
  );
}

function getUpdateGroupKey(entry: HistoryEntry) {
  if (entry.batchId) return `batch:${entry.batchId}`;

  return [
    formatTimestampMinute(entry.timestamp),
    entry.user || "Unknown user",
    entry.action || "Updated",
  ].join("|");
}

function groupTimelineEntries(entries: HistoryEntry[]): HistoryTimelineItem[] {
  const items: HistoryTimelineItem[] = [];
  let index = 0;

  while (index < entries.length) {
    const entry = entries[index];

    if (!isGroupableUpdateEntry(entry)) {
      items.push({ kind: "entry", entry });
      index += 1;
      continue;
    }

    const groupKey = getUpdateGroupKey(entry);
    const groupEntries: HistoryEntry[] = [];

    while (
      index < entries.length &&
      isGroupableUpdateEntry(entries[index]) &&
      getUpdateGroupKey(entries[index]) === groupKey
    ) {
      groupEntries.push(entries[index]);
      index += 1;
    }

    if (groupEntries.length === 1) {
      items.push({ kind: "entry", entry: groupEntries[0] });
      continue;
    }

    items.push({
      kind: "group",
      id: `${groupKey}|${items.length}`,
      entries: groupEntries,
    });
  }

  return placeQuotedRepliesAfterTargets(items);
}

function getTimelineItemTargetKeys(item: HistoryTimelineItem) {
  if (item.kind === "group") return item.entries.map(getHistoryEntryReplyKey);
  return [getHistoryEntryReplyKey(item.entry)];
}

function getTimelineItemQuotedTargetKey(item: HistoryTimelineItem) {
  return item.kind === "entry" ? getQuotedReplyTargetKey(item.entry) : null;
}

function placeQuotedRepliesAfterTargets(items: HistoryTimelineItem[]) {
  const repliesByTargetKey = new Map<string, HistoryTimelineItem[]>();
  const replyItems = new Set<HistoryTimelineItem>();

  for (const item of items) {
    const targetKey = getTimelineItemQuotedTargetKey(item);
    if (!targetKey) continue;

    const replies = repliesByTargetKey.get(targetKey) ?? [];
    replies.push(item);
    repliesByTargetKey.set(targetKey, replies);
    replyItems.add(item);
  }

  const placedReplies = new Set<HistoryTimelineItem>();
  const orderedItems: HistoryTimelineItem[] = [];

  for (const item of items) {
    if (replyItems.has(item)) continue;

    orderedItems.push(item);

    for (const targetKey of getTimelineItemTargetKeys(item)) {
      for (const reply of repliesByTargetKey.get(targetKey) ?? []) {
        if (placedReplies.has(reply)) continue;
        orderedItems.push(reply);
        placedReplies.add(reply);
      }
    }
  }

  for (const item of items) {
    if (!replyItems.has(item) || placedReplies.has(item)) continue;
    orderedItems.push(item);
  }

  return orderedItems;
}

export function RecordHistoryTimeline({
  history,
  emptyMessage = "No history available",
  initialVisibleCount = 5,
  onQuote,
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
          <p className="text-xs text-gray-500">Click a history item to quote it in your comment.</p>
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

      <RecordHistoryGraphDialog history={normalizedHistory} open={isGraphOpen} onOpenChange={setIsGraphOpen} />

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
