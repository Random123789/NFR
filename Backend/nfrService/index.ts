import { query } from "../shared/database";
import { createEntityRouter } from "../shared/entityRouter";
import type { NfrRecord } from "../shared/types";

export const nfrRouter = createEntityRouter<NfrRecord>({
  tableName: "nfrs",
  recordPrefix: "NFR",
  moduleId: "MOD-NFR",
  searchFields: ["recordId", "description", "mantisId", "nfrStatus", "ownedBy"],
  relations: async (recordId) => {
    const nfrRows = await query<NfrRecord>("SELECT * FROM `nfrs` WHERE recordId = ? LIMIT 1", [recordId]);
    const nfr = nfrRows[0];

    return {
      cases: nfr?.mantisId ? await query("SELECT * FROM `cases` WHERE mantisId = ? ORDER BY updatedAt DESC", [nfr.mantisId]) : [],
    };
  },
});

export default nfrRouter;
