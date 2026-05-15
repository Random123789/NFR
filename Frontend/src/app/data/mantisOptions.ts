export const mantisStatuses = ["New", "Concept Commit", "Scheduled", "Resolved", "Completed", "Dead"];

export const mantisCategories = ["Bugs", "Feature Request", "Vulnerabilities", "Others"];

export function buildMantisUrl(mantisId: string | null | undefined) {
  const normalizedId = mantisId?.trim();
  return normalizedId ? `https://mantis.fortinet.com/bug_view_page.php?bug_id=${encodeURIComponent(normalizedId)}` : "";
}
