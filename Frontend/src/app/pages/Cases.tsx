import { useEffect, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Bookmark, ChevronDown, Download, Edit2, Save, UserRound, Check } from "lucide-react";
import {
  addCaseLink,
  addCaseHistory,
  getCase,
  getCaseLinks,
  listAssignableUsers,
  removeCaseLink,
  updateCase,
  type AssignableUser,
  type CaseLinkEntityType,
  type CaseLinksResponse,
  type CaseRecord,
} from "../data/apiClient";
import { CreateEntityDialog } from "../components/CreateEntityDialog";
import { DetailTabs } from "../components/DetailTabs";
import { LinkedEntityList } from "../components/LinkedEntityCard";
import { RecordHistoryTimeline, formatHistoryEntryText } from "../components/RecordHistoryTimeline";
import { TableFieldSelector } from "../components/TableFieldSelector";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Checkbox } from "../components/ui/checkbox";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { useBookmarks } from "../context/BookmarksContext";
import { useRecords } from "../context/RecordsContext";
import { useSearch } from "../context/SearchContext";
import { useToast } from "../context/ToastContext";
import { caseCategories, caseEscalationTypes, casePriorities, caseStatuses } from "../data/caseOptions";
import { casePriorityColors, caseStatusColors } from "../data/recordStyles";
import { useRoutedEntityDetail } from "../hooks/useEntityDetail";
import { useRecordComments } from "../hooks/useRecordComments";
import { compareValues, getNextSortConfig, toggleColumnKey, useStoredColumnKeys, type SortConfig } from "../hooks/useTableColumns";
import {
  createDetailTarget,
  createLinkedDetailState,
  type DetailEntityType,
  type DetailRouteState,
} from "../navigation/detailNavigation";
import { exportRowsToCsv } from "../utils/csvExport";
import { formatTimestampMinute } from "../utils/dateTime";

type LinkDrafts = {
  account: string;
  product: string;
  project: string;
  mantis: string[];
  knock: string[];
};

type LinkKey = keyof LinkDrafts;

type CaseColumnKey =
  | "account"
  | "project"
  | "category"
  | "escalationType"
  | "escalationNote"
  | "product"
  | "closeDate"
  | "description"
  | "seOwner"
  | "assignedTo"
  | "priority"
  | "status"
  | "knockId"
  | "mantisId";

type CaseSearchKey = CaseColumnKey;

type CaseTableColumn = {
  key: CaseColumnKey;
  label: string;
  sortKey: CaseColumnKey;
  searchKey?: CaseSearchKey;
};

const CASE_TABLE_COLUMNS: CaseTableColumn[] = [
  { key: "description", label: "Description", sortKey: "description", searchKey: "description" },
  { key: "account", label: "Account", sortKey: "account", searchKey: "account" },
  { key: "project", label: "Project", sortKey: "project", searchKey: "project" },
  { key: "category", label: "Category", sortKey: "category", searchKey: "category" },
  { key: "escalationType", label: "Escalation Type", sortKey: "escalationType", searchKey: "escalationType" },
  { key: "product", label: "Product", sortKey: "product", searchKey: "product" },
  { key: "closeDate", label: "Close Date", sortKey: "closeDate", searchKey: "closeDate" },
  { key: "seOwner", label: "SE Owner", sortKey: "seOwner", searchKey: "seOwner" },
  { key: "assignedTo", label: "Assigned To", sortKey: "assignedTo", searchKey: "assignedTo" },
  { key: "priority", label: "Priority", sortKey: "priority" },
  { key: "status", label: "Status", sortKey: "status" },
  { key: "knockId", label: "Knock ID", sortKey: "knockId", searchKey: "knockId" },
  { key: "mantisId", label: "Mantis ID", sortKey: "mantisId", searchKey: "mantisId" },
  { key: "escalationNote", label: "Escalation Note", sortKey: "escalationNote", searchKey: "escalationNote" },
];

const DEFAULT_CASE_COLUMN_KEYS = CASE_TABLE_COLUMNS.map((column) => column.key);
const CASE_COLUMN_STORAGE_KEY = "cases.visibleTableColumns.v3";
const RELATED_CREATE_BUTTON_CLASS = "inline-flex h-[42px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50";
const CASE_DETAIL_TABS = [
  { key: "details", label: "Details" },
  { key: "linkedAccounts", label: "Linked Accounts" },
  { key: "linkedProjects", label: "Linked Projects" },
  { key: "linkedProducts", label: "Linked Products" },
  { key: "linkedMantisRecords", label: "Linked Mantis Records" },
  { key: "linkedKnocks", label: "Linked Knocks" },
];

function assigneeLabel(user: AssignableUser) {
  return `${user.displayName} (${user.email})${user.vertical ? ` - ${user.vertical}` : ""}${user.isActive ? "" : " - inactive"}`;
}

function AssignedToBadge({ value }: { value: string | null | undefined }) {
  const hasAssignee = Boolean(value);

  return (
    <span
      className={`inline-flex max-w-[12rem] items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
        hasAssignee ? "bg-red-50 text-[#B5122B] ring-red-200" : "bg-gray-100 text-gray-500 ring-gray-200"
      }`}
      title={value || "Unassigned"}
    >
      <UserRound className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{value || "Unassigned"}</span>
    </span>
  );
}

function textValue(value: string | null | undefined) {
  return value || "-";
}

function emptyLinkDrafts(): LinkDrafts {
  return {
    account: "",
    product: "",
    project: "",
    mantis: [],
    knock: [],
  };
}

function uniqueNonEmptyValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function MultiSelectDropdown<T extends { recordId: string }>({
  label,
  values,
  options,
  getOptionLabel,
  onChange,
}: {
  label: string;
  values: string[];
  options: T[];
  getOptionLabel: (option: T) => string;
  onChange: (nextValues: string[]) => void;
}) {
  const selectedLabels = options
    .filter((option) => values.includes(option.recordId))
    .map(getOptionLabel)
    .filter(Boolean);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex min-h-[42px] w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
        >
          <span className="truncate">
            {selectedLabels.length > 0 ? selectedLabels.join(", ") : `Select ${label}`}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
        <div className="max-h-72 space-y-1 overflow-auto">
          {options.length === 0 ? (
            <div className="px-2 py-2 text-sm text-gray-500">No records available</div>
          ) : options.map((option) => {
            const checked = values.includes(option.recordId);
            return (
              <button
                key={option.recordId}
                type="button"
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-gray-50"
                onClick={() => {
                  const nextValues = checked
                    ? values.filter((value) => value !== option.recordId)
                    : [...values, option.recordId];
                  onChange(nextValues);
                }}
              >
                <Checkbox checked={checked} className="pointer-events-none" />
                <span className="min-w-0 flex-1 truncate text-gray-900">{getOptionLabel(option)}</span>
                {checked ? <Check className="h-4 w-4 text-[#E31937]" /> : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function Cases() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { searchTerm } = useSearch();
  const { addBookmark, removeBookmark, isBookmarked } = useBookmarks();
  const {
    cases,
    accounts,
    products,
    projects,
    mantisRecords,
    knocks,
    getAccountById,
    getProductById,
    getProjectById,
    getMantisByMantisId,
    getKnockByKnockId,
    getCaseById,
    upsertCase,
  } = useRecords();
  const {
    selectedRecord: selectedCase,
    setSelectedRecord: setSelectedCase,
    selectRecord,
    isEditing,
    editedRecord: editedCase,
    setEditedRecord: setEditedCase,
    activeDetailTab,
    setActiveDetailTab,
    handleBackFromDetail,
    handleEdit,
    handleCancelEdit,
    applySavedRecord,
  } = useRoutedEntityDetail({
    entityType: "case",
    getRecordById: getCaseById,
  });
  const { newComment, setNewComment, selectedQuote, setSelectedQuote, isAddingComment, handleAddComment } = useRecordComments({
    selectedRecord: selectedCase,
    setSelectedRecord: setSelectedCase,
    addHistory: addCaseHistory,
    upsertRecord: upsertCase,
    userName: user?.displayName,
    onError: (message) => showToast(message, "error"),
  });

  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const locationState = location.state as any;
  const [statusFilter, setStatusFilter] = useState<string>(locationState?.statusFilter || "All");
  const [priorityFilter, setPriorityFilter] = useState<string>(locationState?.priorityFilter || "All");
  const [daysToCloseFilter, setDaysToCloseFilter] = useState<number | null>(locationState?.daysToCloseFilter ?? null);
  const [isUpdatingLinks, setIsUpdatingLinks] = useState(false);
  const [visibleCaseColumnKeys, setVisibleCaseColumnKeys] = useStoredColumnKeys<CaseColumnKey>(CASE_COLUMN_STORAGE_KEY, DEFAULT_CASE_COLUMN_KEYS);
  const [caseLinks, setCaseLinks] = useState<CaseLinksResponse | null>(null);
  const [editedMantisIds, setEditedMantisIds] = useState<string[]>([]);
  const [editedKnockIds, setEditedKnockIds] = useState<string[]>([]);
  const [linkDrafts, setLinkDrafts] = useState<LinkDrafts>(() => emptyLinkDrafts());
  const [searchFilters, setSearchFilters] = useState<Record<CaseSearchKey, string>>({
    account: "",
    project: "",
    category: "",
    escalationType: "",
    escalationNote: "",
    product: "",
    closeDate: "",
    description: "",
    seOwner: "",
    assignedTo: "",
    priority: "",
    status: "",
    knockId: "",
    mantisId: "",
  });
  const [sortConfig, setSortConfig] = useState<SortConfig<CaseColumnKey>>({
    key: "",
    direction: null,
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const users = await listAssignableUsers();
        if (!cancelled) {
          setAssignableUsers(users);
        }
      } catch (error) {
        console.error("Failed to load assignable users:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCase) {
      setCaseLinks(null);
      setEditedMantisIds([]);
      setEditedKnockIds([]);
      setLinkDrafts(emptyLinkDrafts());
      return;
    }

    setLinkDrafts(emptyLinkDrafts());

    let cancelled = false;
    void (async () => {
      try {
        const links = await getCaseLinks(selectedCase.recordId);
        if (!cancelled) {
          setCaseLinks(links);
        }
      } catch (error) {
        console.error("Failed to load case links:", error);
        if (!cancelled) {
          setCaseLinks(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCase?.recordId]);

  useEffect(() => {
    if (!selectedCase || !isEditing) return;

    const linkedMantisIds = uniqueNonEmptyValues(caseLinks?.mantis.map((item) => item.recordId) ?? []);
    const linkedKnockIds = uniqueNonEmptyValues(caseLinks?.knocks.map((item) => item.recordId) ?? []);
    const fallbackMantisId = selectedCase.mantisId ? mantisRecords.find((item) => item.mantisId === selectedCase.mantisId)?.recordId ?? selectedCase.mantisId : "";
    const fallbackKnockId = selectedCase.knockId ? knocks.find((item) => item.knockId === selectedCase.knockId)?.recordId ?? selectedCase.knockId : "";

    setEditedMantisIds(linkedMantisIds.length > 0 ? linkedMantisIds : fallbackMantisId ? [fallbackMantisId] : []);
    setEditedKnockIds(linkedKnockIds.length > 0 ? linkedKnockIds : fallbackKnockId ? [fallbackKnockId] : []);
  }, [caseLinks, isEditing, knocks, mantisRecords, selectedCase]);

  const account = selectedCase ? getAccountById(selectedCase.account) : null;
  const product = selectedCase ? getProductById(selectedCase.product) : null;
  const project = selectedCase ? getProjectById(selectedCase.project) : null;
  const mantis = selectedCase ? (getMantisByMantisId(selectedCase.mantisId) ?? null) : null;
  const knock = selectedCase ? (getKnockByKnockId(selectedCase.knockId) ?? null) : null;

  const linkedAccounts = caseLinks?.accounts ?? (account ? [account] : []);
  const linkedProducts = caseLinks?.products ?? (product ? [product] : []);
  const linkedProjects = caseLinks?.projects ?? (project ? [project] : []);
  const linkedMantis = caseLinks?.mantis ?? (mantis ? [mantis] : []);
  const linkedKnocks = caseLinks?.knocks ?? (knock ? [knock] : []);
  const linkedAccountRecordIds = new Set(linkedAccounts.map((item) => item.recordId).filter(Boolean));
  const linkedProductRecordIds = new Set(linkedProducts.map((item) => item.recordId).filter(Boolean));
  const linkedProjectRecordIds = new Set(linkedProjects.map((item) => item.recordId).filter(Boolean));
  const linkedMantisRecordIds = new Set(linkedMantis.map((item) => item.recordId).filter(Boolean));
  const linkedKnockRecordIds = new Set(linkedKnocks.map((item) => item.recordId).filter(Boolean));
  const availableAccountsForLink = accounts.filter((item) => !linkedAccountRecordIds.has(item.recordId));
  const availableProductsForLink = products.filter((item) => !linkedProductRecordIds.has(item.recordId));
  const availableProjectsForLink = projects.filter((item) => !linkedProjectRecordIds.has(item.recordId));
  const availableMantisForLink = mantisRecords.filter((item) => !linkedMantisRecordIds.has(item.recordId));
  const availableKnocksForLink = knocks.filter((item) => !linkedKnockRecordIds.has(item.recordId));
  const visibleCaseColumns = CASE_TABLE_COLUMNS.filter((column) => visibleCaseColumnKeys.includes(column.key));

  const handleSort = (key: CaseColumnKey) => {
    setSortConfig((current) => getNextSortConfig(current, key));
  };

  const handleToggleCaseColumn = (key: CaseColumnKey) => {
    const column = CASE_TABLE_COLUMNS.find((item) => item.key === key);
    const isCurrentlyVisible = visibleCaseColumnKeys.includes(key);
    const shouldHide = isCurrentlyVisible && visibleCaseColumnKeys.length > 1;

    if (shouldHide && column?.searchKey) {
      setSearchFilters((current) => ({ ...current, [column.searchKey!]: "" }));
    }

    if (shouldHide && sortConfig.key === key) {
      setSortConfig({ key: "", direction: null });
    }

    setVisibleCaseColumnKeys((current) => toggleColumnKey(current, key, DEFAULT_CASE_COLUMN_KEYS));
  };

  const handleResetCaseColumns = () => {
    setVisibleCaseColumnKeys(DEFAULT_CASE_COLUMN_KEYS);
  };

  const getCaseValue = (caseItem: CaseRecord, key: CaseColumnKey) => {
    switch (key) {
      case "account":
        return getAccountById(caseItem.account)?.accountName || caseItem.account || "";
      case "product":
        return getProductById(caseItem.product)?.productName || caseItem.product || "";
      case "project":
        return getProjectById(caseItem.project)?.projectName || caseItem.project || "";
      default:
        return caseItem[key] || "";
    }
  };

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const filteredCases = cases.filter((caseItem) => {
    if (statusFilter !== "All" && caseItem.status !== statusFilter) return false;
    if (priorityFilter !== "All" && caseItem.priority !== priorityFilter) return false;
    
    if (daysToCloseFilter !== null) {
      if (!caseItem.closeDate) return false;
      const daysDiff = (new Date(caseItem.closeDate).getTime() - Date.now()) / (1000 * 3600 * 24);
      if (daysDiff < 0 || daysDiff > daysToCloseFilter) return false;
    }

    const mantisMatch = caseItem.mantisId ? getMantisByMantisId(caseItem.mantisId) : null;
    const knockMatch = caseItem.knockId ? getKnockByKnockId(caseItem.knockId) : null;

    if (normalizedSearchTerm) {
      const values = [
        ...CASE_TABLE_COLUMNS.map((column) => getCaseValue(caseItem, column.key)),
        mantisMatch?.description,
        mantisMatch?.mantisId,
        knockMatch?.description,
        knockMatch?.knockId,
      ];

      if (!values.some((value) => (value ?? "").toLowerCase().includes(normalizedSearchTerm))) return false;
    }

    return CASE_TABLE_COLUMNS.every((column) => {
      const filter = column.searchKey ? searchFilters[column.searchKey].trim().toLowerCase() : "";
      if (!filter) return true;

      return getCaseValue(caseItem, column.key).toLowerCase().includes(filter);
    });
  });

  const sortedCases = [...filteredCases].sort((a, b) => {
    if (!sortConfig.direction || !sortConfig.key) return 0;
    return compareValues(getCaseValue(a, sortConfig.key), getCaseValue(b, sortConfig.key), sortConfig.direction);
  });

  const handleExportCsv = () => {
    exportRowsToCsv(
      "cases",
      sortedCases,
      visibleCaseColumns.map((column) => ({
        label: column.label,
        value: (caseItem) => getCaseValue(caseItem, column.key),
      })),
    );
  };

  const handleSave = async () => {
    if (!editedCase) return;

    try {
      const nextMantisIds = editedMantisIds.filter(Boolean);
      const nextKnockIds = editedKnockIds.filter(Boolean);
      const currentMantisIds = caseLinks?.mantis.map((item) => item.recordId).filter(Boolean) ?? [];
      const currentKnockIds = caseLinks?.knocks.map((item) => item.recordId).filter(Boolean) ?? [];
      const nextMantisValue = nextMantisIds.length > 0 ? mantisRecords.find((item) => item.recordId === nextMantisIds[0])?.mantisId ?? null : null;
      const nextKnockValue = nextKnockIds.length > 0 ? knocks.find((item) => item.recordId === nextKnockIds[0])?.knockId ?? null : null;

      const saved = await updateCase(editedCase.recordId, {
        account: editedCase.account,
        project: editedCase.project,
        category: editedCase.category,
        escalationType: editedCase.escalationType,
        escalationNote: editedCase.escalationNote,
        product: editedCase.product,
        closeDate: editedCase.closeDate,
        description: editedCase.description,
        seOwner: editedCase.seOwner,
        assignedTo: editedCase.assignedTo,
        priority: editedCase.priority,
        status: editedCase.status,
        knockId: nextKnockValue,
        mantisId: nextMantisValue,
      });

      upsertCase(saved);
      applySavedRecord(saved);

      for (const recordId of currentMantisIds.filter((id) => !nextMantisIds.includes(id))) {
        await removeCaseLink(saved.recordId, "mantis", recordId);
      }
      for (const recordId of currentKnockIds.filter((id) => !nextKnockIds.includes(id))) {
        await removeCaseLink(saved.recordId, "knock", recordId);
      }
      for (const recordId of nextMantisIds.filter((id) => !currentMantisIds.includes(id))) {
        await addCaseLink(saved.recordId, "mantis", recordId);
      }
      for (const recordId of nextKnockIds.filter((id) => !currentKnockIds.includes(id))) {
        await addCaseLink(saved.recordId, "knock", recordId);
      }

      await refreshCaseLinks(saved.recordId);
      await refreshSelectedCase(saved.recordId);
      showToast("Changes saved successfully!", "success");
    } catch (error) {
      console.error("Failed to save case:", error);
      showToast("Failed to save changes. Please try again.", "error");
    }
  };

  const refreshSelectedCase = async (recordId: string) => {
    const refreshed = await getCase(recordId);
    upsertCase(refreshed);
    setSelectedCase(refreshed);
    if (editedCase && editedCase.recordId === refreshed.recordId) {
      setEditedCase(refreshed);
    }
  };

  const refreshCaseLinks = async (recordId: string) => {
    const links = await getCaseLinks(recordId);
    setCaseLinks(links);
  };

  const refreshCurrentCaseLinks = async () => {
    if (!selectedCase) return;

    await refreshSelectedCase(selectedCase.recordId);
    await refreshCaseLinks(selectedCase.recordId);
  };

  const handleLinkEntity = async (key: LinkKey) => {
    if (!selectedCase) return;

    setIsUpdatingLinks(true);
    try {
      const entityTypeMap: Record<LinkKey, CaseLinkEntityType> = {
        account: "account",
        product: "product",
        project: "project",
        mantis: "mantis",
        knock: "knock",
      };
      const entityRecordIds = uniqueNonEmptyValues(Array.isArray(linkDrafts[key]) ? linkDrafts[key] : [linkDrafts[key]]);
      if (entityRecordIds.length === 0) return;

      let updatedLinks: CaseLinksResponse | null = null;
      for (const entityRecordId of entityRecordIds) {
        updatedLinks = await addCaseLink(selectedCase.recordId, entityTypeMap[key], entityRecordId);
      }
      if (updatedLinks) {
        setCaseLinks(updatedLinks);
      }
      await refreshSelectedCase(selectedCase.recordId);
      await refreshCaseLinks(selectedCase.recordId);
      setLinkDrafts((current) => ({
        ...current,
        [key]: Array.isArray(current[key]) ? [] : "",
      } as LinkDrafts));
      showToast("Linked entities updated.", "success");
    } catch (error) {
      console.error("Failed to update linked entities:", error);
      showToast("Failed to update linked entities.", "error");
    } finally {
      setIsUpdatingLinks(false);
    }
  };

  const handleUnlinkEntity = async (key: CaseLinkEntityType, entityRecordId: string) => {
    if (!selectedCase) return;

    setIsUpdatingLinks(true);
    try {
      await removeCaseLink(selectedCase.recordId, key, entityRecordId);
      await refreshSelectedCase(selectedCase.recordId);
      await refreshCaseLinks(selectedCase.recordId);
      showToast("Linked entities updated.", "success");
    } catch (error) {
      console.error("Failed to update linked entities:", error);
      showToast("Failed to update linked entities.", "error");
    } finally {
      setIsUpdatingLinks(false);
    }
  };

  const navigateToLinkedEntity = (entityType: DetailEntityType, targetRecordId: string) => {
    if (!selectedCase?.recordId) return;

    navigate(createDetailTarget(entityType, targetRecordId).path, {
      state: createLinkedDetailState(
        entityType,
        targetRecordId,
        createDetailTarget("case", selectedCase.recordId),
        (location.state as DetailRouteState | null) ?? null,
      ),
    });
  };

  const renderSortIcon = (key: CaseColumnKey) => {
    if (sortConfig.key !== key || !sortConfig.direction) {
      return <ArrowUpDown className="h-4 w-4" />;
    }
    return sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  const renderColumnHeader = (column: CaseTableColumn) => (
    <th key={column.key} className="px-6 py-3 text-left">
      <div className={`flex items-center gap-2 ${column.searchKey ? "mb-2" : ""}`}>
        <span className="text-xs font-medium uppercase tracking-wider text-gray-600">{column.label}</span>
        <button onClick={() => handleSort(column.sortKey)} className="text-gray-400 hover:text-gray-600">
          {renderSortIcon(column.sortKey)}
        </button>
      </div>
      {column.searchKey && (
        <input
          type="text"
          placeholder="Search..."
          value={searchFilters[column.searchKey]}
          onChange={(event) => setSearchFilters({ ...searchFilters, [column.searchKey!]: event.target.value })}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#E31937]"
          onClick={(event) => event.stopPropagation()}
        />
      )}
    </th>
  );

  const renderColumnCell = (caseItem: CaseRecord, column: CaseTableColumn) => {
    switch (column.key) {
      case "description":
      case "escalationNote":
        return (
          <td key={column.key} className="max-w-md truncate whitespace-nowrap px-6 py-4 text-sm text-gray-900" title={textValue(caseItem[column.key])}>
            {textValue(caseItem[column.key])}
          </td>
        );
      case "status":
        return (
          <td key={column.key} className="px-6 py-4">
            <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${caseStatusColors[caseItem.status || ""] ?? "bg-gray-100 text-gray-700"}`}>
              {textValue(caseItem.status)}
            </span>
          </td>
        );
      case "priority":
        return (
          <td key={column.key} className="px-6 py-4">
            <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${casePriorityColors[caseItem.priority || ""] ?? "bg-gray-100 text-gray-700"}`}>
              {textValue(caseItem.priority)}
            </span>
          </td>
        );
      case "account":
        return <td key={column.key} className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{textValue(getAccountById(caseItem.account)?.accountName || caseItem.account)}</td>;
      case "product":
        return <td key={column.key} className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{textValue(getProductById(caseItem.product)?.productName || caseItem.product)}</td>;
      case "project":
        return <td key={column.key} className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{textValue(getProjectById(caseItem.project)?.projectName || caseItem.project)}</td>;
      case "assignedTo":
        return (
          <td key={column.key} className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
            <AssignedToBadge value={caseItem.assignedTo} />
          </td>
        );
      default:
        return <td key={column.key} className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{textValue(caseItem[column.key])}</td>;
    }
  };

  const detailGridClassName = activeDetailTab === "details"
    ? `grid grid-cols-1 gap-3 sm:grid-cols-2 ${
        isEditing
          ? ""
          : "[&>.detail-cell]:flex [&>.detail-cell]:min-w-0 [&>.detail-cell]:items-baseline [&>.detail-cell]:gap-x-2 [&>.detail-cell]:gap-y-1 [&>.detail-cell]:rounded-lg [&>.detail-cell]:border [&>.detail-cell]:border-gray-100 [&>.detail-cell]:bg-gray-50 [&>.detail-cell]:px-3 [&>.detail-cell]:py-2 [&_label]:mb-0 [&_label]:shrink-0 [&_label]:font-semibold [&_label]:after:content-[':'] [&_p]:min-w-0 [&_p]:flex-1 [&_p]:break-words"
      }`
    : "hidden";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cases</h1>
          <p className="mt-1 text-gray-600">Manage and track all customer cases</p>
        </div>
      </div>

      <div className={`rounded-xl border border-gray-200 bg-white shadow-sm ${selectedCase ? "hidden" : ""}`}>
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
              >
                <option value="All">All Status</option>
                <option value="New">New</option>
                <option value="Acknowledged">Acknowledged</option>
                <option value="Escalated">Escalated</option>
                <option value="Monitoring">Monitoring</option>
                <option value="Closed-Resolved">Closed-Resolved</option>
                <option value="Closed-Dead">Closed-Dead</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            </div>

            <div className="relative">
              <select
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value)}
                className="appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
              >
                <option value="All">All Priority</option>
                <option value="Very Low">Very Low</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Very High">Very High</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="text-sm text-gray-500">{visibleCaseColumns.length} of {CASE_TABLE_COLUMNS.length} fields shown</p>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={sortedCases.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <CreateEntityDialog entityType="case" onCreated={selectRecord} />
            <TableFieldSelector
              columns={CASE_TABLE_COLUMNS}
              visibleKeys={visibleCaseColumnKeys}
              onToggle={handleToggleCaseColumn}
              onReset={handleResetCaseColumns}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="w-12 px-4 py-3 text-left">
                  <Bookmark className="h-4 w-4 text-gray-500" aria-label="Bookmark" />
                </th>
                {visibleCaseColumns.map(renderColumnHeader)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedCases.map((caseItem) => (
                <tr
                  key={caseItem.recordId}
                  onClick={() => {
                    setSelectedCase(caseItem);
                    setActiveDetailTab("details");
                  }}
                  className="cursor-pointer transition-colors hover:bg-gray-50"
                >
                  <td className="px-4 py-4 text-center" onClick={(event) => event.stopPropagation()}>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isBookmarked(caseItem.recordId, "case")) {
                          removeBookmark(caseItem.recordId, "case");
                        } else {
                          addBookmark({
                            id: caseItem.recordId,
                            type: "case",
                            title: caseItem.description,
                            subtitle: `${textValue(caseItem.status)} - ${textValue(caseItem.priority)}`,
                            timestamp: Date.now(),
                          });
                        }
                      }}
                      className="text-gray-400 transition-colors hover:text-yellow-500"
                      title="Bookmark"
                    >
                      <Bookmark className={`h-5 w-5 ${isBookmarked(caseItem.recordId, "case") ? "fill-yellow-400 text-yellow-500" : ""}`} />
                    </button>
                  </td>
                  {visibleCaseColumns.map((column) => renderColumnCell(caseItem, column))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCase && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="w-full">
            <div className="sticky top-[-1.5rem] z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6">
              <h2 className="text-xl font-semibold text-gray-900">Case Details</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (isBookmarked(selectedCase.recordId, "case")) {
                      removeBookmark(selectedCase.recordId, "case");
                    } else {
                      addBookmark({
                        id: selectedCase.recordId,
                        type: "case",
                        title: selectedCase.description,
                        subtitle: `${textValue(selectedCase.status)} - ${textValue(selectedCase.priority)}`,
                        timestamp: Date.now(),
                      });
                    }
                  }}
                  className={`rounded-lg p-2 transition-colors ${
                    isBookmarked(selectedCase.recordId, "case")
                      ? "bg-yellow-100 text-yellow-600"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                  title="Bookmark this case"
                >
                  <Bookmark className={`h-5 w-5 ${isBookmarked(selectedCase.recordId, "case") ? "fill-current" : ""}`} />
                </button>
                {!isEditing ? (
                  <button
                    onClick={handleEdit}
                    className="flex items-center gap-2 rounded-lg bg-[#E31937] px-4 py-2 text-white transition-colors hover:bg-[#c41230]"
                  >
                    <Edit2 className="h-4 w-4" />
                    Edit
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleCancelEdit}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      className="flex items-center gap-2 rounded-lg bg-[#E31937] px-4 py-2 text-white transition-colors hover:bg-[#c41230]"
                    >
                      <Save className="h-4 w-4" />
                      Save
                    </button>
                  </>
                )}
                <button
                  onClick={handleBackFromDetail}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              </div>
            </div>

            <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
              <div className="min-w-0 space-y-6">
                <DetailTabs tabs={CASE_DETAIL_TABS} activeTab={activeDetailTab} onChange={setActiveDetailTab} />

              <div className={detailGridClassName}>
                <div className="order-1 sm:col-span-2 rounded-xl border border-gray-200 bg-gray-50/50 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className={`detail-cell ${!isEditing ? "flex items-center gap-2 whitespace-nowrap" : ""}`}>
                    <label className={`${!isEditing ? "mb-0 shrink-0 font-semibold after:content-[':']" : "mb-1 block"} text-sm font-medium text-gray-600`}>Escalation Status</label>
                    {isEditing && editedCase ? (
                      <select
                        value={editedCase.status || ""}
                        onChange={(event) => setEditedCase({ ...editedCase, status: event.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      >
                        <option value="">No status</option>
                        <option value="New">New</option>
                        <option value="Acknowledged">Acknowledged</option>
                        <option value="Escalated">Escalated</option>
                        <option value="Monitoring">Monitoring</option>
                        <option value="Closed-Resolved">Closed-Resolved</option>
                        <option value="Closed-Dead">Closed-Dead</option>
                      </select>
                    ) : (
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${caseStatusColors[selectedCase.status || ""] ?? "bg-gray-100 text-gray-700"}`}>
                        {textValue(selectedCase.status)}
                      </span>
                    )}
                  </div>
                  <div className={`detail-cell ${!isEditing ? "flex items-center gap-2 whitespace-nowrap" : ""}`}>
                    <label className={`${!isEditing ? "mb-0 shrink-0 font-semibold after:content-[':']" : "mb-1 block"} text-sm font-medium text-gray-600`}>Assigned To</label>
                    {isEditing && editedCase ? (
                      <select
                        value={editedCase.assignedTo || ""}
                        onChange={(event) => setEditedCase({ ...editedCase, assignedTo: event.target.value })}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      >
                        <option value="">Unassigned</option>
                        {assignableUsers.map((assignableUser) => (
                          <option key={assignableUser.id} value={assignableUser.displayName}>
                            {assigneeLabel(assignableUser)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <AssignedToBadge value={selectedCase.assignedTo} />
                    )}
                  </div>
                </div>
                <div className="order-2 detail-cell">
                  <label className="mb-1 block text-sm font-medium text-gray-600">Priority</label>
                  {isEditing && editedCase ? (
                    <select
                      value={editedCase.priority || ""}
                      onChange={(event) => setEditedCase({ ...editedCase, priority: event.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">No priority</option>
                      <option value="Very Low">Very Low</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Very High">Very High</option>
                    </select>
                  ) : (
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${casePriorityColors[selectedCase.priority || ""] ?? "bg-gray-100 text-gray-700"}`}>
                      {textValue(selectedCase.priority)}
                    </span>
                  )}
                </div>
                <div className="order-4 detail-cell">
                  <label className="mb-1 block text-sm font-medium text-gray-600">SE Owner</label>
                  {isEditing && editedCase ? (
                    <select
                      value={editedCase.seOwner || ""}
                      onChange={(event) => setEditedCase({ ...editedCase, seOwner: event.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">No SE owner</option>
                      {assignableUsers.map((assignableUser) => (
                        <option key={assignableUser.id} value={assignableUser.displayName}>
                          {assigneeLabel(assignableUser)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-gray-900">{textValue(selectedCase.seOwner)}</p>
                  )}
                </div>
                <div className="order-5 detail-cell">
                  <label className="mb-1 block text-sm font-medium text-gray-600">Account</label>
                  {isEditing && editedCase ? (
                    <div className="flex gap-2">
                      <select
                        value={editedCase.account || ""}
                        onChange={(event) => setEditedCase({ ...editedCase, account: event.target.value })}
                        className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      >
                        <option value="">No account</option>
                        {accounts.map((item) => (
                          <option key={item.recordId} value={item.recordId}>
                            {item.accountName}
                          </option>
                        ))}
                      </select>
                      <CreateEntityDialog
                        entityType="account"
                        triggerLabel="New"
                        triggerTitle="Create account"
                        hideLinkedCaseSelect
                        className={RELATED_CREATE_BUTTON_CLASS}
                        onCreated={(created) => {
                          setEditedCase((current) => current ? { ...current, account: created.recordId } : current);
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-gray-900">{textValue(account?.accountName || selectedCase.account)}</p>
                  )}
                </div>
                <div className="order-6 detail-cell">
                  <label className="mb-1 block text-sm font-medium text-gray-600">Product</label>
                  {isEditing && editedCase ? (
                    <div className="flex gap-2">
                      <select
                        value={editedCase.product || ""}
                        onChange={(event) => setEditedCase({ ...editedCase, product: event.target.value })}
                        className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      >
                        <option value="">No product</option>
                        {products.map((item) => (
                          <option key={item.recordId} value={item.recordId}>
                            {item.productName}
                          </option>
                        ))}
                      </select>
                      <CreateEntityDialog
                        entityType="product"
                        triggerLabel="New"
                        triggerTitle="Create product"
                        hideLinkedCaseSelect
                        className={RELATED_CREATE_BUTTON_CLASS}
                        onCreated={(created) => {
                          setEditedCase((current) => current ? { ...current, product: created.recordId } : current);
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-gray-900">{textValue(product?.productName || selectedCase.product)}</p>
                  )}
                </div>
                <div className="order-7 detail-cell">
                  <label className="mb-1 block text-sm font-medium text-gray-600">Project</label>
                  {isEditing && editedCase ? (
                    <div className="flex gap-2">
                      <select
                        value={editedCase.project || ""}
                        onChange={(event) => setEditedCase({ ...editedCase, project: event.target.value })}
                        className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      >
                        <option value="">No project</option>
                        {projects.map((item) => (
                          <option key={item.recordId} value={item.recordId}>
                            {item.projectName}
                          </option>
                        ))}
                      </select>
                      <CreateEntityDialog
                        entityType="project"
                        triggerLabel="New"
                        triggerTitle="Create project"
                        initialValues={editedCase.account ? { accountId: editedCase.account } : undefined}
                        hideLinkedCaseSelect
                        className={RELATED_CREATE_BUTTON_CLASS}
                        onCreated={(created) => {
                          setEditedCase((current) => current ? { ...current, project: created.recordId } : current);
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-gray-900">{textValue(project?.projectName || selectedCase.project)}</p>
                  )}
                </div>
                <div className="order-8 detail-cell">
                  <label className="mb-1 block text-sm font-medium text-gray-600">Knock IDs</label>
                  {isEditing && editedCase ? (
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <MultiSelectDropdown
                          label="Knock IDs"
                          values={editedKnockIds}
                          options={knocks}
                          getOptionLabel={(item) => item.knockId || "No Knock ID"}
                          onChange={setEditedKnockIds}
                        />
                      </div>
                      <CreateEntityDialog
                        entityType="knock"
                        triggerLabel="New"
                        triggerTitle="Create knock"
                        initialValues={{ linkedCase: selectedCase.recordId }}
                        hideLinkedCaseSelect
                        className={RELATED_CREATE_BUTTON_CLASS}
                        onCreated={(created) => {
                          setEditedKnockIds((current) => (current.includes(created.recordId) ? current : [...current, created.recordId]));
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-gray-900">{textValue(linkedKnocks.length > 0 ? linkedKnocks.map((item) => item.knockId).filter(Boolean).join(", ") : knock?.knockId || selectedCase.knockId)}</p>
                  )}
                </div>
                <div className="order-9 detail-cell">
                  <label className="mb-1 block text-sm font-medium text-gray-600">Mantis IDs</label>
                  {isEditing && editedCase ? (
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <MultiSelectDropdown
                          label="Mantis IDs"
                          values={editedMantisIds}
                          options={mantisRecords}
                          getOptionLabel={(item) => item.mantisId || "No Mantis ID"}
                          onChange={setEditedMantisIds}
                        />
                      </div>
                      <CreateEntityDialog
                        entityType="mantis"
                        triggerLabel="New"
                        triggerTitle="Create mantis"
                        initialValues={{ linkedCase: selectedCase.recordId }}
                        hideLinkedCaseSelect
                        className={RELATED_CREATE_BUTTON_CLASS}
                        onCreated={(created) => {
                          setEditedMantisIds((current) => (current.includes(created.recordId) ? current : [...current, created.recordId]));
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-gray-900">{textValue(linkedMantis.length > 0 ? linkedMantis.map((item) => item.mantisId).filter(Boolean).join(", ") : mantis?.mantisId || selectedCase.mantisId)}</p>
                  )}
                </div>
                <div className="order-10 detail-cell">
                  <label className="mb-1 block text-sm font-medium text-gray-600">Category</label>
                  {isEditing && editedCase ? (
                    <select
                      value={editedCase.category || ""}
                      onChange={(event) => setEditedCase({ ...editedCase, category: event.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">Select category</option>
                      {caseCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-gray-900">{textValue(selectedCase.category)}</p>
                  )}
                </div>
                <div className="order-11 detail-cell">
                  <label className="mb-1 block text-sm font-medium text-gray-600">Close Date</label>
                  {isEditing && editedCase ? (
                    <input
                      type="date"
                      value={editedCase.closeDate || ""}
                      onChange={(event) => setEditedCase({ ...editedCase, closeDate: event.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{textValue(selectedCase.closeDate)}</p>
                  )}
                </div>
                <div className="order-12 detail-cell">
                  <label className="mb-1 block text-sm font-medium text-gray-600">Escalation Type</label>
                  {isEditing && editedCase ? (
                    <select
                      value={editedCase.escalationType || ""}
                      onChange={(event) => setEditedCase({ ...editedCase, escalationType: event.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">Select escalation type</option>
                      {caseEscalationTypes.map((escalationType) => (
                        <option key={escalationType} value={escalationType}>
                          {escalationType}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-gray-900">{textValue(selectedCase.escalationType)}</p>
                  )}
                </div>
                <div className="order-[14] sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-600">Description</label>
                  {isEditing && editedCase ? (
                    <textarea
                      value={editedCase.description}
                      onChange={(event) => setEditedCase({ ...editedCase, description: event.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      rows={3}
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.description}</p>
                  )}
                </div>
                <div className="order-[15] sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-600">Escalation Note</label>
                  {isEditing && editedCase ? (
                    <textarea
                      value={editedCase.escalationNote || ""}
                      onChange={(event) => setEditedCase({ ...editedCase, escalationNote: event.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      rows={2}
                    />
                  ) : (
                    <p className="text-gray-900">{textValue(selectedCase.escalationNote)}</p>
                  )}
                </div>
              </div>

              <div className={activeDetailTab.startsWith("linked") ? "pt-1" : "hidden"}>
                <h3 className="mb-4 text-lg font-semibold text-gray-900">
                  {CASE_DETAIL_TABS.find((tab) => tab.key === activeDetailTab)?.label}
                </h3>
                {(activeDetailTab === "linkedMantisRecords" || activeDetailTab === "linkedKnocks") && (
                  <p className="mb-4 text-sm text-gray-500">
                    Add multiple Mantis and Knock links here. The case editor above stays synced to the same linked records.
                  </p>
                )}
                <div className="space-y-4">
                  {activeDetailTab === "linkedAccounts" && (
                  <>
                  <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 md:flex-row md:items-center">
                    <select
                      value={linkDrafts.account}
                      onChange={(event) => setLinkDrafts((prev) => ({ ...prev, account: event.target.value }))}
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">Select account</option>
                      {availableAccountsForLink.map((item) => (
                        <option key={item.recordId} value={item.recordId}>
                          {item.accountName}
                        </option>
                      ))}
                    </select>
                    <CreateEntityDialog
                      entityType="account"
                      triggerLabel="New"
                      triggerTitle="Create account"
                      initialValues={{ linkedCase: selectedCase.recordId }}
                      hideLinkedCaseSelect
                      className={RELATED_CREATE_BUTTON_CLASS}
                      onCreated={() => {
                        void refreshCurrentCaseLinks();
                      }}
                    />
                    <button
                      onClick={() => void handleLinkEntity("account")}
                      disabled={isUpdatingLinks || !linkDrafts.account}
                      className="rounded-lg bg-[#E31937] px-3 py-2 text-white hover:bg-[#c41230] disabled:opacity-50"
                    >
                      Link Account
                    </button>
                  </div>
                  <LinkedEntityList
                    title="Account"
                    entities={linkedAccounts}
                    fields={[
                      { label: "Name", key: "accountName" },
                      { label: "Type", key: "type" },
                      { label: "Vertical", key: "vertical" },
                    ]}
                    onEntityClick={(recordId) => navigateToLinkedEntity("account", recordId)}
                    onRemoveEntity={(recordId) => void handleUnlinkEntity("account", recordId)}
                  />
                  </>
                  )}

                  {activeDetailTab === "linkedProducts" && (
                  <>
                  <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 md:flex-row md:items-center">
                    <select
                      value={linkDrafts.product}
                      onChange={(event) => setLinkDrafts((prev) => ({ ...prev, product: event.target.value }))}
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">Select product</option>
                      {availableProductsForLink.map((item) => (
                        <option key={item.recordId} value={item.recordId}>
                          {item.productName}
                        </option>
                      ))}
                    </select>
                    <CreateEntityDialog
                      entityType="product"
                      triggerLabel="New"
                      triggerTitle="Create product"
                      initialValues={{ linkedCase: selectedCase.recordId }}
                      hideLinkedCaseSelect
                      className={RELATED_CREATE_BUTTON_CLASS}
                      onCreated={() => {
                        void refreshCurrentCaseLinks();
                      }}
                    />
                    <button
                      onClick={() => void handleLinkEntity("product")}
                      disabled={isUpdatingLinks || !linkDrafts.product}
                      className="rounded-lg bg-[#E31937] px-3 py-2 text-white hover:bg-[#c41230] disabled:opacity-50"
                    >
                      Link Product
                    </button>
                  </div>
                  <LinkedEntityList
                    title="Product"
                    entities={linkedProducts}
                    fields={[
                      { label: "Name", key: "productName" },
                      { label: "Family", key: "productFamily" },
                    ]}
                    onEntityClick={(recordId) => navigateToLinkedEntity("product", recordId)}
                    onRemoveEntity={(recordId) => void handleUnlinkEntity("product", recordId)}
                  />
                  </>
                  )}

                  {activeDetailTab === "linkedProjects" && (
                  <>
                  <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 md:flex-row md:items-center">
                    <select
                      value={linkDrafts.project}
                      onChange={(event) => setLinkDrafts((prev) => ({ ...prev, project: event.target.value }))}
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">Select project</option>
                      {availableProjectsForLink.map((item) => (
                        <option key={item.recordId} value={item.recordId}>
                          {item.projectName}
                        </option>
                      ))}
                    </select>
                    <CreateEntityDialog
                      entityType="project"
                      triggerLabel="New"
                      triggerTitle="Create project"
                      initialValues={{
                        accountId: selectedCase.account ?? "",
                        linkedCase: selectedCase.recordId,
                      }}
                      hideLinkedCaseSelect
                      className={RELATED_CREATE_BUTTON_CLASS}
                      onCreated={() => {
                        void refreshCurrentCaseLinks();
                      }}
                    />
                    <button
                      onClick={() => void handleLinkEntity("project")}
                      disabled={isUpdatingLinks || !linkDrafts.project}
                      className="rounded-lg bg-[#E31937] px-3 py-2 text-white hover:bg-[#c41230] disabled:opacity-50"
                    >
                      Link Project
                    </button>
                  </div>
                  <LinkedEntityList
                    title="Project"
                    entities={linkedProjects}
                    fields={[
                      { label: "Name", key: "projectName" },
                      { label: "Stage", key: "stage" },
                      { label: "Value", key: "sfdcValue" },
                    ]}
                    onEntityClick={(recordId) => navigateToLinkedEntity("project", recordId)}
                    onRemoveEntity={(recordId) => void handleUnlinkEntity("project", recordId)}
                  />
                  </>
                  )}

                  {activeDetailTab === "linkedMantisRecords" && (
                  <>
                  <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <MultiSelectDropdown
                        label="Mantis records"
                        values={linkDrafts.mantis}
                        options={availableMantisForLink}
                        getOptionLabel={(item) => item.mantisId ? `${item.mantisId} - ${item.description}` : item.description}
                        onChange={(values) => setLinkDrafts((prev) => ({ ...prev, mantis: values }))}
                      />
                    </div>
                    <CreateEntityDialog
                      entityType="mantis"
                      triggerLabel="New"
                      triggerTitle="Create mantis"
                      initialValues={{ linkedCase: selectedCase.recordId }}
                      hideLinkedCaseSelect
                      className={RELATED_CREATE_BUTTON_CLASS}
                      onCreated={() => {
                        void refreshCurrentCaseLinks();
                      }}
                    />
                    <button
                      onClick={() => void handleLinkEntity("mantis")}
                      disabled={isUpdatingLinks || linkDrafts.mantis.length === 0}
                      className="shrink-0 rounded-lg bg-[#E31937] px-3 py-2 text-white hover:bg-[#c41230] disabled:opacity-50"
                    >
                      Link Selected Mantis
                    </button>
                  </div>
                  <LinkedEntityList
                    title="Mantis"
                    entities={linkedMantis}
                    fields={[
                      { label: "Mantis ID", key: "mantisId" },
                      { label: "Status", key: "mantisStatus" },
                      { label: "Target Date", key: "mantisTargetDate" },
                    ]}
                    onEntityClick={(recordId) => navigateToLinkedEntity("mantis", recordId)}
                    onRemoveEntity={(recordId) => void handleUnlinkEntity("mantis", recordId)}
                  />
                  </>
                  )}

                  {activeDetailTab === "linkedKnocks" && (
                  <>
                  <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <MultiSelectDropdown
                        label="Knock records"
                        values={linkDrafts.knock}
                        options={availableKnocksForLink}
                        getOptionLabel={(item) => item.knockId ? `${item.knockId} - ${item.description}` : item.description}
                        onChange={(values) => setLinkDrafts((prev) => ({ ...prev, knock: values }))}
                      />
                    </div>
                    <CreateEntityDialog
                      entityType="knock"
                      triggerLabel="New"
                      triggerTitle="Create knock"
                      initialValues={{ linkedCase: selectedCase.recordId }}
                      hideLinkedCaseSelect
                      className={RELATED_CREATE_BUTTON_CLASS}
                      onCreated={() => {
                        void refreshCurrentCaseLinks();
                      }}
                    />
                    <button
                      onClick={() => void handleLinkEntity("knock")}
                      disabled={isUpdatingLinks || linkDrafts.knock.length === 0}
                      className="shrink-0 rounded-lg bg-[#E31937] px-3 py-2 text-white hover:bg-[#c41230] disabled:opacity-50"
                    >
                      Link Selected Knocks
                    </button>
                  </div>
                  <LinkedEntityList
                    title="Knock"
                    entities={linkedKnocks}
                    fields={[
                      { label: "Knock ID", key: "knockId" },
                      { label: "Status", key: "status" },
                      { label: "Target Date", key: "targetDate" },
                    ]}
                    onEntityClick={(recordId) => navigateToLinkedEntity("knock", recordId)}
                    onRemoveEntity={(recordId) => void handleUnlinkEntity("knock", recordId)}
                  />
                  </>
                  )}
                </div>

              </div>

              </div>

              <div className="min-w-0 self-start rounded-lg border border-gray-200 bg-white p-4 xl:sticky xl:top-24 xl:max-h-[calc(100vh-8rem)] xl:overflow-x-hidden xl:overflow-y-auto">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">History</h3>

                <div className="mb-4 border-b border-gray-200 pb-4">
                  <label className="mb-2 block text-sm font-medium text-gray-700">Add Comment</label>
                  {selectedQuote && (
                    <div className="mb-3 rounded-lg border border-gray-200 border-l-4 border-l-[#6264A7] bg-gray-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-gray-500">
                          Replying to {selectedQuote.user} - {formatTimestampMinute(selectedQuote.timestamp)}
                        </p>
                        <button
                          onClick={() => setSelectedQuote(null)}
                          className="text-xs text-[#6264A7] hover:underline"
                        >
                          Clear quote
                        </button>
                      </div>
                      <p className="mt-1 line-clamp-3 break-words text-sm text-gray-700 [overflow-wrap:anywhere]">
                        {formatHistoryEntryText(selectedQuote)}
                      </p>
                    </div>
                  )}
                  <textarea
                    value={newComment}
                    onChange={(event) => setNewComment(event.target.value)}
                    placeholder="Enter your comment..."
                    rows={3}
                    className="min-w-0 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={handleAddComment}
                      disabled={isAddingComment || !newComment.trim()}
                      className="rounded-lg bg-[#E31937] px-4 py-2 text-white transition-colors hover:bg-[#c41230] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isAddingComment ? "Adding..." : "Add Comment"}
                    </button>
                  </div>
                </div>

                <RecordHistoryTimeline history={selectedCase.history} onQuote={setSelectedQuote} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
