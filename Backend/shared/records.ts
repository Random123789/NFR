import type { HistoryEntry } from "./types";
import { query } from "./database";

export function parseHistory(value: unknown): HistoryEntry[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value as HistoryEntry[];
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
    } catch {
      return [];
    }
  }

  return [];
}

export function normalizeRecord<T extends { history?: unknown }>(record: T): Omit<T, "history"> & { history: HistoryEntry[] } {
  const { history, ...rest } = record;
  return {
    ...(rest as Omit<T, "history">),
    history: parseHistory(history),
  };
}

export function normalizeRows<T extends { history?: unknown }>(records: T[]): Array<Omit<T, "history"> & { history: HistoryEntry[] }> {
  return records.map((record) => normalizeRecord(record));
}

export async function generateRecordId(tableName: string, prefix: string, digits = 3): Promise<string> {
  const rows = await query<{ recordId: string }>(
    `SELECT recordId FROM \`${tableName}\` WHERE recordId LIKE ? ORDER BY recordId DESC LIMIT 1`,
    [`${prefix}-%`],
  );

  const latest = rows[0]?.recordId;
  if (!latest) {
    return `${prefix}-${String(1).padStart(digits, "0")}`;
  }

  const numericPart = Number(latest.split("-").pop() || 0);
  return `${prefix}-${String(numericPart + 1).padStart(digits, "0")}`;
}

export function buildHistoryEntry(input: {
  user?: string;
  action?: string;
  changes: string;
  timestamp?: string;
}): HistoryEntry {
  return {
    timestamp: input.timestamp || new Date().toISOString().slice(0, 19).replace("T", " "),
    user: input.user || "Current User",
    action: input.action || "Comment",
    changes: input.changes,
  };
}
