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

export function getDetailRoute(entityType: DetailEntityType) {
  return detailRoutes[entityType];
}

export function createDetailTarget(entityType: DetailEntityType, recordId: string): DetailTarget {
  return {
    path: getDetailRoute(entityType),
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
