import type { HistoryEntry } from "../data/apiClient";
import { formatTimestampMinute } from "./dateTime";

export type HistorySortDirection = "asc" | "desc";

export type ParsedQuotedReply = {
  quotedFrom: string;
  quotedAt: string;
  quotedBody: string;
  replyBody: string;
};

export type IndexedHistoryEntry = {
  entry: HistoryEntry;
  index: number;
};

export type HistoryEntryUpdateGroup = {
  key: string;
  entries: HistoryEntry[];
  indices: number[];
};

export type QuotedReplyHistoryEntries = {
  baseEntries: IndexedHistoryEntry[];
  replyEntriesByTargetKey: Map<string, IndexedHistoryEntry[]>;
};

function normalizeReplyMatchText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildReplyMatchKey(user: string, timestampLabel: string, body: string) {
  return [
    normalizeReplyMatchText(user),
    normalizeReplyMatchText(timestampLabel),
    normalizeReplyMatchText(body),
  ].join("|");
}

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

export function formatQuotedReplyChanges(entry: HistoryEntry, replyBody: string) {
  return [
    `[Quoted reply to ${entry.user} (${formatTimestampMinute(entry.timestamp)})]`,
    formatHistoryEntryText(entry),
    "",
    replyBody.trim(),
  ].join("\n");
}

export function getHistoryEntryReplyKey(entry: HistoryEntry) {
  return buildReplyMatchKey(entry.user, formatTimestampMinute(entry.timestamp), formatHistoryEntryText(entry));
}

export function getQuotedReplyTargetKey(entry: HistoryEntry) {
  const quotedReply = parseQuotedReply(entry.changes);
  if (!quotedReply) return null;
  return buildReplyMatchKey(quotedReply.quotedFrom, quotedReply.quotedAt, quotedReply.quotedBody);
}

export function isGroupableHistoryUpdateEntry(entry: HistoryEntry) {
  return (
    entry.action === "Updated" &&
    !parseQuotedReply(entry.changes) &&
    Boolean(entry.field && (entry.previousValue !== undefined || entry.newValue !== undefined))
  );
}

export function getHistoryUpdateGroupKey(entry: HistoryEntry) {
  if (entry.batchId) return `batch:${entry.batchId}`;

  return [
    formatTimestampMinute(entry.timestamp),
    entry.user || "Unknown user",
    entry.action || "Updated",
  ].join("|");
}

export function groupAdjacentHistoryUpdateEntries(entries: IndexedHistoryEntry[]): HistoryEntryUpdateGroup[] {
  const groups: HistoryEntryUpdateGroup[] = [];
  let index = 0;

  while (index < entries.length) {
    const current = entries[index];

    if (!isGroupableHistoryUpdateEntry(current.entry)) {
      groups.push({
        key: `entry:${current.index}`,
        entries: [current.entry],
        indices: [current.index],
      });
      index += 1;
      continue;
    }

    const groupKey = getHistoryUpdateGroupKey(current.entry);
    const groupEntries: HistoryEntry[] = [];
    const groupIndices: number[] = [];

    while (
      index < entries.length &&
      isGroupableHistoryUpdateEntry(entries[index].entry) &&
      getHistoryUpdateGroupKey(entries[index].entry) === groupKey
    ) {
      groupEntries.push(entries[index].entry);
      groupIndices.push(entries[index].index);
      index += 1;
    }

    groups.push({
      key: groupKey,
      entries: groupEntries,
      indices: groupIndices,
    });
  }

  return groups;
}

export function splitQuotedReplyHistoryEntries(history: HistoryEntry[]): QuotedReplyHistoryEntries {
  const parentKeys = new Set(
    history
      .filter((entry) => !getQuotedReplyTargetKey(entry))
      .map(getHistoryEntryReplyKey),
  );
  const replyEntriesByTargetKey = new Map<string, IndexedHistoryEntry[]>();
  const baseEntries: IndexedHistoryEntry[] = [];

  history.forEach((entry, index) => {
    const targetKey = getQuotedReplyTargetKey(entry);

    if (targetKey && parentKeys.has(targetKey)) {
      const replies = replyEntriesByTargetKey.get(targetKey) ?? [];
      replies.push({ entry, index });
      replyEntriesByTargetKey.set(targetKey, replies);
      return;
    }

    baseEntries.push({ entry, index });
  });

  return {
    baseEntries,
    replyEntriesByTargetKey,
  };
}

export function getReplyEntriesForHistoryEntries(
  entries: HistoryEntry[],
  replyEntriesByTargetKey: Map<string, IndexedHistoryEntry[]>,
) {
  return entries.flatMap((entry) => replyEntriesByTargetKey.get(getHistoryEntryReplyKey(entry)) ?? []);
}
