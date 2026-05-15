export const projectStages = [
  "Technical Qualification",
  "Tender - RFP/RFI/RFQ",
  "Technical Validation",
  "Technical Lost",
  "Technical Won",
] as const;

export type ProjectStage = (typeof projectStages)[number];
