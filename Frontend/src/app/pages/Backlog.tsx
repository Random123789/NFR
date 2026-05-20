import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, History, Search, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { useRecords } from "../context/RecordsContext";
import type { HistoryEntry } from "../data/apiClient";
import { createDetailPath, createDetailSlug, createOpenDetailState, type DetailEntityType } from "../navigation/detailNavigation";
import { formatTimestampMinute } from "../utils/dateTime";

type BacklogRecord = {
  entityType: DetailEntityType;
  recordId: string;
  displayId: string;
  pathIdentifier: string;
  title: string;
  subtitle: string;
  history: HistoryEntry[];
};

type BacklogEntry = BacklogRecord & {
  id: string;
  action: string;
  changes: string;
  actionTimestamp: number;
  actionTimeLabel: string;
  itemKey: string;
  latestOwnTimestamp: number;
  latestUpdateOrder: number;
  hasNewUpdates: boolean;
  updateCount: number;
  latestUpdate?: HistoryEntry;
};

const ACK_STORAGE_PREFIX = "backlog.acknowledgedUpdates";
const DELETE_STORAGE_PREFIX = "backlog.deletedItems";

const entityLabels: Record<DetailEntityType, string> = {
  case: "Case",
  account: "Account",
  project: "Project",
  product: "Product",
  mantis: "Mantis",
  knock: "Knock",
};

const entityBadgeClasses: Record<DetailEntityType, string> = {
  case: "bg-red-50 text-red-700 border-red-200",
  account: "bg-emerald-50 text-emerald-700 border-emerald-200",
  project: "bg-blue-50 text-blue-700 border-blue-200",
  product: "bg-orange-50 text-orange-700 border-orange-200",
  mantis: "bg-yellow-50 text-yellow-800 border-yellow-200",
  knock: "bg-violet-50 text-violet-700 border-violet-200",
};

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || "";
}

function joinParts(parts: Array<string | null | undefined>) {
  return parts.map(cleanText).filter(Boolean).join(" | ");
}

function normalizeUser(value: string | null | undefined) {
  return cleanText(value).toLowerCase();
}

function parseTimestamp(value: string | null | undefined) {
  const text = cleanText(value).replace("T", " ");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);

  if (match) {
    const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ).getTime();
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function actionText(entry: HistoryEntry) {
  return joinParts([entry.action, entry.field]) || "Activity";
}

function readStoredMap(key: string) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed as Record<string, number> : {};
  } catch {
    return {};
  }
}

