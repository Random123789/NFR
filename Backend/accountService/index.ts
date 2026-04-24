import { query } from "../shared/database";
import { createEntityRouter } from "../shared/entityRouter";
import type { AccountRecord } from "../shared/types";

export const accountRouter = createEntityRouter<AccountRecord>({
  tableName: "accounts",
  recordPrefix: "ACC",
  moduleId: "MOD-ACCOUNT",
  searchFields: ["recordId", "accountName", "type", "vertical", "ownedBy"],
  relations: async (recordId) => ({
    cases: await query("SELECT * FROM `cases` WHERE account = ? ORDER BY updatedAt DESC", [recordId]),
    projects: await query("SELECT * FROM `projects` WHERE accountId = ? ORDER BY updatedAt DESC", [recordId]),
  }),
});

export default accountRouter;
