import { useEffect, useState } from "react";

export type SortDirection = "asc" | "desc" | null;

export type SortConfig<Key extends string = string> = {
  key: Key | "";
  direction: SortDirection;
};

export function getNextSortConfig<Key extends string>(
  current: SortConfig<Key>,
  key: Key,
): SortConfig<Key> {
  if (current.key !== key) {
    return { key, direction: "asc" };
  }

  if (current.direction === "asc") {
    return { key, direction: "desc" };
  }

  if (current.direction === "desc") {
    return { key: "", direction: null };
  }

  return { key, direction: "asc" };
}

export function useStoredColumnKeys<Key extends string>(
  storageKey: string,
  defaultKeys: Key[],
) {
  const [visibleKeys, setVisibleKeys] = useState<Key[]>(() => {
    if (typeof window === "undefined") {
      return defaultKeys;
    }

    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) {
        return defaultKeys;
      }

      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        return defaultKeys;
      }

      const validKeys = defaultKeys.filter((key) => parsed.includes(key));
      return validKeys.length > 0 ? validKeys : defaultKeys;
    } catch {
      return defaultKeys;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(visibleKeys));
  }, [storageKey, visibleKeys]);

  return [visibleKeys, setVisibleKeys] as const;
}

export function toggleColumnKey<Key extends string>(
  currentKeys: Key[],
  key: Key,
  defaultKeys: Key[],
) {
  if (currentKeys.includes(key)) {
    return currentKeys.length === 1
      ? currentKeys
      : currentKeys.filter((columnKey) => columnKey !== key);
  }

  return defaultKeys.filter((columnKey) => currentKeys.includes(columnKey) || columnKey === key);
}

export function compareValues(aValue: unknown, bValue: unknown, direction: Exclude<SortDirection, null>) {
  const normalizedA = typeof aValue === "number" ? aValue : String(aValue ?? "");
  const normalizedB = typeof bValue === "number" ? bValue : String(bValue ?? "");

  if (normalizedA < normalizedB) {
    return direction === "asc" ? -1 : 1;
  }

  if (normalizedA > normalizedB) {
    return direction === "asc" ? 1 : -1;
  }

  return 0;
}
