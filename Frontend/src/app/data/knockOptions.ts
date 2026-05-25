const KNOCK_URL_PREFIX = "https://knock.fortinet-cse.com/issues/";

export function buildKnockUrl(knockId: string | null | undefined) {
  const normalizedId = knockId?.trim();
  return normalizedId ? `${KNOCK_URL_PREFIX}${encodeURIComponent(normalizedId)}` : "";
}
