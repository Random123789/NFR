import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Bookmark, Download, Edit2, Eye, Save, Trash2, UserPlus, UserRound, X } from "lucide-react";
import {
  addCaseWatcher,
  addCaseLink,
  addCaseHistory,
  deleteCase,
  getCase,
  getCaseLinks,
  listAssignableUsers,
  removeCaseWatcher,
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
import { MultiRecordDropdown, SearchableSelect, type SelectOption } from "../components/SearchableSelect";
import { TypeaheadTextarea } from "../components/TypeaheadInput";
import { TableFieldSelector } from "../components/TableFieldSelector";
import { PageGuide } from "../components/PageGuide";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { useBookmarks } from "../context/BookmarksContext";
import { useRecords } from "../context/RecordsContext";
import { useRecordReadState } from "../context/RecordReadContext";
import { useSearch } from "../context/SearchContext";
import { useToast } from "../context/ToastContext";
import { accountVerticals } from "../data/accountOptions";
import { caseCategories, caseEscalationTypes, casePriorities, caseStatuses } from "../data/caseOptions";
import { caseGuideSteps } from "../data/pageGuides";
import { casePriorityColors, caseStatusColors } from "../data/recordStyles";
import { useRoutedEntityDetail } from "../hooks/useEntityDetail";
import { useRecordComments } from "../hooks/useRecordComments";
import { compareValues, getNextSortConfig, toggleColumnKey, useStoredColumnKeys, type SortConfig } from "../hooks/useTableColumns";
import {
  createDetailPath,
  createDetailTarget,
  createLinkedDetailState,
  resolveDetailRouteRecordId,
  type DetailEntityType,
  type DetailRouteState,
} from "../navigation/detailNavigation";
import { exportRowsToCsv } from "../utils/csvExport";
import { formatTimestampMinute } from "../utils/dateTime";
import { fieldSuggestions } from "../utils/typeaheadOptions";
import { getRecordActivityTimestamp } from "../utils/recordActivity";
import { unreadRowClassName } from "../utils/unreadRows";
import {
  isActiveAssignableUser,
  isManagerRole,
  isSeOwnerRole,
  toAssignableUserOption,
} from "../utils/assignableUsers";

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

type CaseFilterMatchMode = "all" | "any";

const CASE_TABLE_COLUMNS: CaseTableColumn[] = [
  { key: "description", label: "Description", sortKey: "description", searchKey: "description" },
  { key: "account", label: "Accounts", sortKey: "account", searchKey: "account" },
  { key: "project", label: "Project", sortKey: "project", searchKey: "project" },
  { key: "category", label: "Category", sortKey: "category", searchKey: "category" },
  { key: "escalationType", label: "Escalation Type", sortKey: "escalationType", searchKey: "escalationType" },
  { key: "product", label: "Products", sortKey: "product", searchKey: "product" },
  { key: "closeDate", label: "Close Date", sortKey: "closeDate", searchKey: "closeDate" },
  { key: "seOwner", label: "SE Owner", sortKey: "seOwner", searchKey: "seOwner" },
  { key: "assignedTo", label: "Assigned To", sortKey: "assignedTo", searchKey: "assignedTo" },
  { key: "priority", label: "Priority", sortKey: "priority" },
  { key: "status", label: "Status", sortKey: "status" },
  { key: "knockId", label: "Knock IDs", sortKey: "knockId", searchKey: "knockId" },
  { key: "mantisId", label: "Mantis IDs", sortKey: "mantisId", searchKey: "mantisId" },
  { key: "escalationNote", label: "Escalation Note", sortKey: "escalationNote", searchKey: "escalationNote" },
];

const DEFAULT_CASE_COLUMN_KEYS = CASE_TABLE_COLUMNS.map((column) => column.key);
const DEFAULT_CASE_SEARCH_FILTERS: Record<CaseSearchKey, string> = {
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
};
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

function normalizePersonKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeFilterValues(value: unknown) {
  if (Array.isArray(value)) {
    return uniqueNonEmptyValues(value.filter((item): item is string => typeof item === "string" && item !== "All"));
  }

  return typeof value === "string" && value !== "All" && value ? [value] : [];
}

function normalizeCaseFilterMatchMode(value: unknown): CaseFilterMatchMode {
  return value === "any" ? "any" : "all";
}

function normalizeSearchFilters(value: unknown): Record<CaseSearchKey, string> {
  const nextFilters = { ...DEFAULT_CASE_SEARCH_FILTERS };
  if (!value || typeof value !== "object" || Array.isArray(value)) return nextFilters;

  for (const key of Object.keys(DEFAULT_CASE_SEARCH_FILTERS) as CaseSearchKey[]) {
    const nextValue = (value as Record<string, unknown>)[key];
    if (typeof nextValue === "string") {
      nextFilters[key] = nextValue;
    }
  }

  return nextFilters;
}

function toFilterOptions(values: string[]): SelectOption[] {
  return values.map((value) => ({ value, label: value }));
}

function isPresent<T>(value: T | null | undefined): value is T {
  return Boolean(value);
}

export function Cases() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { searchTerm } = useSearch();
  const { addBookmark, removeBookmark, isBookmarked } = useBookmarks();
  const { isRecordUnread, markRecordRead } = useRecordReadState();
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
    getMantisById,
    getKnockById,
    getCaseById,
    upsertCase,
    removeCase,
    refreshRecords,
  } = useRecords();
  const {
    selectedRecord: selectedCase,
    setSelectedRecord: setSelectedCase,
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
    resolveRouteRecordId: (routeParam) => resolveDetailRouteRecordId("case", routeParam, cases),
  });
  const { newComment, setNewComment, selectedQuote, setSelectedQuote, isAddingComment, handleAddComment } = useRecordComments({
    selectedRecord: selectedCase,
    setSelectedRecord: setSelectedCase,
    addHistory: addCaseHistory,
    upsertRecord: upsertCase,
    userName: user?.displayName,
    onError: (message) => showToast(message, "error"),
  });
  const selectedCaseActivityAt = getRecordActivityTimestamp(selectedCase);
  const caseDescriptionSuggestions = useMemo(
    () => fieldSuggestions(cases, "description", selectedCase?.recordId),
    [cases, selectedCase?.recordId],
  );
  const caseEscalationNoteSuggestions = useMemo(
    () => fieldSuggestions(cases, "escalationNote", selectedCase?.recordId),
    [cases, selectedCase?.recordId],
  );

  useEffect(() => {
    if (!selectedCase) return;
    void markRecordRead("case", selectedCase.recordId);
  }, [markRecordRead, selectedCase?.recordId, selectedCaseActivityAt]);

  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const locationState = location.state as any;
  const [statusFilters, setStatusFilters] = useState<string[]>(() =>
    normalizeFilterValues(locationState?.statusFilters ?? locationState?.statusFilter),
  );
  const [priorityFilters, setPriorityFilters] = useState<string[]>(() =>
    normalizeFilterValues(locationState?.priorityFilters ?? locationState?.priorityFilter),
  );
  const [verticalFilters, setVerticalFilters] = useState<string[]>(() =>
    normalizeFilterValues(locationState?.verticalFilters ?? locationState?.verticalFilter),
  );
  const [productFilters, setProductFilters] = useState<string[]>(() =>
    normalizeFilterValues(locationState?.productFilters ?? locationState?.productFilter),
  );
  const [caseFilterMatchMode, setCaseFilterMatchMode] = useState<CaseFilterMatchMode>(() => normalizeCaseFilterMatchMode(locationState?.caseFilterMatchMode));
  const [peopleFilters, setPeopleFilters] = useState<string[]>(() => normalizeFilterValues(locationState?.peopleFilters ?? locationState?.ownerFilters));
  const [watcherFilters, setWatcherFilters] = useState<string[]>(() => normalizeFilterValues(locationState?.watcherFilters ?? locationState?.watcherFilter));
  const [daysToCloseFilter, setDaysToCloseFilter] = useState<number | null>(locationState?.daysToCloseFilter ?? null);
  const [isUpdatingLinks, setIsUpdatingLinks] = useState(false);
  const [visibleCaseColumnKeys, setVisibleCaseColumnKeys] = useStoredColumnKeys<CaseColumnKey>(CASE_COLUMN_STORAGE_KEY, DEFAULT_CASE_COLUMN_KEYS);
  const [caseLinks, setCaseLinks] = useState<CaseLinksResponse | null>(null);
  const [editedMantisIds, setEditedMantisIds] = useState<string[]>([]);
  const [editedKnockIds, setEditedKnockIds] = useState<string[]>([]);
  const [linkDrafts, setLinkDrafts] = useState<LinkDrafts>(() => emptyLinkDrafts());
  const [watcherDraftUserId, setWatcherDraftUserId] = useState("");
  const [isUpdatingWatchers, setIsUpdatingWatchers] = useState(false);
  const [searchFilters, setSearchFilters] = useState<Record<CaseSearchKey, string>>(() => normalizeSearchFilters(locationState?.searchFilters));
  const [sortConfig, setSortConfig] = useState<SortConfig<CaseColumnKey>>({
    key: "",
    direction: null,
  });
  const activeAssignableUsers = useMemo(() => assignableUsers.filter(isActiveAssignableUser), [assignableUsers]);
  const statusFilterOptions = useMemo(() => toFilterOptions(caseStatuses), []);
  const priorityFilterOptions = useMemo(() => toFilterOptions(casePriorities), []);
  const verticalFilterOptions = useMemo(() => toFilterOptions([...accountVerticals]), []);
  const productFilterOptions = useMemo(
    () =>
      products.map((product) => ({
        value: product.recordId,
        label: product.productName,
        description: [product.productFamily, product.productVersion ? `v${product.productVersion}` : null].filter(Boolean).join(" | "),
      })),
    [products],
  );
  const managerSelectOptions = useMemo(
    () => activeAssignableUsers.filter((assignableUser) => isManagerRole(assignableUser.role)).map(toAssignableUserOption),
    [activeAssignableUsers],
  );
  const seOwnerSelectOptions = useMemo(
    () => activeAssignableUsers.filter((assignableUser) => isSeOwnerRole(assignableUser.role)).map(toAssignableUserOption),
    [activeAssignableUsers],
  );
  const watcherSelectOptions = useMemo(
    () =>
      activeAssignableUsers.map((assignableUser) => ({
        value: String(assignableUser.id),
        label: assignableUser.displayName,
        description: [
          assignableUser.email,
          isManagerRole(assignableUser.role) ? "Manager" : assignableUser.vertical,
        ].filter(Boolean).join(" | "),
      })),
    [activeAssignableUsers],
  );

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
      setWatcherDraftUserId("");
      return;
    }

    setLinkDrafts(emptyLinkDrafts());
    setWatcherDraftUserId("");

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
    const fallbackMantisIds = uniqueNonEmptyValues(selectedCase.mantisRecordIds ?? []);
    const fallbackKnockIds = uniqueNonEmptyValues(selectedCase.knockRecordIds ?? []);

    setEditedMantisIds(linkedMantisIds.length > 0 ? linkedMantisIds : fallbackMantisIds);
    setEditedKnockIds(linkedKnockIds.length > 0 ? linkedKnockIds : fallbackKnockIds);
  }, [caseLinks, isEditing, selectedCase]);

  const project = selectedCase ? getProjectById(selectedCase.project) : null;
  const fallbackAccounts = selectedCase ? (selectedCase.accountIds ?? []).map(getAccountById).filter(isPresent) : [];
  const fallbackProducts = selectedCase ? (selectedCase.productIds ?? []).map(getProductById).filter(isPresent) : [];
  const fallbackMantis = selectedCase ? (selectedCase.mantisRecordIds ?? []).map(getMantisById).filter(isPresent) : [];
  const fallbackKnocks = selectedCase ? (selectedCase.knockRecordIds ?? []).map(getKnockById).filter(isPresent) : [];

  const linkedAccounts = caseLinks?.accounts ?? fallbackAccounts;
  const linkedProducts = caseLinks?.products ?? fallbackProducts;
  const linkedProjects = caseLinks?.projects ?? (project ? [project] : []);
  const linkedMantis = caseLinks?.mantis ?? fallbackMantis;
  const linkedKnocks = caseLinks?.knocks ?? fallbackKnocks;
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
  const selectedWatcherNames = selectedCase?.watcherNames ?? [];
  const selectedWatcherNameKeys = new Set(selectedWatcherNames.map(normalizePersonKey).filter(Boolean));
  const availableWatcherSelectOptions = watcherSelectOptions.filter((option) => !selectedWatcherNameKeys.has(normalizePersonKey(option.label)));
  const isCurrentUserWatching = Boolean(user?.displayName && selectedWatcherNameKeys.has(normalizePersonKey(user.displayName)));
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
        return (caseItem.accountIds ?? []).map((accountId) => getAccountById(accountId)?.accountName || accountId).join(", ");
      case "product":
        return (caseItem.productIds ?? []).map((productId) => getProductById(productId)?.productName || productId).join(", ");
      case "project":
        return getProjectById(caseItem.project)?.projectName || caseItem.project || "";
      case "knockId":
        return (caseItem.knockRecordIds ?? []).map((recordId) => getKnockById(recordId)?.knockId || recordId).join(", ");
      case "mantisId":
        return (caseItem.mantisRecordIds ?? []).map((recordId) => getMantisById(recordId)?.mantisId || recordId).join(", ");
      default:
        return caseItem[key] || "";
    }
  };

  const getCaseVerticals = (caseItem: CaseRecord) => {
    const linkedAccountVerticals = (caseItem.accountIds ?? [])
      .map((accountId) => getAccountById(accountId)?.vertical)
      .filter(isPresent);
    const projectAccountId = getProjectById(caseItem.project)?.accountId;
    const projectVertical = projectAccountId ? getAccountById(projectAccountId)?.vertical : null;

    return uniqueNonEmptyValues([...linkedAccountVerticals, projectVertical].filter(isPresent));
  };

  const handleStatusFiltersChange = (nextFilters: string[]) => {
    setStatusFilters(nextFilters);
    setCaseFilterMatchMode("all");
  };

  const handlePriorityFiltersChange = (nextFilters: string[]) => {
    setPriorityFilters(nextFilters);
    setCaseFilterMatchMode("all");
  };

  const hasActiveCaseFilters =
    statusFilters.length > 0 ||
    priorityFilters.length > 0 ||
    verticalFilters.length > 0 ||
    productFilters.length > 0 ||
    peopleFilters.length > 0 ||
    watcherFilters.length > 0 ||
    daysToCloseFilter !== null ||
    Object.values(searchFilters).some((value) => value.trim() !== "");

  const handleClearCaseFilters = () => {
    setStatusFilters([]);
    setPriorityFilters([]);
    setVerticalFilters([]);
    setProductFilters([]);
    setPeopleFilters([]);
    setWatcherFilters([]);
    setDaysToCloseFilter(null);
    setCaseFilterMatchMode("all");
    setSearchFilters(DEFAULT_CASE_SEARCH_FILTERS);
  };

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const filteredCases = cases.filter((caseItem) => {
    const hasStatusFilters = statusFilters.length > 0;
    const hasPriorityFilters = priorityFilters.length > 0;
    const hasVerticalFilters = verticalFilters.length > 0;
    const hasProductFilters = productFilters.length > 0;
    const matchesStatusFilters = hasStatusFilters && statusFilters.includes(caseItem.status || "");
    const matchesPriorityFilters = hasPriorityFilters && priorityFilters.includes(caseItem.priority || "");
    const matchesVerticalFilters = hasVerticalFilters && getCaseVerticals(caseItem).some((vertical) => verticalFilters.includes(vertical));
    const matchesProductFilters = hasProductFilters && (caseItem.productIds ?? []).some((productId) => productFilters.includes(productId));
    const normalizedPeopleFilters = peopleFilters.map((person) => person.trim().toLowerCase()).filter(Boolean);
    const normalizedWatcherFilters = watcherFilters.map((watcher) => watcher.trim().toLowerCase()).filter(Boolean);

    if (caseFilterMatchMode === "any" && (hasStatusFilters || hasPriorityFilters)) {
      if (!matchesStatusFilters && !matchesPriorityFilters) return false;
    } else {
      if (hasStatusFilters && !matchesStatusFilters) return false;
      if (hasPriorityFilters && !matchesPriorityFilters) return false;
    }

    if (hasVerticalFilters && !matchesVerticalFilters) return false;
    if (hasProductFilters && !matchesProductFilters) return false;

    if (normalizedPeopleFilters.length > 0) {
      const casePeople = [caseItem.assignedTo, caseItem.seOwner, ...(caseItem.watcherNames ?? [])]
        .map((person) => (person ?? "").trim().toLowerCase())
        .filter(Boolean);
      if (!casePeople.some((person) => normalizedPeopleFilters.includes(person))) return false;
    }

    if (normalizedWatcherFilters.length > 0) {
      const caseWatchers = (caseItem.watcherNames ?? [])
        .map((watcher) => watcher.trim().toLowerCase())
        .filter(Boolean);
      if (!caseWatchers.some((watcher) => normalizedWatcherFilters.includes(watcher))) return false;
    }
    
    if (daysToCloseFilter !== null) {
      if (!caseItem.closeDate) return false;
      const daysDiff = (new Date(caseItem.closeDate).getTime() - Date.now()) / (1000 * 3600 * 24);
      if (daysDiff < 0 || daysDiff > daysToCloseFilter) return false;
    }

    const mantisMatches = (caseItem.mantisRecordIds ?? []).map(getMantisById).filter(isPresent);
    const knockMatches = (caseItem.knockRecordIds ?? []).map(getKnockById).filter(isPresent);

    if (normalizedSearchTerm) {
      const values = [
        ...CASE_TABLE_COLUMNS.map((column) => getCaseValue(caseItem, column.key)),
        ...mantisMatches.flatMap((record) => [record.description, record.mantisId]),
        ...knockMatches.flatMap((record) => [record.description, record.knockId]),
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

      const saved = await updateCase(editedCase.recordId, {
        accountIds: uniqueNonEmptyValues(editedCase.accountIds ?? []),
        project: editedCase.project,
        category: editedCase.category,
        escalationType: editedCase.escalationType,
        escalationNote: editedCase.escalationNote,
        productIds: uniqueNonEmptyValues(editedCase.productIds ?? []),
        closeDate: editedCase.closeDate,
        description: editedCase.description,
        seOwner: editedCase.seOwner,
        assignedTo: editedCase.assignedTo,
        priority: editedCase.priority,
        status: editedCase.status,
        knockRecordIds: uniqueNonEmptyValues(nextKnockIds),
        mantisRecordIds: uniqueNonEmptyValues(nextMantisIds),
      });

      upsertCase(saved);
      applySavedRecord(saved);

      await refreshCaseLinks(saved.recordId);
      await refreshSelectedCase(saved.recordId);
      showToast("Changes saved successfully!", "success");
    } catch (error) {
      console.error("Failed to save case:", error);
      showToast("Failed to save changes. Please try again.", "error");
    }
  };

  const canDeleteRecords = user?.role === "manager" || user?.role === "admin";

  const handleDelete = async () => {
    if (!selectedCase) return;
    const confirmed = window.confirm(`Delete case "${selectedCase.recordId}"? Linked records will be detached.`);
    if (!confirmed) return;

    try {
      await deleteCase(selectedCase.recordId);
      removeBookmark(selectedCase.recordId, "case");
      removeCase(selectedCase.recordId);
      setSelectedCase(null);
      await refreshRecords();
      showToast("Case deleted.", "success");
      navigate("/cases");
    } catch (error) {
      console.error("Failed to delete case:", error);
      showToast(error instanceof Error ? error.message : "Failed to delete case.", "error");
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

  const applyWatcherUpdate = (updatedCase: CaseRecord) => {
    upsertCase(updatedCase);
    setSelectedCase(updatedCase);
    if (editedCase?.recordId === updatedCase.recordId) {
      setEditedCase({ ...editedCase, watcherNames: updatedCase.watcherNames });
    }
  };

  const handleAddWatcher = async () => {
    if (!selectedCase || !watcherDraftUserId) return;

    const watcherUser = activeAssignableUsers.find((assignableUser) => String(assignableUser.id) === watcherDraftUserId);
    if (!watcherUser) return;

    setIsUpdatingWatchers(true);
    try {
      const updated = await addCaseWatcher(selectedCase.recordId, { userId: watcherUser.id });
      applyWatcherUpdate(updated);
      setWatcherDraftUserId("");
      showToast("Watchlist updated.", "success");
    } catch (error) {
      console.error("Failed to update watchlist:", error);
      showToast("Failed to update watchlist.", "error");
    } finally {
      setIsUpdatingWatchers(false);
    }
  };

  const handleToggleMyWatcher = async () => {
    if (!selectedCase || !user?.displayName) return;

    setIsUpdatingWatchers(true);
    try {
      const updated = isCurrentUserWatching
        ? await removeCaseWatcher(selectedCase.recordId, user.displayName)
        : await addCaseWatcher(selectedCase.recordId, { userId: user.id, displayName: user.displayName });
      applyWatcherUpdate(updated);
      showToast("Watchlist updated.", "success");
    } catch (error) {
      console.error("Failed to update watchlist:", error);
      showToast("Failed to update watchlist.", "error");
    } finally {
      setIsUpdatingWatchers(false);
    }
  };

  const handleRemoveWatcher = async (displayName: string) => {
    if (!selectedCase) return;

    setIsUpdatingWatchers(true);
    try {
      const updated = await removeCaseWatcher(selectedCase.recordId, displayName);
      applyWatcherUpdate(updated);
      showToast("Watchlist updated.", "success");
    } catch (error) {
      console.error("Failed to update watchlist:", error);
      showToast("Failed to update watchlist.", "error");
    } finally {
      setIsUpdatingWatchers(false);
    }
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

    const targetIdentifier = entityType === "mantis"
      ? mantisRecords.find((item) => item.recordId === targetRecordId)?.mantisId || targetRecordId
      : entityType === "knock"
        ? knocks.find((item) => item.recordId === targetRecordId)?.knockId || targetRecordId
        : targetRecordId;

    navigate(createDetailPath(entityType, targetIdentifier), {
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
      case "product":
      case "knockId":
      case "mantisId":
        return <td key={column.key} className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{textValue(getCaseValue(caseItem, column.key))}</td>;
      case "project":
        return <td key={column.key} className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{textValue(getProjectById(caseItem.project)?.projectName || caseItem.project)}</td>;
      case "assignedTo":
      case "seOwner":
        return (
          <td key={column.key} className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
            <AssignedToBadge value={caseItem[column.key]} />
          </td>
        );
      default:
        return <td key={column.key} className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{textValue(getCaseValue(caseItem, column.key))}</td>;
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
        <div data-guide-id="cases-intro">
          <h1 className="text-2xl font-bold text-gray-900">Cases</h1>
          <p className="mt-1 text-gray-600">Manage and track all customer cases</p>
        </div>
        <PageGuide label="Cases" steps={caseGuideSteps} />
      </div>

      <div className={`rounded-xl border border-gray-200 bg-white shadow-sm ${selectedCase ? "hidden" : ""}`}>
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div data-guide-id="cases-filters" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <div className="w-full sm:w-44">
              <MultiRecordDropdown
                label="status"
                values={statusFilters}
                options={statusFilterOptions}
                emptyLabel="All Status"
                searchPlaceholder="Search statuses"
                onChange={handleStatusFiltersChange}
              />
            </div>

            <div className="w-full sm:w-44">
              <MultiRecordDropdown
                label="priority"
                values={priorityFilters}
                options={priorityFilterOptions}
                emptyLabel="All Priority"
                searchPlaceholder="Search priorities"
                sortByLabel={false}
                onChange={handlePriorityFiltersChange}
              />
            </div>

            <div className="w-full sm:w-44">
              <MultiRecordDropdown
                label="vertical"
                values={verticalFilters}
                options={verticalFilterOptions}
                emptyLabel="All Verticals"
                searchPlaceholder="Search verticals"
                onChange={setVerticalFilters}
              />
            </div>

            <div className="w-full sm:w-52">
              <MultiRecordDropdown
                label="product"
                values={productFilters}
                options={productFilterOptions}
                emptyLabel="All Products"
                searchPlaceholder="Search products"
                onChange={setProductFilters}
              />
            </div>

            <button
              type="button"
              onClick={handleClearCaseFilters}
              disabled={!hasActiveCaseFilters}
              title="Clear filters"
              aria-label="Clear case filters"
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              <span>Clear</span>
            </button>
          </div>

          <div data-guide-id="cases-actions" className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
            <CreateEntityDialog entityType="case" onCreated={(caseRecord) => navigate(createDetailPath("case", caseRecord.recordId))} />
            <TableFieldSelector
              columns={CASE_TABLE_COLUMNS}
              visibleKeys={visibleCaseColumnKeys}
              onToggle={handleToggleCaseColumn}
              onReset={handleResetCaseColumns}
            />
          </div>
        </div>

        <div data-guide-id="cases-table" className="overflow-x-auto">
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
                  onClick={() => navigate(createDetailPath("case", caseItem.recordId))}
                  className={unreadRowClassName(isRecordUnread("case", caseItem.recordId, getRecordActivityTimestamp(caseItem)))}
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
        <div data-guide-id="cases-detail" className="rounded-xl border border-gray-200 bg-white shadow-sm">
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
                {canDeleteRecords && isEditing ? (
                  <button
                    onClick={() => void handleDelete()}
                    className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-[#B5122B] transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                ) : null}
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
                <div className="order-1 sm:col-span-2 rounded-xl border border-orange-200 bg-orange-50 p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      <SearchableSelect
                        label="assignee"
                        value={editedCase.assignedTo || ""}
                        options={managerSelectOptions}
                        emptyLabel="Unassigned"
                        searchPlaceholder="Search managers"
                        onChange={(assignedTo) => setEditedCase({ ...editedCase, assignedTo })}
                      />
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
                    <SearchableSelect
                      label="SE owner"
                      value={editedCase.seOwner || ""}
                      options={seOwnerSelectOptions}
                      emptyLabel="No SE owner"
                      searchPlaceholder="Search users"
                      onChange={(seOwner) => setEditedCase({ ...editedCase, seOwner })}
                    />
                  ) : (
                    <AssignedToBadge value={selectedCase.seOwner} />
                  )}
                </div>
                <div className="order-5 detail-cell">
                  <label className="mb-1 block text-sm font-medium text-gray-600">Accounts</label>
                  {isEditing && editedCase ? (
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <MultiRecordDropdown
                          label="accounts"
                          values={editedCase.accountIds ?? []}
                          options={accounts.map((item) => ({
                            value: item.recordId,
                            label: item.accountName,
                            description: [item.type, item.vertical].filter(Boolean).join(" | "),
                          }))}
                          emptyLabel="No linked accounts"
                          searchPlaceholder="Search accounts"
                          onChange={(accountIds) => setEditedCase({ ...editedCase, accountIds })}
                        />
                      </div>
                      <CreateEntityDialog
                        entityType="account"
                        triggerLabel="New"
                        triggerTitle="Create account"
                        hideLinkedCaseSelect
                        className={RELATED_CREATE_BUTTON_CLASS}
                        onCreated={(created) => {
                          setEditedCase((current) => current ? {
                            ...current,
                            accountIds: (current.accountIds ?? []).includes(created.recordId)
                              ? current.accountIds
                              : [...(current.accountIds ?? []), created.recordId],
                          } : current);
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-gray-900">
                      {textValue(linkedAccounts.map((item) => item.accountName).filter(Boolean).join(", "))}
                    </p>
                  )}
                </div>
                <div className="order-6 detail-cell">
                  <label className="mb-1 block text-sm font-medium text-gray-600">Products</label>
                  {isEditing && editedCase ? (
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <MultiRecordDropdown
                          label="products"
                          values={editedCase.productIds ?? []}
                          options={products.map((item) => ({
                            value: item.recordId,
                            label: item.productName,
                            description: [item.productFamily, item.productVersion ? `Version ${item.productVersion}` : null].filter(Boolean).join(" | "),
                          }))}
                          emptyLabel="No linked products"
                          searchPlaceholder="Search products"
                          onChange={(productIds) => setEditedCase({ ...editedCase, productIds })}
                        />
                      </div>
                      <CreateEntityDialog
                        entityType="product"
                        triggerLabel="New"
                        triggerTitle="Create product"
                        hideLinkedCaseSelect
                        className={RELATED_CREATE_BUTTON_CLASS}
                        onCreated={(created) => {
                          setEditedCase((current) => current ? {
                            ...current,
                            productIds: (current.productIds ?? []).includes(created.recordId)
                              ? current.productIds
                              : [...(current.productIds ?? []), created.recordId],
                          } : current);
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-gray-900">
                      {textValue(linkedProducts.map((item) => item.productName).filter(Boolean).join(", "))}
                    </p>
                  )}
                </div>
                <div className="order-7 detail-cell">
                  <label className="mb-1 block text-sm font-medium text-gray-600">Project</label>
                  {isEditing && editedCase ? (
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <SearchableSelect
                          label="project"
                          value={editedCase.project || ""}
                          options={projects.map((item) => ({
                            value: item.recordId,
                            label: item.projectName,
                            description: [getAccountById(item.accountId)?.accountName, item.stage].filter(Boolean).join(" | "),
                          }))}
                          emptyLabel="No project"
                          searchPlaceholder="Search projects"
                          onChange={(project) => setEditedCase({ ...editedCase, project })}
                        />
                      </div>
                      <CreateEntityDialog
                        entityType="project"
                        triggerLabel="New"
                        triggerTitle="Create project"
                        initialValues={(editedCase.accountIds ?? []).length === 1 ? { accountId: editedCase.accountIds[0] } : undefined}
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
                        <MultiRecordDropdown
                          label="Knock IDs"
                          values={editedKnockIds}
                          options={knocks.map((item) => ({
                            value: item.recordId,
                            label: item.knockId || "No Knock ID",
                            description: [item.status, item.description].filter(Boolean).join(" | "),
                          }))}
                          searchPlaceholder="Search Knock ID, status, or description"
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
                    <p className="text-gray-900">{textValue(linkedKnocks.map((item) => item.knockId).filter(Boolean).join(", "))}</p>
                  )}
                </div>
                <div className="order-9 detail-cell">
                  <label className="mb-1 block text-sm font-medium text-gray-600">Mantis IDs</label>
                  {isEditing && editedCase ? (
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <MultiRecordDropdown
                          label="Mantis IDs"
                          values={editedMantisIds}
                          options={mantisRecords.map((item) => ({
                            value: item.recordId,
                            label: item.mantisId || "No Mantis ID",
                            description: [item.mantisStatus, item.description].filter(Boolean).join(" | "),
                          }))}
                          searchPlaceholder="Search Mantis ID, status, or description"
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
                    <p className="text-gray-900">{textValue(linkedMantis.map((item) => item.mantisId).filter(Boolean).join(", "))}</p>
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
                <div className="order-[14] detail-cell sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-600">Description</label>
                  {isEditing && editedCase ? (
                    <TypeaheadTextarea
                      value={editedCase.description}
                      onChange={(description) => setEditedCase({ ...editedCase, description })}
                      options={caseDescriptionSuggestions}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      rows={3}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-gray-900">{selectedCase.description}</p>
                  )}
                </div>
                <div className="order-[15] detail-cell sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-600">Escalation Note</label>
                  {isEditing && editedCase ? (
                    <TypeaheadTextarea
                      value={editedCase.escalationNote || ""}
                      onChange={(escalationNote) => setEditedCase({ ...editedCase, escalationNote })}
                      options={caseEscalationNoteSuggestions}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      rows={2}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-gray-900">{textValue(selectedCase.escalationNote)}</p>
                  )}
                </div>
              </div>

              <div className={activeDetailTab.startsWith("linked") ? "pt-1" : "hidden"}>
                <h3 className="mb-4 text-lg font-semibold text-gray-900">
                  {CASE_DETAIL_TABS.find((tab) => tab.key === activeDetailTab)?.label}
                </h3>
                {activeDetailTab.startsWith("linked") && activeDetailTab !== "linkedProjects" && (
                  <p className="mb-4 text-sm text-gray-500">
                    Add multiple links here. The case editor above stays synced to the same linked records.
                  </p>
                )}
                <div className="space-y-4">
                  {activeDetailTab === "linkedAccounts" && (
                  <>
                  <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <SearchableSelect
                        label="account"
                        value={linkDrafts.account}
                        options={availableAccountsForLink.map((item) => ({
                          value: item.recordId,
                          label: item.accountName,
                          description: [item.type, item.vertical].filter(Boolean).join(" | "),
                        }))}
                        emptyLabel="Select account"
                        searchPlaceholder="Search accounts"
                        onChange={(account) => setLinkDrafts((prev) => ({ ...prev, account }))}
                      />
                    </div>
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
                    <div className="min-w-0 flex-1">
                      <SearchableSelect
                        label="product"
                        value={linkDrafts.product}
                        options={availableProductsForLink.map((item) => ({
                          value: item.recordId,
                          label: item.productName,
                          description: [item.productFamily, item.productVersion ? `Version ${item.productVersion}` : null].filter(Boolean).join(" | "),
                        }))}
                        emptyLabel="Select product"
                        searchPlaceholder="Search products"
                        onChange={(product) => setLinkDrafts((prev) => ({ ...prev, product }))}
                      />
                    </div>
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
                      { label: "Version", key: "productVersion" },
                    ]}
                    onEntityClick={(recordId) => navigateToLinkedEntity("product", recordId)}
                    onRemoveEntity={(recordId) => void handleUnlinkEntity("product", recordId)}
                  />
                  </>
                  )}

                  {activeDetailTab === "linkedProjects" && (
                  <>
                  <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <SearchableSelect
                        label="project"
                        value={linkDrafts.project}
                        options={availableProjectsForLink.map((item) => ({
                          value: item.recordId,
                          label: item.projectName,
                          description: [getAccountById(item.accountId)?.accountName, item.stage].filter(Boolean).join(" | "),
                        }))}
                        emptyLabel="Select project"
                        searchPlaceholder="Search projects"
                        onChange={(project) => setLinkDrafts((prev) => ({ ...prev, project }))}
                      />
                    </div>
                    <CreateEntityDialog
                      entityType="project"
                      triggerLabel="New"
                      triggerTitle="Create project"
                      initialValues={{
                        accountId: (selectedCase.accountIds ?? []).length === 1 ? selectedCase.accountIds[0] : "",
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
                      <MultiRecordDropdown
                        label="Mantis records"
                        values={linkDrafts.mantis}
                        options={availableMantisForLink.map((item) => ({
                          value: item.recordId,
                          label: item.mantisId || item.description,
                          description: [item.mantisStatus, item.description].filter(Boolean).join(" | "),
                        }))}
                        searchPlaceholder="Search Mantis ID, status, or description"
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
                      <MultiRecordDropdown
                        label="Knock records"
                        values={linkDrafts.knock}
                        options={availableKnocksForLink.map((item) => ({
                          value: item.recordId,
                          label: item.knockId || item.description,
                          description: [item.status, item.description].filter(Boolean).join(" | "),
                        }))}
                        searchPlaceholder="Search Knock ID, status, or description"
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
                <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-900">Watchlist</h3>
                    <button
                      type="button"
                      onClick={() => void handleToggleMyWatcher()}
                      disabled={isUpdatingWatchers || !user?.displayName}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        isCurrentUserWatching
                          ? "bg-red-50 text-[#B5122B] hover:bg-red-100"
                          : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {isCurrentUserWatching ? "Remove me" : "Add me"}
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedWatcherNames.length > 0 ? (
                      selectedWatcherNames.map((watcherName) => {
                        const canRemoveWatcher = normalizePersonKey(watcherName) === normalizePersonKey(user?.displayName);
                        return (
                        <span
                          key={watcherName}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200"
                          title={watcherName}
                        >
                          <span className="truncate">{watcherName}</span>
                          {canRemoveWatcher ? (
                          <button
                            type="button"
                            onClick={() => void handleRemoveWatcher(watcherName)}
                            disabled={isUpdatingWatchers}
                            className="rounded-full text-gray-400 transition-colors hover:text-[#B5122B] disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`Remove ${watcherName} from watchlist`}
                            title={`Remove ${watcherName}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          ) : null}
                        </span>
                      );
                    })
                    ) : (
                      <span className="text-sm text-gray-500">No watchers</span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <div className="min-w-0 flex-1">
                      <SearchableSelect
                        label="watcher"
                        value={watcherDraftUserId}
                        options={availableWatcherSelectOptions}
                        emptyLabel="Select watcher"
                        searchPlaceholder="Search users"
                        noOptionsLabel="No additional users"
                        onChange={setWatcherDraftUserId}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleAddWatcher()}
                      disabled={isUpdatingWatchers || !watcherDraftUserId}
                      className="inline-flex min-h-[42px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#E31937] px-3 text-sm font-medium text-white transition-colors hover:bg-[#c41230] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <UserPlus className="h-4 w-4" />
                      Add
                    </button>
                  </div>
                </div>

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
