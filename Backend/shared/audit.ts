import { execute } from "./database";

interface AuditInput {
  userId: number | null;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}

export async function logAuditAction(input: AuditInput): Promise<void> {
  try {
    await execute(
      `INSERT INTO audit_logs (userId, userEmail, action, entityType, entityId, details, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        input.userId,
        input.userEmail,
        input.action,
        input.entityType,
        input.entityId,
        JSON.stringify(input.details || {}),
      ],
    );
  } catch (error) {
    // Audit writes should not block core CRUD paths.
    console.error("Failed to write audit log:", error);
  }
}
