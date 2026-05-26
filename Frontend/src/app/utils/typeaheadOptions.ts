export function fieldSuggestions<T extends { recordId?: string }>(
  records: T[],
  field: keyof T,
  excludeRecordId?: string,
) {
  const seen = new Map<string, string>();

  for (const record of records) {
    if (excludeRecordId && record.recordId === excludeRecordId) continue;

    const rawValue = record[field];
    const value = typeof rawValue === "number" ? String(rawValue) : typeof rawValue === "string" ? rawValue.trim() : "";
    if (!value) continue;

    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, value);
    }
  }

  return [...seen.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base", numeric: true }),
  );
}
