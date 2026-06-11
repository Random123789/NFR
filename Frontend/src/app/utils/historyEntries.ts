import type { HistoryEntry } from "../data/apiClient";
import { formatTimestampMinute } from "./dateTime";

export type HistorySortDirection = "asc" | "desc";

export type ParsedQuotedReply = {
  quotedFrom: string;
  quotedAt: string;
  quotedBody: string;
  replyBody: string;
};

function formatHistoryValue(value?: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value.trim() === "" ? "-" : value;
  return String(value);
}

function isFieldChangeEntry(entry: HistoryEntry) {
  return Boolean(entry.field && (entry.previousValue !== undefined || entry.newValue !== undefined));
}

export function formatHistoryEntryText(entry: HistoryEntry) {
  if (isFieldChangeEntry(entry)) {
    return `${entry.field} changed from ${formatHistoryValue(entry.previousValue)} to ${formatHistoryValue(entry.newValue)}`;
  }

  return formatHistoryValue(entry.changes);
}

export function parseHistoryTime(entry: HistoryEntry) {
  const parsed = Date.parse(entry.timestamp);
  return Number.isNaN(parsed) ? null : parsed;
}

export function sortHistoryEntries(history: HistoryEntry[], direction: HistorySortDirection) {
  return history
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftTime = parseHistoryTime(left.entry);
      const rightTime = parseHistoryTime(right.entry);

      if (leftTime !== null && rightTime !== null) {
        return direction === "asc"
          ? leftTime - rightTime || left.index - right.index
          : rightTime - leftTime || left.index - right.index;
      }

      const timestampOrder = left.entry.timestamp.localeCompare(right.entry.timestamp);
      return direction === "asc"
        ? timestampOrder || left.index - right.index
        : -timestampOrder || left.index - right.index;
    })
    .map(({ entry }) => entry);
}

export function getHistoryActionBadgeClass(action: string | null | undefined) {
  if (action === "Comment") return "bg-green-100 text-green-800";
  if (action === "Created") return "bg-gray-200 text-gray-800";
  return "bg-blue-100 text-blue-800";
}

export function parseQuotedReply(changes?: unknown): ParsedQuotedReply | null {
  if (!changes || typeof changes !== "string") return null;

  const trimmed = changes.trim();
  const quoteHeaderMatch = trimmed.match(/^\[Quoted reply to (.+?) \((.+?)\)\]\n([\s\S]+)$/);
  if (!quoteHeaderMatch) return null;

  const rest = quoteHeaderMatch[3] ?? "";
  const separatorIndex = rest.indexOf("\n\n");
  if (separatorIndex < 0) return null;

  return {
    quotedFrom: quoteHeaderMatch[1],
    quotedAt: formatTimestampMinute(quoteHeaderMatch[2]),
    quotedBody: rest.slice(0, separatorIndex).trim(),
    replyBody: rest.slice(separatorIndex + 2).trim(),
  };
}
