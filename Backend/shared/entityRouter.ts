import { Router } from "express";
import type { ResultSetHeader } from "mysql2/promise";
import { execute, pool, query } from "./database";
import { requireAuthUser } from "./auth";
import { logAuditAction } from "./audit";
import { buildHistoryEntry, generateRecordId, normalizeRecord, normalizeRows } from "./records";
import type { BaseRecord, HistoryEntry } from "./types";

type RecordMap = Record<string, unknown>;

interface EntitySpec<T extends BaseRecord> {
  tableName: string;
  recordPrefix: string;
  moduleId: string;
  searchFields: Array<keyof T & string>;
  defaultSort?: string;
  defaultValues?: Partial<T>;
  relations?: (recordId: string) => Promise<Record<string, unknown>>;
}

function isReservedQueryKey(key: string): boolean {
  return ["q", "sortBy", "sortDir", "limit", "offset", "page"].includes(key);
}

function serializeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  return value;
}

function sanitizePayload(payload: RecordMap): RecordMap {
  const sanitized: RecordMap = { ...payload };
  delete sanitized.recordId;
  delete sanitized.createdAt;
  delete sanitized.createdBy;
  delete sanitized.updatedAt;
  delete sanitized.updatedBy;
  delete sanitized.moduleId;
  return sanitized;
}

function normalizeQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] || "";
  }

  return value || "";
}

