import { Router } from "express";
import { query } from "../shared/database";
import type { ReportSummary, ReportValue } from "../shared/types";

export const reportsRouter = Router();

reportsRouter.get("/summary", async (_req, res, next) => {
  try {
    const summary = await buildSummary(getRangeClause(_req.query.range as string | undefined));
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

reportsRouter.get("/cases-by-status", async (_req, res, next) => {
  try {
    res.json(await groupedCases("status", getRangeClause(_req.query.range as string | undefined)));
  } catch (error) {
    next(error);
  }
});

reportsRouter.get("/cases-by-priority", async (_req, res, next) => {
  try {
    res.json(await groupedCases("priority", getRangeClause(_req.query.range as string | undefined)));
  } catch (error) {
    next(error);
  }
});

reportsRouter.get("/cases-by-product", async (_req, res, next) => {
  try {
    const rangeClause = getRangeClause(_req.query.range as string | undefined, "c.createdAt");
    const rows = await query<{ product: string; productName: string | null; cases: number }>(
      `SELECT c.product AS product, p.productName AS productName, COUNT(*) AS cases
       FROM cases c
       LEFT JOIN products p ON p.recordId = c.product
       ${rangeClause.sql}
       GROUP BY c.product, p.productName
       HAVING COUNT(*) > 0
       ORDER BY cases DESC, productName ASC`,
      rangeClause.params,
    );

    res.json(rows.map((row) => ({ label: row.productName || row.product, value: Number(row.cases) })));
  } catch (error) {
    next(error);
  }
});

reportsRouter.get("/cases-over-time", async (_req, res, next) => {
  try {
    const rangeClause = getRangeClause(_req.query.range as string | undefined);
    const rows = await query<{ monthLabel: string; created: number; closed: number }>(
      `SELECT DATE_FORMAT(STR_TO_DATE(createdAt, '%Y-%m-%d'), '%b') AS monthLabel,
              COUNT(*) AS created,
              SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) AS closed
       FROM cases
       ${rangeClause.sql}
       GROUP BY DATE_FORMAT(STR_TO_DATE(createdAt, '%Y-%m'), '%Y-%m')
       ORDER BY MIN(STR_TO_DATE(createdAt, '%Y-%m-%d'))`,
      rangeClause.params,
    );

    res.json(rows);
  } catch (error) {
    next(error);
  }
});

async function buildSummary(rangeClause = { sql: "", params: [] as unknown[] }): Promise<ReportSummary> {
  const rows = await query<{
    totalCases: number;
    openCases: number;
    escalatedCases: number;
    closedCases: number;
  }>(
    `SELECT
      COUNT(*) AS totalCases,
      SUM(CASE WHEN status IN ('Open', 'In Progress') THEN 1 ELSE 0 END) AS openCases,
      SUM(CASE WHEN status = 'Escalated' THEN 1 ELSE 0 END) AS escalatedCases,
      SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) AS closedCases
     FROM cases
     ${rangeClause.sql}`,
    rangeClause.params,
  );

  return rows[0] || { totalCases: 0, openCases: 0, escalatedCases: 0, closedCases: 0 };
}

async function groupedCases(field: "status" | "priority", rangeClause = { sql: "", params: [] as unknown[] }): Promise<ReportValue[]> {
  const rows = await query<{ label: string; value: number }>(
    `SELECT COALESCE(\`${field}\`, 'Unspecified') AS label, COUNT(*) AS value
     FROM cases
     ${rangeClause.sql}
     GROUP BY \`${field}\`
     HAVING COUNT(*) > 0
     ORDER BY value DESC, label ASC`,
    rangeClause.params,
  );

  return rows.map((row) => ({ label: row.label, value: Number(row.value) }));
}

function getRangeClause(range?: string, column = "createdAt") {
  if (!range || range === "all") {
    return { sql: "", params: [] as unknown[] };
  }

  const columnExpr = `STR_TO_DATE(${column}, '%Y-%m-%d')`;

  switch (range) {
    case "last-7-days":
      return { sql: `WHERE ${columnExpr} >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`, params: [] as unknown[] };
    case "last-30-days":
      return { sql: `WHERE ${columnExpr} >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`, params: [] as unknown[] };
    case "last-90-days":
      return { sql: `WHERE ${columnExpr} >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)`, params: [] as unknown[] };
    case "year-to-date":
      return { sql: `WHERE YEAR(${columnExpr}) = YEAR(CURDATE())`, params: [] as unknown[] };
    default:
      return { sql: "", params: [] as unknown[] };
  }
}

export default reportsRouter;
