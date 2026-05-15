export function formatTimestampMinute(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "string") {
    const text = value.trim();
    const normalized = text.replace("T", " ");
    const dateTimeMatch = normalized.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/);

    if (dateTimeMatch) {
      return `${dateTimeMatch[1]} ${dateTimeMatch[2]}`;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return text;
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function normalizeApiTimestamps<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}):\d{2}(?:\.\d+)?$/, "$1 $2") as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeApiTimestamps(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, itemValue]) => [key, normalizeApiTimestamps(itemValue)]),
    ) as T;
  }

  return value;
}
