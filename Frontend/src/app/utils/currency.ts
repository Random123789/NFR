const usdIntegerFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function normalizeUsdIntegerInput(value: string) {
  return value.replace(/\D/g, "");
}

export function parseUsdIntegerInput(value: string) {
  const normalized = normalizeUsdIntegerInput(value);
  return normalized ? Number.parseInt(normalized, 10) : null;
}

export function formatUsdInteger(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const numericValue = typeof value === "number"
    ? value
    : Number.parseInt(normalizeUsdIntegerInput(value), 10);

  return Number.isFinite(numericValue)
    ? usdIntegerFormatter.format(numericValue)
    : "-";
}
