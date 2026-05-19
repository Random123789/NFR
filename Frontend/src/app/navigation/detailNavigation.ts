export type DetailEntityType = "case" | "project" | "account" | "mantis" | "knock" | "product";

export type DetailTarget = {
  path: string;
  entityType: DetailEntityType;
  recordId: string;
};

export type DetailRouteState = {
  openDetail?: {
    entityType: DetailEntityType;
    recordId: string;
  };
  returnTo?: DetailTarget;
  previousState?: DetailRouteState | null;
};

const detailRoutes: Record<DetailEntityType, string> = {
  case: "/cases",
  project: "/projects",
  account: "/accounts",
  mantis: "/mantis",
  knock: "/knock",
  product: "/product",
};

const detailSlugPrefixes: Record<DetailEntityType, { storedPrefix: string; publicPrefix: string }> = {
  case: { storedPrefix: "REC", publicPrefix: "CASE" },
  project: { storedPrefix: "PRJ", publicPrefix: "PRJ" },
  account: { storedPrefix: "ACC", publicPrefix: "ACC" },
  mantis: { storedPrefix: "MANTIS", publicPrefix: "MANT" },
  knock: { storedPrefix: "KNOCK", publicPrefix: "KNK" },
  product: { storedPrefix: "PRD", publicPrefix: "PRD" },
};

function normalizeDetailIdentifier(value: string) {
  return decodeURIComponent(value).trim();
}

function normalizeDetailIdentifierForComparison(value: string) {
  return normalizeDetailIdentifier(value).toLowerCase();
}

export function getDetailRoute(entityType: DetailEntityType) {
  return detailRoutes[entityType];
}

export function createDetailSlug(entityType: DetailEntityType, identifier: string) {
  const normalizedIdentifier = normalizeDetailIdentifier(identifier);
  const { storedPrefix, publicPrefix } = detailSlugPrefixes[entityType];
  const storedPrefixPattern = new RegExp(`^${storedPrefix}-`, "i");

  if (storedPrefixPattern.test(normalizedIdentifier)) {
    return normalizedIdentifier.replace(storedPrefixPattern, `${publicPrefix}-`).toUpperCase();
  }

  return normalizedIdentifier.toUpperCase();
}

export function createDetailPath(entityType: DetailEntityType, identifier: string) {
  return `${getDetailRoute(entityType)}/${encodeURIComponent(createDetailSlug(entityType, identifier))}`;
}

export function detailIdentifierMatches(entityType: DetailEntityType, routeParam: string, identifier: string | null | undefined) {
  if (!identifier) return false;

  return (
    normalizeDetailIdentifierForComparison(createDetailSlug(entityType, routeParam)) ===
    normalizeDetailIdentifierForComparison(createDetailSlug(entityType, identifier))
  );
}

export function resolveDetailRouteRecordId<T extends { recordId: string }>(
  entityType: DetailEntityType,
  routeParam: string,
  records: T[],
  getAdditionalIdentifiers: (record: T) => Array<string | null | undefined> = () => [],
) {
  const matchingRecord = records.find((record) =>
    [record.recordId, ...getAdditionalIdentifiers(record)].some((identifier) =>
      detailIdentifierMatches(entityType, routeParam, identifier),
    ),
  );

  return matchingRecord?.recordId ?? createDetailSlug(entityType, routeParam).replace(
    `${detailSlugPrefixes[entityType].publicPrefix}-`,
    `${detailSlugPrefixes[entityType].storedPrefix}-`,
  ).toUpperCase();
}

export function createDetailTarget(entityType: DetailEntityType, recordId: string): DetailTarget {
  return {
    path: createDetailPath(entityType, recordId),
    entityType,
    recordId,
  };
}

export function createOpenDetailState(entityType: DetailEntityType, recordId: string): DetailRouteState {
  return {
    openDetail: { entityType, recordId },
  };
}

export function createLinkedDetailState(
  entityType: DetailEntityType,
  recordId: string,
  returnTo: DetailTarget,
  previousState: DetailRouteState | null,
): DetailRouteState {
  return {
    openDetail: { entityType, recordId },
    returnTo,
    previousState,
  };
}

export function createReturnDetailState(returnTo: DetailTarget, previousState: DetailRouteState | null): DetailRouteState {
  return {
    openDetail: {
      entityType: returnTo.entityType,
      recordId: returnTo.recordId,
    },
    previousState,
  };
}

export function getOpenDetailRecordId(state: unknown, entityType: DetailEntityType) {
  const routeState = state as DetailRouteState | null;
  return routeState?.openDetail?.entityType === entityType ? routeState.openDetail.recordId : null;
}
