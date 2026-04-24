import { query } from "../shared/database";
import { createEntityRouter } from "../shared/entityRouter";
import type { KnockRecord } from "../shared/types";

export const knockRouter = createEntityRouter<KnockRecord>({
  tableName: "knocks",
  recordPrefix: "KNOCK",
  moduleId: "MOD-KNOCK",
  searchFields: ["recordId", "description", "knockId", "status", "ownedBy"],
  relations: async (recordId) => {
    const knockRows = await query<KnockRecord>("SELECT * FROM `knocks` WHERE recordId = ? LIMIT 1", [recordId]);
    const knock = knockRows[0];

    return {
      cases: knock?.knockId ? await query("SELECT * FROM `cases` WHERE knockId = ? ORDER BY updatedAt DESC", [knock.knockId]) : [],
    };
  },
});

export default knockRouter;
