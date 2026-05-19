export type ManagedRole = "admin" | "manager" | "user";

export const managedRoleOptions: Array<{ value: ManagedRole; label: string }> = [
  { value: "user", label: "SE user" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Administrator" },
];

export function formatRoleLabel(role: string | null | undefined) {
  if (!role) {
    return "Unknown";
  }

  const normalized = role.trim().toLowerCase();

  if (normalized === "admin" || normalized === "administrator") {
    return "Administrator";
  }

  if (normalized === "manager" || normalized === "sales manager" || normalized === "se manager") {
    return "Manager";
  }

  if (normalized === "user" || normalized === "se_user" || normalized === "se user") {
    return "SE user";
  }

  return role;
}