export function createEntityRouter<T extends BaseRecord>(spec: EntitySpec<T>): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const q = normalizeQueryValue(req.query.q as string | string[] | undefined).trim();
      const sortBy = normalizeQueryValue(req.query.sortBy as string | string[] | undefined) || spec.defaultSort || "recordId";
      const sortDir = normalizeQueryValue(req.query.sortDir as string | string[] | undefined).toLowerCase() === "desc" ? "DESC" : "ASC";
      const limit = Number(normalizeQueryValue(req.query.limit as string | string[] | undefined) || 0);
      const offset = Number(normalizeQueryValue(req.query.offset as string | string[] | undefined) || 0);

      const whereParts: string[] = [];
      const params: unknown[] = [];

      if (q) {
        const searchClause = spec.searchFields.map((field) => `LOWER(\`${field}\`) LIKE ?`).join(" OR ");
        whereParts.push(`(${searchClause})`);
        spec.searchFields.forEach(() => params.push(`%${q.toLowerCase()}%`));
      }

      for (const [key, rawValue] of Object.entries(req.query)) {
        if (isReservedQueryKey(key)) {
          continue;
        }

        const value = normalizeQueryValue(rawValue as string | string[] | undefined).trim();
        if (value) {
          whereParts.push(`\`${key}\` = ?`);
          params.push(value);
        }
      }

      const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
      const limitClause = limit > 0 ? `LIMIT ${limit} OFFSET ${offset}` : "";

      const rows = await query<T>(
        `SELECT * FROM \`${spec.tableName}\` ${whereClause} ORDER BY \`${sortBy}\` ${sortDir} ${limitClause}`.trim(),
        params,
      );

      res.json(normalizeRows(rows));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:recordId", async (req, res, next) => {
    try {
      const { recordId } = req.params;
      const rows = await query<T>(`SELECT * FROM \`${spec.tableName}\` WHERE recordId = ? LIMIT 1`, [recordId]);
      const record = rows[0];

      if (!record) {
        res.status(404).json({ message: `${spec.tableName} record not found` });
        return;
      }

      const hydrated = normalizeRecord(record);
      const relations = spec.relations ? await spec.relations(recordId) : {};
      res.json({ ...hydrated, relations });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const actor = await requireAuthUser(req, res);
      if (!actor) {
        return;
      }

      const body = req.body as RecordMap;
      const recordId = typeof body.recordId === "string" && body.recordId.trim() ? body.recordId.trim() : await generateRecordId(spec.tableName, spec.recordPrefix);
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      const history = Array.isArray(body.history) ? body.history : [];

      const insertPayload: RecordMap = {
        ...spec.defaultValues,
        ...body,
        recordId,
        moduleId: spec.moduleId,
        recordRevision: body.recordRevision || "1.0",
        createdAt: body.createdAt || now,
        createdBy: body.createdBy || actor.displayName,
        updatedAt: body.updatedAt || now,
        updatedBy: body.updatedBy || actor.displayName,
        history,
      };

      const columns = Object.keys(insertPayload);
      const values = columns.map((column) => serializeValue(insertPayload[column]));
      const placeholders = columns.map(() => "?").join(", ");

      await execute(
        `INSERT INTO \`${spec.tableName}\` (${columns.map((column) => `\`${column}\``).join(", ")}) VALUES (${placeholders})`,
        values,
      );

      const rows = await query<T>(`SELECT * FROM \`${spec.tableName}\` WHERE recordId = ? LIMIT 1`, [recordId]);
      await logAuditAction({
        userId: actor.id,
        userEmail: actor.email,
        action: "CREATE",
        entityType: spec.tableName,
        entityId: recordId,
        details: { changedFields: Object.keys(insertPayload) },
      });
      res.status(201).json(normalizeRecord(rows[0]));
    } catch (error) {
      next(error);
    }
  });

  router.put("/:recordId", async (req, res, next) => {
    try {
      const actor = await requireAuthUser(req, res);
      if (!actor) {
        return;
      }

      const { recordId } = req.params;
      const body = sanitizePayload(req.body as RecordMap);
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      body.updatedAt = now;
      if (!body.updatedBy) {
        body.updatedBy = actor.displayName;
      }

      const columns = Object.keys(body);
      if (columns.length === 0) {
        res.status(400).json({ message: "No updatable fields provided" });
        return;
      }

      const values = columns.map((column) => serializeValue(body[column]));
      const assignments = columns.map((column) => `\`${column}\` = ?`).join(", ");

      const result = await poolExecuteUpdate(spec.tableName, assignments, values, recordId);

      if (result.affectedRows === 0) {
        res.status(404).json({ message: `${spec.tableName} record not found` });
        return;
      }

      const rows = await query<T>(`SELECT * FROM \`${spec.tableName}\` WHERE recordId = ? LIMIT 1`, [recordId]);
      await logAuditAction({
        userId: actor.id,
        userEmail: actor.email,
        action: "UPDATE",
        entityType: spec.tableName,
        entityId: recordId,
        details: { changedFields: columns },
      });
      res.json(normalizeRecord(rows[0]));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:recordId", async (req, res, next) => {
    try {
      const actor = await requireAuthUser(req, res);
      if (!actor) {
        return;
      }

      const { recordId } = req.params;
      const result = await poolExecuteDelete(spec.tableName, recordId);

      if (result.affectedRows === 0) {
        res.status(404).json({ message: `${spec.tableName} record not found` });
        return;
      }

      await logAuditAction({
        userId: actor.id,
        userEmail: actor.email,
        action: "DELETE",
        entityType: spec.tableName,
        entityId: recordId,
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post("/:recordId/history", async (req, res, next) => {
    try {
      const actor = await requireAuthUser(req, res);
      if (!actor) {
        return;
      }

      const { recordId } = req.params;
      const rows = await query<T>(`SELECT * FROM \`${spec.tableName}\` WHERE recordId = ? LIMIT 1`, [recordId]);
      const existing = rows[0];

      if (!existing) {
        res.status(404).json({ message: `${spec.tableName} record not found` });
        return;
      }

      const currentHistory = normalizeRecord(existing).history;
      const entry = buildHistoryEntry({
        user: typeof req.body?.user === "string" ? req.body.user : actor.displayName,
        action: typeof req.body?.action === "string" ? req.body.action : undefined,
        changes: typeof req.body?.changes === "string" ? req.body.changes : "",
        timestamp: typeof req.body?.timestamp === "string" ? req.body.timestamp : undefined,
      });

      const nextHistory: HistoryEntry[] = [...currentHistory, entry];
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      const result = await poolExecuteUpdate(
        spec.tableName,
        "`history` = ?, `updatedAt` = ?, `updatedBy` = ?",
        [JSON.stringify(nextHistory), now, req.body?.user || actor.displayName],
        recordId,
      );

      if (result.affectedRows === 0) {
        res.status(404).json({ message: `${spec.tableName} record not found` });
        return;
      }

      const refreshed = await query<T>(`SELECT * FROM \`${spec.tableName}\` WHERE recordId = ? LIMIT 1`, [recordId]);
      await logAuditAction({
        userId: actor.id,
        userEmail: actor.email,
        action: "ADD_HISTORY",
        entityType: spec.tableName,
        entityId: recordId,
      });
      res.json(normalizeRecord(refreshed[0]));
    } catch (error) {
      next(error);
    }
  });

  if (spec.relations) {
    router.get("/:recordId/relations", async (req, res, next) => {
      try {
        const { recordId } = req.params;
        const relations = await spec.relations!(recordId);
        res.json(relations);
      } catch (error) {
        next(error);
      }
    });
  }

  return router;
}

async function poolExecuteUpdate(tableName: string, assignments: string, values: unknown[], recordId: string) {
  const params = [...values, recordId];
  return executeReturningHeader(`UPDATE \`${tableName}\` SET ${assignments} WHERE recordId = ?`, params);
}

async function poolExecuteDelete(tableName: string, recordId: string) {
  return executeReturningHeader(`DELETE FROM \`${tableName}\` WHERE recordId = ?`, [recordId]);
}

async function executeReturningHeader(sql: string, params: unknown[]): Promise<ResultSetHeader> {
  const [result] = await pool.execute<ResultSetHeader>(sql, params);
  return result;
}
