import { useState, useEffect } from "react";
import { ChevronDown, ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown, Edit2, Save, Bookmark, UserRound } from "lucide-react";
import { cases, accounts, products, projects, nfrs, knocks, getAccountById, getProductById, getProjectById, getNfrById, getNfrByMantisId, getKnockById, getKnockByKnockId, getCaseById, updateCase, getCase, getCaseLinks, addCaseLink, removeCaseLink, listAssignableUsers, type AssignableUser, type CaseLinkEntityType, type CaseLinksResponse, type HistoryEntry } from "../data/apiClient";
import { LinkedEntityList } from "../components/LinkedEntityCard";
import { RecordHistoryTimeline, formatHistoryEntryText } from "../components/RecordHistoryTimeline";
import { TableFieldSelector } from "../components/TableFieldSelector";
import { useLocation, useNavigate } from "react-router";
import { useSearch } from "../context/SearchContext";
import { useBookmarks } from "../context/BookmarksContext";
import { useToast } from "../context/ToastContext";
import { casePriorityColors, caseStatusColors } from "../data/recordStyles";
import { compareValues, getNextSortConfig, toggleColumnKey, useStoredColumnKeys, type SortConfig } from "../hooks/useTableColumns";

type LinkDrafts = {
  account: string;
  product: string;
  project: string;
  nfr: string;
  knock: string;
};

type LinkKey = keyof LinkDrafts;

type CaseColumnKey = "recordId" | "description" | "status" | "priority" | "account" | "product" | "caseOwner" | "assignedTo" | "updatedAt";
type CaseSearchKey = "recordId" | "description" | "account" | "product" | "caseOwner" | "assignedTo";

type CaseTableColumn = {
  key: CaseColumnKey;
  label: string;
  sortKey: CaseColumnKey;
  searchKey?: CaseSearchKey;
};

const CASE_TABLE_COLUMNS: CaseTableColumn[] = [
  { key: "recordId", label: "Record ID", sortKey: "recordId", searchKey: "recordId" },
  { key: "description", label: "Description", sortKey: "description", searchKey: "description" },
  { key: "status", label: "Status", sortKey: "status" },
  { key: "priority", label: "Priority", sortKey: "priority" },
  { key: "account", label: "Account", sortKey: "account", searchKey: "account" },
  { key: "product", label: "Product", sortKey: "product", searchKey: "product" },
  { key: "caseOwner", label: "SC Owner", sortKey: "caseOwner", searchKey: "caseOwner" },
  { key: "assignedTo", label: "Assigned To", sortKey: "assignedTo", searchKey: "assignedTo" },
  { key: "updatedAt", label: "Updated", sortKey: "updatedAt" },
];

const DEFAULT_CASE_COLUMN_KEYS = CASE_TABLE_COLUMNS.map((column) => column.key);
const CASE_COLUMN_STORAGE_KEY = "cases.visibleTableColumns.v2";

