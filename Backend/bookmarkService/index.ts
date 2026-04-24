import { Router } from "express";
import { requireAuthUser } from "../shared/auth";
import { execute, query } from "../shared/database";
import { logAuditAction } from "../shared/audit";

interface BookmarkRow {
  entityType: "case" | "project" | "account" | "nfr" | "knock" | "product";
  entityId: string;
  title: string;
  subtitle: string | null;
  createdAt: string;
}

export const bookmarkRouter = Router();

bookmarkRouter.get("/", async (req, res, next) => {
  try {
    const user = await requireAuthUser(req, res);
    if (!user) {
      return;
    }

    const rows = await query<BookmarkRow>(
      `SELECT entityType, entityId, title, subtitle, createdAt
       FROM user_bookmarks
       WHERE userId = ?
       ORDER BY createdAt DESC`,
      [user.id],
    );

    res.json(
      rows.map((row) => ({
        id: row.entityId,
        type: row.entityType,
        title: row.title,
        subtitle: row.subtitle || undefined,
        timestamp: new Date(row.createdAt).getTime(),
      })),
    );
  } catch (error) {
    next(error);
  }
});

bookmarkRouter.post("/", async (req, res, next) => {
  try {
    const user = await requireAuthUser(req, res);
    if (!user) {
      return;
    }

    const entityId = typeof req.body?.id === "string" ? req.body.id.trim() : "";
    const entityType = typeof req.body?.type === "string" ? req.body.type.trim() : "";
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const subtitle = typeof req.body?.subtitle === "string" ? req.body.subtitle : null;

    if (!entityId || !entityType || !title) {
      res.status(400).json({ message: "id, type and title are required" });
      return;
    }

    await execute(
      `INSERT INTO user_bookmarks (userId, entityType, entityId, title, subtitle, createdAt)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         subtitle = VALUES(subtitle),
         createdAt = NOW()`,
      [user.id, entityType, entityId, title, subtitle],
    );

    await logAuditAction({
      userId: user.id,
      userEmail: user.email,
      action: "BOOKMARK_ADD",
      entityType,
      entityId,
      details: { title },
    });

    res.status(201).json({ success: true });
  } catch (error) {
    next(error);
  }
});

bookmarkRouter.delete("/:entityType/:entityId", async (req, res, next) => {
  try {
    const user = await requireAuthUser(req, res);
    if (!user) {
      return;
    }

    const { entityType, entityId } = req.params;

    await execute(
      `DELETE FROM user_bookmarks
       WHERE userId = ? AND entityType = ? AND entityId = ?`,
      [user.id, entityType, entityId],
    );

    await logAuditAction({
      userId: user.id,
      userEmail: user.email,
      action: "BOOKMARK_REMOVE",
      entityType,
      entityId,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
