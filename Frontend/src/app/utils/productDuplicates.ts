import type { ProductRecord } from "../data/apiClient";

export type ProductDuplicateInput = {
  productFamily?: string | null;
  productName?: string | null;
  productVersion?: string | null;
};

export type ProductSuggestionField = "productFamily" | "productName" | "productVersion" | "productUrl";

const PRODUCT_DUPLICATE_FIELDS: Array<keyof ProductDuplicateInput> = [
  "productFamily",
  "productName",
  "productVersion",
];
const DUPLICATE_BLANK_VALUE = "__nfr_duplicate_null__";

function canonicalDuplicateValue(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned.toLowerCase() : DUPLICATE_BLANK_VALUE;
}

export function findDuplicateProduct(
  products: ProductRecord[],
  input: ProductDuplicateInput,
  excludeRecordId?: string,
) {
  return products.find((product) => {
    if (excludeRecordId && product.recordId === excludeRecordId) return false;

    return PRODUCT_DUPLICATE_FIELDS.every(
      (field) => canonicalDuplicateValue(product[field]) === canonicalDuplicateValue(input[field]),
    );
  });
}

export function productFieldSuggestions(
  products: ProductRecord[],
  field: ProductSuggestionField,
  excludeRecordId?: string,
) {
  const seen = new Map<string, string>();
  for (const product of products) {
    if (excludeRecordId && product.recordId === excludeRecordId) continue;

    const value = product[field]?.trim();
    if (!value) continue;

    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, value);
    }
  }

  return [...seen.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base", numeric: true }),
  );
}
