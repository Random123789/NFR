import { query } from "../shared/database";
import { createEntityRouter } from "../shared/entityRouter";
import type { CaseRecord } from "../shared/types";

export const caseRouter = createEntityRouter<CaseRecord>({
  tableName: "cases",
  recordPrefix: "REC",
  moduleId: "MOD-CASE",
  searchFields: [
    "recordId",
    "description",
    "status",
    "priority",
    "category",
    "caseOwner",
    "seOwner",
    "account",
    "product",
    "project",
    "mantisId",
    "knockId",
  ],
  relations: async (recordId) => {
    const records = await query<CaseRecord>("SELECT * FROM `cases` WHERE recordId = ? LIMIT 1", [recordId]);
    const current = records[0];

    if (!current) {
      return {};
    }

    return {
      account: current.account ? (await query("SELECT * FROM `accounts` WHERE recordId = ? LIMIT 1", [current.account]))[0] : null,
      product: current.product ? (await query("SELECT * FROM `products` WHERE recordId = ? LIMIT 1", [current.product]))[0] : null,
      project: current.project ? (await query("SELECT * FROM `projects` WHERE recordId = ? LIMIT 1", [current.project]))[0] : null,
      nfr: current.mantisId ? (await query("SELECT * FROM `nfrs` WHERE mantisId = ? LIMIT 1", [current.mantisId]))[0] : null,
      knock: current.knockId ? (await query("SELECT * FROM `knocks` WHERE knockId = ? LIMIT 1", [current.knockId]))[0] : null,
    };
  },
});

export default caseRouter;
