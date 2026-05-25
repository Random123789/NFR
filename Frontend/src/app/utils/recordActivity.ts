import type {
  AccountRecord,
  CaseRecord,
  HistoryEntry,
  KnockRecord,
  MantisRecord,
  ProductRecord,
  ProjectRecord,
} from "../services/api/types";

type RecordWithActivity = AccountRecord | CaseRecord | KnockRecord | MantisRecord | ProductRecord | ProjectRecord;

function timestampToMillis(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value.replace(" ", "T"));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function latestHistoryTimestamp(history: HistoryEntry[] | undefined) {
  return (history ?? []).reduce(
    (latest, entry) => {
      const timestamp = timestampToMillis(entry.timestamp);
      return timestamp > latest.timestamp ? { value: entry.timestamp, timestamp } : latest;
    },
    { value: "", timestamp: 0 },
  ).value;
}

export function getRecordActivityTimestamp(record: RecordWithActivity | null | undefined) {
  if (!record) return "";

  if ("updatedAt" in record && record.updatedAt) {
    return record.updatedAt;
  }

  return latestHistoryTimestamp(record.history);
}
