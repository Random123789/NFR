import type { AccountRecord, CaseRecord, ProjectRecord } from "../data/apiClient";

function cleanLabel(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || "";
}

function truncateLabel(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

export function getRelatedCaseLabelParts(caseItem: CaseRecord, accounts: AccountRecord[], projects: ProjectRecord[]) {
  const account = cleanLabel(accounts.find((item) => item.recordId === caseItem.account)?.accountName)
    || cleanLabel(caseItem.account)
    || "No account";
  const project = cleanLabel(projects.find((item) => item.recordId === caseItem.project)?.projectName)
    || cleanLabel(caseItem.project)
    || "No project";
  const description = cleanLabel(caseItem.description) || "No description";

  return { account, project, description };
}

export function formatRelatedCaseOption(caseItem: CaseRecord, accounts: AccountRecord[], projects: ProjectRecord[]) {
  const { account, project, description } = getRelatedCaseLabelParts(caseItem, accounts, projects);

  return [account, project, truncateLabel(description, 80)].join(" | ");
}
