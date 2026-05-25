import type { AssignableUser } from "../services/api/types";

export type UserSelectOption = {
  value: string;
  label: string;
  description?: string | null;
};

function joinOptionDescription(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(" | ");
}

export function isActiveAssignableUser(user: AssignableUser) {
  return Boolean(user.isActive);
}

export function isSeUserRole(role: string | null | undefined) {
  const normalized = role?.trim().toLowerCase();
  return normalized === "user" || normalized === "se user" || normalized === "se_user";
}

export function isManagerRole(role: string | null | undefined) {
  const normalized = role?.trim().toLowerCase();
  return normalized === "manager" || normalized === "sales manager" || normalized === "se manager";
}

export function isSeOwnerRole(role: string | null | undefined) {
  return isSeUserRole(role) || isManagerRole(role);
}

export function toAssignableUserOption(assignableUser: AssignableUser): UserSelectOption {
  return {
    value: assignableUser.displayName,
    label: assignableUser.displayName,
    description: joinOptionDescription([
      assignableUser.email,
      isManagerRole(assignableUser.role) ? "Manager" : assignableUser.vertical,
    ]),
  };
}