function writeStoredMap(key: string, value: Record<string, number>) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function Backlog() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { accounts, products, projects, mantisRecords, knocks, cases, getAccountById, getProjectById } = useRecords();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "updates">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | DetailEntityType>("all");
  const storageIdentity = normalizeUser(user?.email || user?.displayName) || "anonymous";
  const ackStorageKey = `${ACK_STORAGE_PREFIX}.${storageIdentity}`;
  const deleteStorageKey = `${DELETE_STORAGE_PREFIX}.${storageIdentity}`;
  const [acknowledgedUpdates, setAcknowledgedUpdates] = useState<Record<string, number>>({});
  const [deletedItems, setDeletedItems] = useState<Record<string, number>>({});

  const currentUserKeys = useMemo(
    () => [user?.displayName, user?.email].map(normalizeUser).filter(Boolean),
    [user?.displayName, user?.email],
  );

  useEffect(() => {
    setAcknowledgedUpdates(readStoredMap(ackStorageKey));
    setDeletedItems(readStoredMap(deleteStorageKey));
  }, [ackStorageKey, deleteStorageKey]);

  const records = useMemo<BacklogRecord[]>(() => {
    const productSubtitle = (product: (typeof products)[number]) =>
      joinParts([product.productFamily, product.productVersion ? `Version ${product.productVersion}` : null]);

    return [
      ...cases.map((caseRecord) => {
        const accountsLabel = (caseRecord.accountIds ?? [])
          .map((accountId) => getAccountById(accountId)?.accountName || accountId)
          .filter(Boolean)
          .join(", ");
        const projectName = getProjectById(caseRecord.project)?.projectName || caseRecord.project;
        return {
          entityType: "case" as const,
          recordId: caseRecord.recordId,
          displayId: createDetailSlug("case", caseRecord.recordId),
          pathIdentifier: caseRecord.recordId,
          title: caseRecord.description,
          subtitle: joinParts([caseRecord.status, caseRecord.priority, accountsLabel, projectName]),
          history: caseRecord.history ?? [],
        };
      }),
      ...accounts.map((account) => ({
        entityType: "account" as const,
        recordId: account.recordId,
        displayId: account.recordId,
        pathIdentifier: account.recordId,
        title: account.accountName,
        subtitle: joinParts([account.type, account.vertical]),
        history: account.history ?? [],
      })),
      ...projects.map((project) => ({
        entityType: "project" as const,
        recordId: project.recordId,
        displayId: project.recordId,
        pathIdentifier: project.recordId,
        title: project.projectName,
        subtitle: joinParts([getAccountById(project.accountId)?.accountName, project.stage, project.seOwner]),
        history: project.history ?? [],
      })),
      ...products.map((product) => ({
        entityType: "product" as const,
        recordId: product.recordId,
        displayId: product.recordId,
        pathIdentifier: product.recordId,
        title: product.productName,
        subtitle: productSubtitle(product),
        history: product.history ?? [],
      })),
      ...mantisRecords.map((mantis) => ({
        entityType: "mantis" as const,
        recordId: mantis.recordId,
        displayId: mantis.mantisId || mantis.recordId,
        pathIdentifier: mantis.mantisId || mantis.recordId,
        title: mantis.description,
        subtitle: joinParts([mantis.mantisStatus, mantis.category, mantis.mantisTargetDate]),
        history: mantis.history ?? [],
      })),
      ...knocks.map((knock) => ({
        entityType: "knock" as const,
        recordId: knock.recordId,
        displayId: knock.knockId || knock.recordId,
        pathIdentifier: knock.knockId || knock.recordId,
        title: knock.description,
        subtitle: joinParts([knock.status, knock.targetDate]),
        history: knock.history ?? [],
      })),
    ];
  }, [accounts, cases, getAccountById, getProjectById, knocks, mantisRecords, products, projects]);

  const entries = useMemo<BacklogEntry[]>(() => {
    if (currentUserKeys.length === 0) return [];

    const isCurrentUserEntry = (entry: HistoryEntry) => currentUserKeys.includes(normalizeUser(entry.user));

    return records.flatMap((record) => {
      const historyWithIndex = record.history.map((entry, index) => ({
        entry,
        index,
        timestamp: parseTimestamp(entry.timestamp) + index,
      }));
      const ownHistory = historyWithIndex.filter(({ entry }) => isCurrentUserEntry(entry));

      if (ownHistory.length === 0) return [];

      const latestOwnTimestamp = Math.max(...ownHistory.map(({ timestamp }) => timestamp));
      const itemKey = `${record.entityType}:${record.recordId}`;
      const deletedThrough = deletedItems[itemKey] ?? 0;

      if (latestOwnTimestamp <= deletedThrough) return [];

      const laterUpdates = historyWithIndex
        .filter(({ entry, timestamp }) => timestamp > latestOwnTimestamp && !isCurrentUserEntry(entry))
        .sort((left, right) => right.timestamp - left.timestamp);
      const acknowledgedThrough = acknowledgedUpdates[itemKey] ?? 0;
      const unacknowledgedUpdates = laterUpdates.filter(({ timestamp }) => timestamp > acknowledgedThrough);
      const latestUpdateItem = unacknowledgedUpdates[0];
      const latestUpdate = latestUpdateItem?.entry;

      return ownHistory.map(({ entry, index, timestamp }) => ({
        ...record,
        id: `${record.entityType}-${record.recordId}-${index}-${entry.timestamp}`,
        action: actionText(entry),
        changes: entry.changes || "No details",
        actionTimestamp: timestamp,
        actionTimeLabel: formatTimestampMinute(entry.timestamp),
        itemKey,
        latestOwnTimestamp,
        latestUpdateOrder: latestUpdateItem?.timestamp ?? 0,
        hasNewUpdates: unacknowledgedUpdates.length > 0,
        updateCount: unacknowledgedUpdates.length,
        latestUpdate,
      }));
    }).sort((left, right) => right.actionTimestamp - left.actionTimestamp);
  }, [acknowledgedUpdates, currentUserKeys, deletedItems, records]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return entries.filter((entry) => {
      if (statusFilter === "updates" && !entry.hasNewUpdates) return false;
      if (typeFilter !== "all" && entry.entityType !== typeFilter) return false;

      if (!normalizedQuery) return true;

      return [
        entry.displayId,
        entry.title,
        entry.subtitle,
        entry.action,
        entry.changes,
        entityLabels[entry.entityType],
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [entries, query, statusFilter, typeFilter]);

  const touchedItemCount = useMemo(
    () => new Set(entries.map((entry) => `${entry.entityType}:${entry.recordId}`)).size,
    [entries],
  );
  const itemsWithUpdatesCount = useMemo(
    () => new Set(entries.filter((entry) => entry.hasNewUpdates).map((entry) => `${entry.entityType}:${entry.recordId}`)).size,
    [entries],
  );

  const openEntry = (entry: BacklogEntry) => {
    navigate(createDetailPath(entry.entityType, entry.pathIdentifier), {
      state: createOpenDetailState(entry.entityType, entry.recordId),
    });
  };

  const acknowledgeEntry = (entry: BacklogEntry) => {
    if (!entry.latestUpdateOrder) return;

    setAcknowledgedUpdates((current) => {
      const next = { ...current, [entry.itemKey]: entry.latestUpdateOrder };
      writeStoredMap(ackStorageKey, next);
      return next;
    });
  };

  const deleteEntry = (entry: BacklogEntry) => {
    setDeletedItems((current) => {
      const next = { ...current, [entry.itemKey]: entry.latestOwnTimestamp };
      writeStoredMap(deleteStorageKey, next);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Backlog</h1>
          <p className="mt-1 text-gray-600">Your activity across visible records, with items updated after your latest action highlighted.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:min-w-[28rem]">
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs font-medium uppercase text-gray-500">Actions</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{entries.length}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs font-medium uppercase text-gray-500">Items</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{touchedItemCount}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-medium uppercase text-amber-700">Updated</p>
            <p className="mt-1 text-xl font-semibold text-amber-900">{itemsWithUpdatesCount}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search backlog"
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937]"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as "all" | DetailEntityType)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937]"
            >
              <option value="all">All record types</option>
              {Object.entries(entityLabels).map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 rounded-lg border border-gray-300 bg-white p-1 text-sm">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                statusFilter === "all" ? "bg-[#E31937] text-white" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              All Actions
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("updates")}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                statusFilter === "updates" ? "bg-[#E31937] text-white" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              New Updates
            </button>
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {filteredEntries.length === 0 ? (
            <div className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center">
              <History className="mb-3 h-10 w-10 text-gray-400" />
              <p className="font-medium text-gray-900">{statusFilter === "updates" ? "No updated backlog items" : "No backlog actions yet"}</p>
              <p className="mt-1 max-w-md text-sm text-gray-500">
                {statusFilter === "updates"
                  ? "Items you touched will appear here when someone else updates them later."
                  : "Create, update, or comment on a visible record to build your backlog."}
              </p>
            </div>
          ) : (
            filteredEntries.map((entry) => (
              <div
                key={entry.id}
                role="button"
                tabIndex={0}
                onClick={() => openEntry(entry)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openEntry(entry);
                  }
                }}
                className={`block w-full text-left transition-colors ${
                  entry.hasNewUpdates ? "bg-amber-50 hover:bg-amber-100" : "bg-white hover:bg-gray-50"
                }`}
              >
                <div className={`flex gap-4 px-4 py-4 ${entry.hasNewUpdates ? "border-l-4 border-amber-400" : "border-l-4 border-transparent"}`}>
                  <div className="mt-1 hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white sm:flex">
                    {entry.hasNewUpdates ? (
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${entityBadgeClasses[entry.entityType]}`}>
                        {entityLabels[entry.entityType]}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">{entry.displayId}</span>
                      {entry.hasNewUpdates && (
                        <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          {entry.updateCount} new update{entry.updateCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-1 text-sm font-medium text-gray-900">{entry.title}</p>
                    {entry.subtitle && <p className="mt-1 line-clamp-1 text-xs text-gray-500">{entry.subtitle}</p>}
                    <div className="mt-3 rounded-lg border border-gray-200 bg-white/80 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1 font-medium text-gray-700">
                          <History className="h-3.5 w-3.5" />
                          {entry.action}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {entry.actionTimeLabel}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-gray-700">{entry.changes}</p>
                      {entry.hasNewUpdates && entry.latestUpdate && (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                          <p className="text-xs font-semibold text-amber-900">
                            Latest update by {entry.latestUpdate.user || "Unknown"} at {formatTimestampMinute(entry.latestUpdate.timestamp)}
                          </p>
                          <p className="mt-1 text-sm text-amber-900">{entry.latestUpdate.changes || "Updated without details"}</p>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {entry.hasNewUpdates && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            acknowledgeEntry(entry);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Acknowledge
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteEntry(entry);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