function assigneeLabel(user: AssignableUser) {
  return `${user.displayName} (${user.email})${user.isActive ? "" : " - inactive"}`;
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

export function Cases() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { searchTerm } = useSearch();
  const { addBookmark, removeBookmark, isBookmarked } = useBookmarks();
  const [selectedCase, setSelectedCase] = useState<typeof cases[0] | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCase, setEditedCase] = useState<typeof cases[0] | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [priorityFilter, setPriorityFilter] = useState<string>("All");
  const [newComment, setNewComment] = useState("");
  const [selectedQuote, setSelectedQuote] = useState<HistoryEntry | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<"details" | "linked">("details");
  const [isUpdatingLinks, setIsUpdatingLinks] = useState(false);
  const [visibleCaseColumnKeys, setVisibleCaseColumnKeys] = useStoredColumnKeys<CaseColumnKey>(CASE_COLUMN_STORAGE_KEY, DEFAULT_CASE_COLUMN_KEYS);
  const [caseLinks, setCaseLinks] = useState<CaseLinksResponse | null>(null);
  const [linkDrafts, setLinkDrafts] = useState<LinkDrafts>({
    account: "",
    product: "",
    project: "",
    nfr: "",
    knock: "",
  });

  type LinkedReturnState = {
    returnTo?: {
      path: string;
      eventName: string;
      recordId: string;
    };
    previousState?: LinkedReturnState | null;
  };

  const [searchFilters, setSearchFilters] = useState({
    recordId: "",
    moduleId: "",
    description: "",
    account: "",
    product: "",
    caseOwner: "",
    assignedTo: "",
    seOwner: "",
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
    const handleOpenDetail = (event: Event) => {
      const caseId = (event as CustomEvent<string>).detail;
      const caseData = getCaseById(caseId);
      if (caseData) {
        setSelectedCase(caseData);
        setActiveDetailTab("details");
      }
    };

    window.addEventListener('openCaseDetail', handleOpenDetail as EventListener);
    return () => window.removeEventListener('openCaseDetail', handleOpenDetail as EventListener);
  }, []);

  useEffect(() => {
    if (!selectedCase) {
      setCaseLinks(null);
      setLinkDrafts({
        account: "",
        product: "",
        project: "",
        nfr: "",
        knock: "",
      });
      return;
    }

    setLinkDrafts({
      account: "",
      product: "",
      project: "",
      nfr: "",
      knock: "",
    });

    void (async () => {
      try {
        const links = await getCaseLinks(selectedCase.recordId);
        setCaseLinks(links);
      } catch (error) {
        console.error("Failed to load case links:", error);
        setCaseLinks(null);
      }
    })();
  }, [selectedCase]);

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

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const filteredCases = cases.filter((c) => {
    if (statusFilter !== "All" && c.status !== statusFilter) return false;
    if (priorityFilter !== "All" && c.priority !== priorityFilter) return false;

    if (normalizedSearchTerm) {
      const account = getAccountById(c.account);
      const product = getProductById(c.product);
      const project = getProjectById(c.project);
      const nfr = c.mantisId ? getNfrByMantisId(c.mantisId) : null;
      const knock = c.knockId ? getKnockByKnockId(c.knockId) : null;

      const matchesGlobalSearch = [
        c.recordId,
        c.moduleId,
        c.description,
        c.status,
        c.priority,
        c.category,
        c.caseOwner,
        c.assignedTo,
        c.seOwner,
        account?.accountName,
        product?.productName,
        project?.projectName,
        nfr?.description,
        nfr?.mantisId,
        knock?.description,
        knock?.knockId,
      ].some((value) => (value ?? "").toLowerCase().includes(normalizedSearchTerm));

      if (!matchesGlobalSearch) return false;
    }

    if (searchFilters.recordId && !c.recordId.toLowerCase().includes(searchFilters.recordId.toLowerCase())) return false;
    if (searchFilters.moduleId && !c.moduleId.toLowerCase().includes(searchFilters.moduleId.toLowerCase())) return false;
    if (searchFilters.description && !c.description.toLowerCase().includes(searchFilters.description.toLowerCase())) return false;
    if (searchFilters.account) {
      const account = getAccountById(c.account);
      if (!account?.accountName.toLowerCase().includes(searchFilters.account.toLowerCase())) return false;
    }
    if (searchFilters.product) {
      const product = getProductById(c.product);
      if (!product?.productName.toLowerCase().includes(searchFilters.product.toLowerCase())) return false;
    }
    if (searchFilters.caseOwner && !(c.caseOwner ?? "").toLowerCase().includes(searchFilters.caseOwner.toLowerCase())) return false;
    if (searchFilters.assignedTo && !(c.assignedTo ?? "").toLowerCase().includes(searchFilters.assignedTo.toLowerCase())) return false;
    if (searchFilters.seOwner && !(c.seOwner ?? "").toLowerCase().includes(searchFilters.seOwner.toLowerCase())) return false;

    return true;
  });

  const sortedCases = [...filteredCases].sort((a, b) => {
    if (!sortConfig.direction || !sortConfig.key) return 0;

    let aValue: unknown = "";
    let bValue: unknown = "";

    switch (sortConfig.key) {
      case "account":
        aValue = getAccountById(a.account)?.accountName || "";
        bValue = getAccountById(b.account)?.accountName || "";
        break;
      case "product":
        aValue = getProductById(a.product)?.productName || "";
        bValue = getProductById(b.product)?.productName || "";
        break;
      case "project":
        aValue = getProjectById(a.project)?.projectName || "";
        bValue = getProjectById(b.project)?.projectName || "";
        break;
      default:
        aValue = a[sortConfig.key as keyof typeof a] || "";
        bValue = b[sortConfig.key as keyof typeof b] || "";
    }

    return compareValues(aValue, bValue, sortConfig.direction);
  });

  const handleRecordClick = (recordId: string) => {
    const caseData = getCaseById(recordId);
    if (caseData) {
      setSelectedCase(caseData);
      setActiveDetailTab("details");
      setIsEditing(false);
      setEditedCase(null);
    }
  };

  const handleEdit = () => {
    if (selectedCase) {
      setEditedCase({ ...selectedCase });
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    if (!editedCase) return;

    try {
      const saved = await updateCase(editedCase.recordId, {
        description: editedCase.description,
        previousStatus: editedCase.previousStatus,
        closeDate: editedCase.closeDate,
        status: editedCase.status,
        priority: editedCase.priority,
        category: editedCase.category,
        caseOwner: editedCase.caseOwner,
        assignedTo: editedCase.assignedTo,
        seOwner: editedCase.seOwner,
        product: editedCase.product,
        account: editedCase.account,
        project: editedCase.project,
        knockId: editedCase.knockId,
        mantisId: editedCase.mantisId,
        escalationNote: editedCase.escalationNote,
        escalationType: editedCase.escalationType,
        metaData: editedCase.metaData,
      });

      const index = cases.findIndex((c) => c.recordId === saved.recordId);
      if (index >= 0) {
        cases[index] = saved;
      }

      setSelectedCase(saved);
      setEditedCase(saved);
      setIsEditing(false);
      showToast("Changes saved successfully!", "success");
    } catch (error) {
      console.error("Failed to save case:", error);
      showToast("Failed to save changes. Please try again.", "error");
    }
  };

  const handleCancelEdit = () => {
    setEditedCase(null);
    setIsEditing(false);
  };

  const handleAddComment = () => {
    if (selectedCase && newComment.trim()) {
      const timestamp = new Date().toLocaleString("sv-SE", { hour12: false }).replace(",", "");
      const quoteText = selectedQuote
        ? `[Quoted reply to ${selectedQuote.user} (${selectedQuote.timestamp})]\n${formatHistoryEntryText(selectedQuote)}`
        : null;

      const newHistoryEntry = {
        timestamp,
        user: "Current User",
        action: "Comment",
        changes: quoteText ? `${quoteText}\n\n${newComment.trim()}` : newComment.trim(),
      };

      const updatedCase = {
        ...selectedCase,
        history: [...(selectedCase.history || []), newHistoryEntry],
      };

      setSelectedCase(updatedCase);
      setNewComment("");
      setSelectedQuote(null);
    }
  };

  const refreshSelectedCase = async (recordId: string) => {
    const refreshed = await getCase(recordId);
    const index = cases.findIndex((c) => c.recordId === refreshed.recordId);
    if (index >= 0) {
      cases[index] = refreshed;
    }
    setSelectedCase(refreshed);
    if (editedCase && editedCase.recordId === refreshed.recordId) {
      setEditedCase(refreshed);
    }
  };

  const refreshCaseLinks = async (recordId: string) => {
    const links = await getCaseLinks(recordId);
    setCaseLinks(links);
  };

  const handleLinkEntity = async (key: LinkKey) => {
    if (!selectedCase) return;

    setIsUpdatingLinks(true);

    try {
      const entityTypeMap: Record<LinkKey, CaseLinkEntityType> = {
        account: "account",
        product: "product",
        project: "project",
        nfr: "nfr",
        knock: "knock",
      };
      const entityRecordId = linkDrafts[key];
      if (!entityRecordId) {
        return;
      }

      await addCaseLink(selectedCase.recordId, entityTypeMap[key], entityRecordId);
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

  const navigateToLinkedEntity = (
    targetPath: string,
    targetEventName: string,
    targetRecordId: string,
  ) => {
    if (!selectedCase?.recordId) return;

    const state: LinkedReturnState = {
      returnTo: {
        path: '/cases',
        eventName: 'openCaseDetail',
        recordId: selectedCase.recordId,
      },
      previousState: (location.state as LinkedReturnState | null) ?? null,
    };

    navigate(targetPath, { state });
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent(targetEventName, { detail: targetRecordId }));
    }, 100);
  };

  const handleAccountClick = (accountId: string) => {
    navigateToLinkedEntity('/accounts', 'openAccountDetail', accountId);
  };

  const handleProductClick = (productId: string) => {
    navigateToLinkedEntity('/product', 'openProductDetail', productId);
  };

  const handleProjectClick = (projectId: string) => {
    navigateToLinkedEntity('/projects', 'openProjectDetail', projectId);
  };

  const handleNfrClick = (nfrId: string) => {
    navigateToLinkedEntity('/nfr', 'openNfrDetail', nfrId);
  };

  const handleKnockClick = (knockId: string) => {
    navigateToLinkedEntity('/knock', 'openKnockDetail', knockId);
  };

  const handleBackFromDetail = () => {
    const navState = (location.state as LinkedReturnState | null) ?? null;
    if (navState?.returnTo) {
      navigate(navState.returnTo.path, { state: navState.previousState ?? null });
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent(navState.returnTo!.eventName, { detail: navState.returnTo!.recordId }));
      }, 100);
      return;
    }

    setSelectedCase(null);
    setIsEditing(false);
    setEditedCase(null);
  };

  const account = selectedCase ? getAccountById(selectedCase.account) : null;
  const product = selectedCase ? getProductById(selectedCase.product) : null;
  const project = selectedCase ? getProjectById(selectedCase.project) : null;
  const nfr = selectedCase ? (getNfrById(selectedCase.nfrRecordId) ?? getNfrByMantisId(selectedCase.mantisId) ?? null) : null;
  const knock = selectedCase ? (getKnockById(selectedCase.knockRecordId) ?? getKnockByKnockId(selectedCase.knockId) ?? null) : null;

  const linkedAccounts = caseLinks?.accounts ?? (account ? [account] : []);
  const linkedProducts = caseLinks?.products ?? (product ? [product] : []);
  const linkedProjects = caseLinks?.projects ?? (project ? [project] : []);
  const linkedNfrs = caseLinks?.nfrs ?? (nfr ? [nfr] : []);
  const linkedKnocks = caseLinks?.knocks ?? (knock ? [knock] : []);
  const visibleCaseColumns = CASE_TABLE_COLUMNS.filter((column) => visibleCaseColumnKeys.includes(column.key));

  const renderSortIcon = (key: CaseColumnKey) => {
    if (sortConfig.key !== key || !sortConfig.direction) {
      return <ArrowUpDown className="w-4 h-4" />;
    }

    return sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />;
  };

  const renderColumnHeader = (column: CaseTableColumn) => (
    <th key={column.key} className="text-left px-6 py-3">
      <div className={`flex items-center gap-2 ${column.searchKey ? "mb-2" : ""}`}>
        <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">{column.label}</span>
        <button onClick={() => handleSort(column.sortKey)} className="text-gray-400 hover:text-gray-600">
          {renderSortIcon(column.sortKey)}
        </button>
      </div>
      {column.searchKey && (
        <input
          type="text"
          placeholder="Search..."
          value={searchFilters[column.searchKey]}
          onChange={(e) => setSearchFilters({ ...searchFilters, [column.searchKey!]: e.target.value })}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#E31937]"
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </th>
  );

  const renderColumnCell = (caseItem: typeof cases[0], column: CaseTableColumn) => {
    switch (column.key) {
      case "recordId":
        return <td key={column.key} className="px-6 py-4 text-sm font-medium text-[#E31937] whitespace-nowrap">{caseItem.recordId}</td>;
      case "description":
        return (
          <td key={column.key} className="px-6 py-4 text-sm text-gray-900 max-w-md truncate whitespace-nowrap" title={caseItem.description}>
            {caseItem.description}
          </td>
        );
      case "status":
        return (
          <td key={column.key} className="px-6 py-4">
            <span className={`inline-flex whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium ${caseStatusColors[caseItem.status]}`}>
              {caseItem.status}
            </span>
          </td>
        );
      case "priority":
        return (
          <td key={column.key} className="px-6 py-4">
            <span className={`inline-flex whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium ${casePriorityColors[caseItem.priority]}`}>
              {caseItem.priority}
            </span>
          </td>
        );
      case "account":
        return <td key={column.key} className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{getAccountById(caseItem.account)?.accountName || "—"}</td>;
      case "product":
        return <td key={column.key} className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{getProductById(caseItem.product)?.productName || "—"}</td>;
      case "caseOwner":
        return <td key={column.key} className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{caseItem.caseOwner || "—"}</td>;
      case "assignedTo":
        return (
          <td key={column.key} className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">
            <AssignedToBadge value={caseItem.assignedTo} />
          </td>
        );
      case "updatedAt":
        return <td key={column.key} className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{caseItem.updatedAt}</td>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cases</h1>
          <p className="text-gray-600 mt-1">Manage and track all customer cases</p>
        </div>
      </div>

      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${selectedCase ? "hidden" : ""}`}>
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white"
              >
                <option value="All">All Status</option>
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Escalated">Escalated</option>
                <option value="Closed">Closed</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="appearance-none px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white"
              >
                <option value="All">All Priority</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="text-sm text-gray-500">{visibleCaseColumns.length} of {CASE_TABLE_COLUMNS.length} fields shown</p>
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
                <th className="text-left px-4 py-3 w-12">
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
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isBookmarked(caseItem.recordId, 'case')) {
                          removeBookmark(caseItem.recordId, 'case');
                        } else {
                          addBookmark({
                            id: caseItem.recordId,
                            type: 'case',
                            title: caseItem.description,
                            subtitle: `${caseItem.status} - ${caseItem.priority}`,
                            timestamp: Date.now(),
                          });
                        }
                      }}
                      className="text-gray-400 hover:text-yellow-500 transition-colors"
                      title="Bookmark"
                    >
                      <Bookmark className={`w-5 h-5 ${isBookmarked(caseItem.recordId, 'case') ? 'fill-yellow-400 text-yellow-500' : ''}`} />
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="w-full">
            <div className="sticky top-[-1.5rem] z-10 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Case Details</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (isBookmarked(selectedCase!.recordId, 'case')) {
                      removeBookmark(selectedCase!.recordId, 'case');
                    } else {
                      addBookmark({
                        id: selectedCase!.recordId,
                        type: 'case',
                        title: selectedCase!.description,
                        subtitle: `${selectedCase!.status} - ${selectedCase!.priority}`,
                        timestamp: Date.now(),
                      });
                    }
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    isBookmarked(selectedCase!.recordId, 'case')
                      ? 'bg-yellow-100 text-yellow-600'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Bookmark this case"
                >
                  <Bookmark className={`w-5 h-5 ${isBookmarked(selectedCase!.recordId, 'case') ? 'fill-current' : ''}`} />
                </button>
                {!isEditing ? (
                  <button
                    onClick={handleEdit}
                    className="flex items-center gap-2 px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleCancelEdit}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      className="flex items-center gap-2 px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      Save
                    </button>
                  </>
                )}
                <button
                  onClick={handleBackFromDetail}
                  className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 space-y-6">
              <div className="border-b border-gray-200 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveDetailTab("details")}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      activeDetailTab === "details"
                        ? "bg-[#E31937] text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    Details
                  </button>
                  <button
                    onClick={() => setActiveDetailTab("linked")}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      activeDetailTab === "linked"
                        ? "bg-[#E31937] text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    Linked Entities
                  </button>
                </div>
              </div>

              <div className={activeDetailTab === "details" ? "grid grid-cols-2 gap-4" : "hidden"}>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Record ID</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.recordId}
                      onChange={(e) => setEditedCase({ ...editedCase, recordId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.recordId}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Module ID</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.moduleId}
                      onChange={(e) => setEditedCase({ ...editedCase, moduleId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.moduleId}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Record Revision</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.recordRevision}
                      onChange={(e) => setEditedCase({ ...editedCase, recordRevision: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.recordRevision}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Owned By</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.ownedBy}
                      onChange={(e) => setEditedCase({ ...editedCase, ownedBy: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.ownedBy}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Created At</label>
                  {isEditing && editedCase ? (
                    <input
                      type="date"
                      value={editedCase.createdAt}
                      onChange={(e) => setEditedCase({ ...editedCase, createdAt: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.createdAt}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Created By</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.createdBy}
                      onChange={(e) => setEditedCase({ ...editedCase, createdBy: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.createdBy}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Updated At</label>
                  {isEditing && editedCase ? (
                    <input
                      type="date"
                      value={editedCase.updatedAt}
                      onChange={(e) => setEditedCase({ ...editedCase, updatedAt: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.updatedAt}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Updated By</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.updatedBy}
                      onChange={(e) => setEditedCase({ ...editedCase, updatedBy: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.updatedBy}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Meta Data</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.metaData}
                      onChange={(e) => setEditedCase({ ...editedCase, metaData: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.metaData}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
                  {isEditing && editedCase ? (
                    <textarea
                      value={editedCase.description}
                      onChange={(e) => setEditedCase({ ...editedCase, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      rows={3}
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.description}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
                  {isEditing && editedCase ? (
                    <select
                      value={editedCase.status}
                      onChange={(e) => setEditedCase({ ...editedCase, status: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="Open">Open</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Escalated">Escalated</option>
                      <option value="Closed">Closed</option>
                    </select>
                  ) : (
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${caseStatusColors[selectedCase.status]}`}>
                      {selectedCase.status}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Previous Status</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.previousStatus || ""}
                      onChange={(e) => setEditedCase({ ...editedCase, previousStatus: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.previousStatus || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Priority</label>
                  {isEditing && editedCase ? (
                    <select
                      value={editedCase.priority}
                      onChange={(e) => setEditedCase({ ...editedCase, priority: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </select>
                  ) : (
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${casePriorityColors[selectedCase.priority]}`}>
                      {selectedCase.priority}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Category</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.category}
                      onChange={(e) => setEditedCase({ ...editedCase, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.category}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Close Date</label>
                  {isEditing && editedCase ? (
                    <input
                      type="date"
                      value={editedCase.closeDate || ""}
                      onChange={(e) => setEditedCase({ ...editedCase, closeDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.closeDate || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Case Owner</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.caseOwner || ""}
                      onChange={(e) => setEditedCase({ ...editedCase, caseOwner: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.caseOwner || "—"}</p>
                  )}
                </div>
                <div className="col-span-2 rounded-lg border-2 border-red-200 bg-red-50 p-3 shadow-sm">
                  <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#B5122B]">
                    <UserRound className="h-4 w-4" />
                    Assigned To
                  </label>
                  {isEditing && editedCase ? (
                    <select
                      value={editedCase.assignedTo || ""}
                      onChange={(e) => setEditedCase({ ...editedCase, assignedTo: e.target.value })}
                      className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
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
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">SE Owner</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.seOwner || ""}
                      onChange={(e) => setEditedCase({ ...editedCase, seOwner: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.seOwner || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Product</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.product}
                      onChange={(e) => setEditedCase({ ...editedCase, product: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{product?.productName || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Account</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.account}
                      onChange={(e) => setEditedCase({ ...editedCase, account: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{account?.accountName || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Project</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.project || ""}
                      onChange={(e) => setEditedCase({ ...editedCase, project: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{project?.projectName || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Knock ID</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.knockId || ""}
                      onChange={(e) => setEditedCase({ ...editedCase, knockId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.knockId || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Mantis ID</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.mantisId || ""}
                      onChange={(e) => setEditedCase({ ...editedCase, mantisId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.mantisId || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Escalation Type</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.escalationType || ""}
                      onChange={(e) => setEditedCase({ ...editedCase, escalationType: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.escalationType || "—"}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Escalation Note</label>
                  {isEditing && editedCase ? (
                    <textarea
                      value={editedCase.escalationNote || ""}
                      onChange={(e) => setEditedCase({ ...editedCase, escalationNote: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      rows={2}
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.escalationNote || "—"}</p>
                  )}
                </div>
              </div>

              <div className={activeDetailTab === "linked" ? "pt-1" : "hidden"}>
                <h3 className="font-semibold text-lg text-gray-900 mb-4">Linked Entities</h3>
                <div className="space-y-4">
                  <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col gap-2 md:flex-row md:items-center">
                    <select
                      value={linkDrafts.account}
                      onChange={(e) => setLinkDrafts((prev) => ({ ...prev, account: e.target.value }))}
                      className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">Select account</option>
                      {accounts.map((item) => (
                        <option key={item.recordId} value={item.recordId}>
                          {item.recordId} - {item.accountName}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void handleLinkEntity("account")}
                        disabled={isUpdatingLinks || !linkDrafts.account}
                        className="px-3 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-50"
                      >
                        Link Account
                      </button>
                    </div>
                  </div>
                  <LinkedEntityList
                    title="Account"
                    entities={linkedAccounts}
                    fields={[
                      { label: "ID", key: "recordId" },
                      { label: "Name", key: "accountName" },
                      { label: "Type", key: "type" },
                      { label: "Vertical", key: "vertical" },
                    ]}
                    onEntityClick={handleAccountClick}
                    onRemoveEntity={(recordId) => void handleUnlinkEntity("account", recordId)}
                  />

                  <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col gap-2 md:flex-row md:items-center">
                    <select
                      value={linkDrafts.product}
                      onChange={(e) => setLinkDrafts((prev) => ({ ...prev, product: e.target.value }))}
                      className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">Select product</option>
                      {products.map((item) => (
                        <option key={item.recordId} value={item.recordId}>
                          {item.recordId} - {item.productName}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void handleLinkEntity("product")}
                        disabled={isUpdatingLinks || !linkDrafts.product}
                        className="px-3 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-50"
                      >
                        Link Product
                      </button>
                    </div>
                  </div>
                  <LinkedEntityList
                    title="Product"
                    entities={linkedProducts}
                    fields={[
                      { label: "ID", key: "recordId" },
                      { label: "Name", key: "productName" },
                      { label: "Family", key: "productFamily" },
                    ]}
                    onEntityClick={handleProductClick}
                    onRemoveEntity={(recordId) => void handleUnlinkEntity("product", recordId)}
                  />

                  <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col gap-2 md:flex-row md:items-center">
                    <select
                      value={linkDrafts.project}
                      onChange={(e) => setLinkDrafts((prev) => ({ ...prev, project: e.target.value }))}
                      className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">Select project</option>
                      {projects.map((item) => (
                        <option key={item.recordId} value={item.recordId}>
                          {item.recordId} - {item.projectName}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void handleLinkEntity("project")}
                        disabled={isUpdatingLinks || !linkDrafts.project}
                        className="px-3 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-50"
                      >
                        Link Project
                      </button>
                    </div>
                  </div>
                  <LinkedEntityList
                    title="Project"
                    entities={linkedProjects}
                    fields={[
                      { label: "ID", key: "recordId" },
                      { label: "Name", key: "projectName" },
                      { label: "Stage", key: "stage" },
                      { label: "Value", key: "sfdcValue" },
                    ]}
                    onEntityClick={handleProjectClick}
                    onRemoveEntity={(recordId) => void handleUnlinkEntity("project", recordId)}
                  />

                  <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col gap-2 md:flex-row md:items-center">
                    <select
                      value={linkDrafts.nfr}
                      onChange={(e) => setLinkDrafts((prev) => ({ ...prev, nfr: e.target.value }))}
                      className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">Select NFR</option>
                      {nfrs.map((item) => (
                        <option key={item.recordId} value={item.recordId}>
                          {item.recordId} - {item.mantisId || "No Mantis ID"}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void handleLinkEntity("nfr")}
                        disabled={isUpdatingLinks || !linkDrafts.nfr}
                        className="px-3 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-50"
                      >
                        Link NFR
                      </button>
                    </div>
                  </div>
                  <LinkedEntityList
                    title="NFR"
                    entities={linkedNfrs}
                    fields={[
                      { label: "ID", key: "recordId" },
                      { label: "Mantis ID", key: "mantisId" },
                      { label: "Status", key: "nfrStatus" },
                      { label: "Target Date", key: "nfrTargetDate" },
                    ]}
                    onEntityClick={handleNfrClick}
                    onRemoveEntity={(recordId) => void handleUnlinkEntity("nfr", recordId)}
                  />

                  <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col gap-2 md:flex-row md:items-center">
                    <select
                      value={linkDrafts.knock}
                      onChange={(e) => setLinkDrafts((prev) => ({ ...prev, knock: e.target.value }))}
                      className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">Select Knock</option>
                      {knocks.map((item) => (
                        <option key={item.recordId} value={item.recordId}>
                          {item.recordId} - {item.knockId || "No Knock ID"}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void handleLinkEntity("knock")}
                        disabled={isUpdatingLinks || !linkDrafts.knock}
                        className="px-3 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-50"
                      >
                        Link Knock
                      </button>
                    </div>
                  </div>
                  <LinkedEntityList
                    title="Knock"
                    entities={linkedKnocks}
                    fields={[
                      { label: "ID", key: "recordId" },
                      { label: "Knock ID", key: "knockId" },
                      { label: "Status", key: "status" },
                      { label: "Target Date", key: "targetDate" },
                    ]}
                    onEntityClick={handleKnockClick}
                    onRemoveEntity={(recordId) => void handleUnlinkEntity("knock", recordId)}
                  />
                </div>
              </div>

              </div>

              <div className="xl:col-span-1">
                <div className="xl:sticky xl:top-24 border border-gray-200 rounded-lg bg-white p-4 max-h-[60vh] overflow-y-auto overflow-x-hidden">
              <div className="pt-0">
                <h3 className="font-semibold text-lg text-gray-900 mb-4">History</h3>
                <RecordHistoryTimeline history={selectedCase.history} onQuote={setSelectedQuote} />

                <div className="border-t border-gray-200 pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Add Comment</label>
                  {selectedQuote && (
                    <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 border-l-4 border-l-[#6264A7]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-gray-500 font-medium">
                          Replying to {selectedQuote.user} - {selectedQuote.timestamp}
                        </p>
                        <button
                          onClick={() => setSelectedQuote(null)}
                          className="text-xs text-[#6264A7] hover:underline"
                        >
                          Clear quote
                        </button>
                      </div>
                      <p className="text-sm text-gray-700 mt-1 line-clamp-3 break-words [overflow-wrap:anywhere]">{formatHistoryEntryText(selectedQuote)}</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Enter your comment..."
                      rows={3}
                      className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={handleAddComment}
                      disabled={!newComment.trim()}
                      className="px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Add Comment
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
          </div>
        </div>
      )}
    </div>
  );
}
