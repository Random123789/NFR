import { query } from "../shared/database";
import { createEntityRouter } from "../shared/entityRouter";
import type { ProductRecord } from "../shared/types";

export const productRouter = createEntityRouter<ProductRecord>({
  tableName: "products",
  recordPrefix: "PRD",
  moduleId: "MOD-PRODUCT",
  searchFields: ["recordId", "productName", "productFamily", "ownedBy"],
  relations: async (recordId) => ({
    cases: await query("SELECT * FROM `cases` WHERE product = ? ORDER BY updatedAt DESC", [recordId]),
  }),
});

export default productRouter;
