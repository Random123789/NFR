import type { CaseCategory, CaseEscalationType, CasePriority, CaseStatus } from "../services/api/types";

export const caseCategories: CaseCategory[] = ["Pre-Sales", "Post-Sales", "Bug", "NFR", "Others"];

export const caseEscalationTypes: CaseEscalationType[] = ["Escalation", "Monitoring", "Re-Escalation", "Drop", "Others"];

export const casePriorities: CasePriority[] = ["Very Low", "Low", "Medium", "High", "Very High"];

export const caseStatuses: CaseStatus[] = ["New", "Acknowledged", "Escalated", "Monitoring", "Closed-Resolved", "Closed-Dead"];