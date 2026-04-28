import { HistoryEntry } from "../data/apiClient";
import { useMemo, useState } from "react";

interface RecordHistoryTimelineProps {
  history?: HistoryEntry[];
  emptyMessage?: string;
  initialVisibleCount?: number;
  onQuote?: (entry: HistoryEntry) => void;
}

function formatHistoryValue(value?: unknown) {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "string") {
    return value.trim() === "" ? "—" : value;
  }

  return String(value);
}

function isFieldChangeEntry(entry: HistoryEntry) {
  return Boolean(entry.field && (entry.previousValue !== undefined || entry.newValue !== undefined));
}

function parseQuotedReply(changes?: unknown) {
  if (!changes || typeof changes !== "string") return null;

  const trimmed = changes.trim();
  const quoteHeaderMatch = trimmed.match(/^\[Quoted reply to (.+?) \((.+?)\)\]\n([\s\S]+)$/);
  if (!quoteHeaderMatch) return null;

  const rest = quoteHeaderMatch[3] ?? "";
  const separator = "\n\n";
  const separatorIndex = rest.indexOf(separator);

  if (separatorIndex < 0) {
    return null;
  }

  const quotedBody = rest.slice(0, separatorIndex).trim();
  const replyBody = rest.slice(separatorIndex + separator.length).trim();

  return {
    quotedFrom: quoteHeaderMatch[1],
    quotedAt: quoteHeaderMatch[2],
    quotedBody,
    replyBody,
  };
}

export function formatHistoryEntryText(entry: HistoryEntry) {
  if (isFieldChangeEntry(entry)) {
    return `${entry.field} changed from ${formatHistoryValue(entry.previousValue)} to ${formatHistoryValue(entry.newValue)}`;
  }

  return formatHistoryValue(entry.changes);
}

export function RecordHistoryTimeline({ history, emptyMessage = "No history available", initialVisibleCount = 5, onQuote }: RecordHistoryTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const normalizedHistory = Array.isArray(history) ? history : [];

  const sortedHistory = useMemo(() => {
    return [...normalizedHistory].sort((a, b) => {
      const timeA = Date.parse(a.timestamp);
      const timeB = Date.parse(b.timestamp);

      if (Number.isNaN(timeA) || Number.isNaN(timeB)) {
        return a.timestamp.localeCompare(b.timestamp);
      }

      return timeA - timeB;
    });
  }, [normalizedHistory]);

  if (sortedHistory.length === 0) {
    return <p className="text-sm text-gray-500 italic">{emptyMessage}</p>;
  }

  const visibleCount = initialVisibleCount;
  const hasMore = sortedHistory.length > visibleCount;
  const visibleHistory = isExpanded ? sortedHistory : sortedHistory.slice(-visibleCount);

  return (
    <div className="space-y-3">
      {onQuote && (
        <p className="text-xs text-gray-500">Click a history item to quote it in your comment.</p>
      )}

      {hasMore && (
        <div className="flex justify-start">
          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="text-sm font-medium text-[#E31937] hover:underline"
          >
            {isExpanded ? "Show less" : `Show more (${sortedHistory.length - visibleCount} older)`}
          </button>
        </div>
      )}

      {visibleHistory.map((entry, index) => (
        <button
          key={`${entry.timestamp}-${index}`}
          type="button"
          onClick={() => onQuote?.(entry)}
          className={`w-full text-left flex gap-4 p-4 bg-gray-50 rounded-lg ${
            onQuote ? "hover:bg-gray-100 transition-colors" : ""
          }`}
        >
          <div className="flex-shrink-0 w-40">
            <div className="text-sm text-gray-500">{entry.timestamp}</div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-medium text-gray-900">{entry.user}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                entry.action === "Comment"
                  ? "bg-green-100 text-green-800"
                  : entry.action === "Created"
                    ? "bg-gray-200 text-gray-800"
                    : "bg-blue-100 text-blue-800"
              }`}>
                {entry.action}
              </span>
            </div>

            {(() => {
              const parsedQuotedReply = parseQuotedReply(entry.changes);

              if (!parsedQuotedReply) {
                return <div className="text-sm text-gray-700">{formatHistoryEntryText(entry)}</div>;
              }

              return (
                <div className="space-y-2">
                  <div className="rounded-md border border-gray-200 bg-gray-100 px-3 py-2 border-l-4 border-l-[#6264A7]">
                    <p className="text-xs text-gray-500 font-medium">
                      Replying to {parsedQuotedReply.quotedFrom} - {parsedQuotedReply.quotedAt}
                    </p>
                    <p className="text-sm text-gray-700 mt-1">{parsedQuotedReply.quotedBody}</p>
                  </div>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap">{parsedQuotedReply.replyBody}</div>
                </div>
              );
            })()}
          </div>
        </button>
      ))}
    </div>
  );
}