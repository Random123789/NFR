import { query } from "../shared/database";
import { createEntityRouter } from "../shared/entityRouter";
import type { ProjectRecord } from "../shared/types";

export const projectRouter = createEntityRouter<ProjectRecord>({
  tableName: "projects",
  recordPrefix: "PRJ",
  moduleId: "MOD-PROJECT",
  searchFields: ["recordId", "projectName", "accountId", "stage", "se", "ownedBy"],
  relations: async (recordId) => ({
    account: (await query("SELECT * FROM `accounts` WHERE recordId = (SELECT accountId FROM `projects` WHERE recordId = ? LIMIT 1) LIMIT 1", [recordId]))[0] || null,
    cases: await query("SELECT * FROM `cases` WHERE project = ? ORDER BY updatedAt DESC", [recordId]),
  }),
});

export default projectRouter;
