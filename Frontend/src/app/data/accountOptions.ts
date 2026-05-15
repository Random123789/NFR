export const accountTypes = ["Customer", "Distributor", "Reseller"] as const;

export const accountVerticals = ["Channel", "Commercial", "Enterprise", "Government", "FSI", "Telco"] as const;

export type AccountType = (typeof accountTypes)[number];
export type AccountVertical = (typeof accountVerticals)[number];
