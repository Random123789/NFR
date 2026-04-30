import { useState, useEffect } from "react";
import { ArrowLeft, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Edit2, Save, Bookmark } from "lucide-react";
import { knocks, cases, getLinkedCasesByEntity, addCaseLink, removeCaseLink, getKnockById, updateKnock, type HistoryEntry } from "../data/apiClient";
import { LinkedCasesList } from "../components/LinkedEntityCard";
import { RecordHistoryTimeline, formatHistoryEntryText } from "../components/RecordHistoryTimeline";
import { TableFieldSelector } from "../components/TableFieldSelector";
import { useLocation, useNavigate } from "react-router";
import { useSearch } from "../context/SearchContext";
import { useBookmarks } from "../context/BookmarksContext";
import { useToast } from "../context/ToastContext";
import { knockStatusColors } from "../data/recordStyles";
import { compareValues, getNextSortConfig, toggleColumnKey, useStoredColumnKeys, type SortConfig } from "../hooks/useTableColumns";

type KnockColumnKey = "recordId" | "description" | "knockId" | "status" | "requestDate" | "targetDate";
type KnockSearchKey = "recordId" | "description" | "knockId";

type KnockTableColumn = {
  key: KnockColumnKey;
  label: string;
  sortKey: KnockColumnKey;
  searchKey?: KnockSearchKey;
};

const KNOCK_TABLE_COLUMNS: KnockTableColumn[] = [
  { key: "recordId", label: "Record ID", sortKey: "recordId", searchKey: "recordId" },
  { key: "description", label: "Description", sortKey: "description", searchKey: "description" },
  { key: "knockId", label: "Knock ID", sortKey: "knockId", searchKey: "knockId" },
  { key: "status", label: "Status", sortKey: "status" },
  { key: "requestDate", label: "Request Date", sortKey: "requestDate" },
  { key: "targetDate", label: "Target Date", sortKey: "targetDate" },
];

const DEFAULT_KNOCK_COLUMN_KEYS = KNOCK_TABLE_COLUMNS.map((column) => column.key);
const KNOCK_COLUMN_STORAGE_KEY = "knock.visibleTableColumns";

export function Knock() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { addBookmark, removeBookmark, isBookmarked } = useBookmarks();
  const { searchTerm } = useSearch();
  const [selectedKnock, setSelectedKnock] = useState<typeof knocks[0] | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedKnock, setEditedKnock] = useState<typeof knocks[0] | null>(null);
  const [newComment, setNewComment] = useState("");
  const [selectedQuote, setSelectedQuote] = useState<HistoryEntry | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<"details" | "linked">("details");
  const [linkedCases, setLinkedCases] = useState<typeof cases>([]);
  const [linkingCaseId, setLinkingCaseId] = useState("");
  const [isLinkingCase, setIsLinkingCase] = useState(false);
  const [visibleKnockColumnKeys, setVisibleKnockColumnKeys] = useStoredColumnKeys<KnockColumnKey>(KNOCK_COLUMN_STORAGE_KEY, DEFAULT_KNOCK_COLUMN_KEYS);

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
    description: "",
    knockId: "",
  });

  const [sortConfig, setSortConfig] = useState<SortConfig<KnockColumnKey>>({
    key: "",
    direction: null,
  });

  useEffect(() => {
    const handleOpenDetail = (event: Event) => {
      const knockId = (event as CustomEvent<string>).detail;
      const knock = getKnockById(knockId);
      if (knock) {
        setSelectedKnock(knock);
        setActiveDetailTab("details");
      }
    };

    window.addEventListener('openKnockDetail', handleOpenDetail as EventListener);
    return () => window.removeEventListener('openKnockDetail', handleOpenDetail as EventListener);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadLinkedCases = async () => {
      if (!selectedKnock) {
        setLinkedCases([]);
        setLinkingCaseId("");
        return;
      }

      try {
        const linked = await getLinkedCasesByEntity("knock", selectedKnock.recordId);
        if (!cancelled) {
          setLinkedCases(linked);
        }
      } catch (error) {
        console.error("Failed to load linked cases for knock:", error);
        if (!cancelled) {
          setLinkedCases([]);
        }
      }
    };

    loadLinkedCases();
    return () => {
      cancelled = true;
    };
  }, [selectedKnock?.recordId]);

  const handleCaseClick = (caseId: string) => {
    if (!selectedKnock?.recordId) return;

    const state: LinkedReturnState = {
      returnTo: {
        path: '/knock',
        eventName: 'openKnockDetail',
        recordId: selectedKnock.recordId,
      },
      previousState: (location.state as LinkedReturnState | null) ?? null,
    };

    navigate('/cases', { state });
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openCaseDetail', { detail: caseId }));
    }, 100);
  };

  const handleLinkCase = async () => {
    if (!selectedKnock || !linkingCaseId) return;

    setIsLinkingCase(true);
    try {
      await addCaseLink(linkingCaseId, "knock", selectedKnock.recordId);
      const linked = await getLinkedCasesByEntity("knock", selectedKnock.recordId);
      setLinkedCases(linked);
      setLinkingCaseId("");
      showToast("Case linked successfully.", "success");
    } catch (error) {
      console.error("Failed to link case to knock:", error);
      showToast("Failed to link case.", "error");
    } finally {
      setIsLinkingCase(false);
    }
  };

  const handleUnlinkCase = async (caseRecordId: string) => {
    if (!selectedKnock) return;

    setIsLinkingCase(true);
    try {
      await removeCaseLink(caseRecordId, "knock", selectedKnock.recordId);
      const linked = await getLinkedCasesByEntity("knock", selectedKnock.recordId);
      setLinkedCases(linked);
      showToast("Case unlinked successfully.", "success");
    } catch (error) {
      console.error("Failed to unlink case from knock:", error);
      showToast("Failed to unlink case.", "error");
    } finally {
      setIsLinkingCase(false);
    }
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

    setSelectedKnock(null);
  };

  const handleEdit = () => {
    if (selectedKnock) {
      setEditedKnock({ ...selectedKnock });
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    if (!editedKnock) return;

    try {
      const saved = await updateKnock(editedKnock.recordId, {
        description: editedKnock.description,
        knockId: editedKnock.knockId,
        knockUrl: editedKnock.knockUrl,
        status: editedKnock.status,
        requestDate: editedKnock.requestDate,
        targetDate: editedKnock.targetDate,
        metaData: editedKnock.metaData,
      });

      const index = knocks.findIndex((knock) => knock.recordId === saved.recordId);
      if (index >= 0) {
        knocks[index] = saved;
      }

      setSelectedKnock(saved);
      setEditedKnock(saved);
      setIsEditing(false);
      showToast("Changes saved successfully!", "success");
    } catch (error) {
      console.error("Failed to save knock:", error);
      showToast("Failed to save changes. Please try again.", "error");
    }
  };

  const handleCancelEdit = () => {
    setEditedKnock(null);
    setIsEditing(false);
  };

  const handleAddComment = () => {
    if (selectedKnock && newComment.trim()) {
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

      const updatedKnock = {
        ...selectedKnock,
        history: [...(selectedKnock.history || []), newHistoryEntry],
      };

      setSelectedKnock(updatedKnock);
      setNewComment("");
      setSelectedQuote(null);
    }
  };

  const handleSort = (key: KnockColumnKey) => {
    setSortConfig((current) => getNextSortConfig(current, key));
  };

  const handleToggleKnockColumn = (key: KnockColumnKey) => {
    const column = KNOCK_TABLE_COLUMNS.find((item) => item.key === key);
    const isCurrentlyVisible = visibleKnockColumnKeys.includes(key);
    const shouldHide = isCurrentlyVisible && visibleKnockColumnKeys.length > 1;

    if (shouldHide && column?.searchKey) {
      setSearchFilters((current) => ({ ...current, [column.searchKey!]: "" }));
    }

    if (shouldHide && sortConfig.key === key) {
      setSortConfig({ key: "", direction: null });
    }

    setVisibleKnockColumnKeys((current) => toggleColumnKey(current, key, DEFAULT_KNOCK_COLUMN_KEYS));
  };

  const handleResetKnockColumns = () => {
    setVisibleKnockColumnKeys(DEFAULT_KNOCK_COLUMN_KEYS);
  };

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const filteredKnocks = knocks.filter((knock) => {
    if (normalizedSearchTerm) {
      const matchesGlobalSearch = [
        knock.recordId,
        knock.description,
        knock.knockId,
        knock.knockUrl,
        knock.status,
      ].some((value) => (value ?? "").toLowerCase().includes(normalizedSearchTerm));

      if (!matchesGlobalSearch) return false;
    }

    if (searchFilters.recordId && !knock.recordId.toLowerCase().includes(searchFilters.recordId.toLowerCase())) return false;
    if (searchFilters.description && !knock.description.toLowerCase().includes(searchFilters.description.toLowerCase())) return false;
    if (searchFilters.knockId && !(knock.knockId ?? "").toLowerCase().includes(searchFilters.knockId.toLowerCase())) return false;
    return true;
  });

  const sortedKnocks = [...filteredKnocks].sort((a, b) => {
    if (!sortConfig.direction || !sortConfig.key) return 0;
    return compareValues(a[sortConfig.key], b[sortConfig.key], sortConfig.direction);
  });

  const availableCases = cases.filter((caseItem) => !linkedCases.some((linkedCase) => linkedCase.recordId === caseItem.recordId));
  const visibleKnockColumns = KNOCK_TABLE_COLUMNS.filter((column) => visibleKnockColumnKeys.includes(column.key));

  const renderSortIcon = (key: KnockColumnKey) => {
    if (sortConfig.key !== key || !sortConfig.direction) {
      return <ArrowUpDown className="w-4 h-4" />;
    }

    return sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />;
  };

  const renderColumnHeader = (column: KnockTableColumn) => (
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

  const renderColumnCell = (knock: typeof knocks[0], column: KnockTableColumn) => {
    switch (column.key) {
      case "recordId":
        return <td key={column.key} className="px-6 py-4 text-sm font-medium text-[#E31937] whitespace-nowrap">{knock.recordId}</td>;
      case "description":
        return (
          <td key={column.key} className="px-6 py-4 text-sm text-gray-900 max-w-md truncate whitespace-nowrap" title={knock.description}>
            {knock.description}
          </td>
        );
      case "knockId":
        return <td key={column.key} className="px-6 py-4 text-sm text-[#E31937] hover:underline whitespace-nowrap">{knock.knockId}</td>;
      case "status":
        return (
          <td key={column.key} className="px-6 py-4">
            <span className={`inline-flex whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium ${knockStatusColors[knock.status ?? "Active"]}`}>
              {knock.status ?? "-"}
            </span>
          </td>
        );
      case "requestDate":
        return <td key={column.key} className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{knock.requestDate}</td>;
      case "targetDate":
        return <td key={column.key} className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{knock.targetDate}</td>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Knock</h1>
        <p className="text-gray-600 mt-1">Track Knock requests and integrations</p>
      </div>

      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${selectedKnock ? "hidden" : ""}`}>
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Knock Records</h2>
            <p className="text-sm text-gray-500">{visibleKnockColumns.length} of {KNOCK_TABLE_COLUMNS.length} fields shown</p>
          </div>
          <TableFieldSelector
            columns={KNOCK_TABLE_COLUMNS}
            visibleKeys={visibleKnockColumnKeys}
            onToggle={handleToggleKnockColumn}
            onReset={handleResetKnockColumns}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 w-12">
                  <Bookmark className="h-4 w-4 text-gray-500" aria-label="Bookmark" />
                </th>
                {visibleKnockColumns.map(renderColumnHeader)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedKnocks.map((knock) => (
                <tr
                  key={knock.recordId}
                  onClick={() => {
                    setSelectedKnock(knock);
                    setActiveDetailTab("details");
                  }}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isBookmarked(knock.recordId, 'knock')) {
                          removeBookmark(knock.recordId, 'knock');
                        } else {
                          addBookmark({
                            id: knock.recordId,
                            type: 'knock',
                            title: knock.description,
                            subtitle: knock.status ?? undefined,
                            timestamp: Date.now(),
                          });
                        }
                      }}
                      className="text-gray-400 hover:text-yellow-500 transition-colors"
                      title="Bookmark"
                    >
                      <Bookmark className={`w-5 h-5 ${isBookmarked(knock.recordId, 'knock') ? 'fill-yellow-400 text-yellow-500' : ''}`} />
                    </button>
                  </td>
                  {visibleKnockColumns.map((column) => renderColumnCell(knock, column))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedKnock && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="w-full">
            <div className="sticky top-[-1.5rem] z-10 bg-white border-b border-gray-200 p-6 flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-semibold text-gray-900">Knock Details</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (isBookmarked(selectedKnock!.recordId, 'knock')) {
                      removeBookmark(selectedKnock!.recordId, 'knock');
                    } else {
                      addBookmark({
                        id: selectedKnock!.recordId,
                        type: 'knock',
                        title: selectedKnock!.description,
                        subtitle: selectedKnock!.status ?? undefined,
                        timestamp: Date.now(),
                      });
                    }
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    isBookmarked(selectedKnock!.recordId, 'knock')
                      ? 'bg-yellow-100 text-yellow-600'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Bookmark this knock"
                >
                  <Bookmark className={`w-5 h-5 ${isBookmarked(selectedKnock!.recordId, 'knock') ? 'fill-current' : ''}`} />
                </button>
                {isEditing ? (
                  <>
                    <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] transition-colors">
                      <Save className="w-4 h-4" />
                      Save
                    </button>
                    <button onClick={handleCancelEdit} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                  </>
                ) : (
                  <button onClick={handleEdit} className="flex items-center gap-2 px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] transition-colors">
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                )}
                <button onClick={handleBackFromDetail} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
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
                  <p className="text-gray-900">{selectedKnock.recordId}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Knock ID</label>
                  {isEditing && editedKnock ? (
                    <input
                      type="text"
                      value={editedKnock.knockId ?? ""}
                      onChange={(e) => setEditedKnock({ ...editedKnock, knockId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedKnock.knockId}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
                  {isEditing && editedKnock ? (
                    <textarea
                      value={editedKnock.description}
                      onChange={(e) => setEditedKnock({ ...editedKnock, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedKnock.description}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
                  {isEditing && editedKnock ? (
                    <select
                      value={editedKnock.status ?? ""}
                      onChange={(e) => setEditedKnock({ ...editedKnock, status: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="Active">Active</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  ) : (
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${knockStatusColors[selectedKnock.status ?? "Active"]}`}>
                      {selectedKnock.status ?? "—"}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Knock URL</label>
                  {isEditing && editedKnock ? (
                    <input
                      type="url"
                      value={editedKnock.knockUrl ?? ""}
                      onChange={(e) => setEditedKnock({ ...editedKnock, knockUrl: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    selectedKnock.knockUrl ? (
                      <a href={selectedKnock.knockUrl} target="_blank" rel="noopener noreferrer" className="text-[#E31937] hover:underline flex items-center gap-1">
                        View in Knock
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Request Date</label>
                  {isEditing && editedKnock ? (
                    <input
                      type="date"
                      value={editedKnock.requestDate ?? ""}
                      onChange={(e) => setEditedKnock({ ...editedKnock, requestDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedKnock.requestDate}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Target Date</label>
                  {isEditing && editedKnock ? (
                    <input
                      type="date"
                      value={editedKnock.targetDate ?? ""}
                      onChange={(e) => setEditedKnock({ ...editedKnock, targetDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedKnock.targetDate}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Created At</label>
                  <p className="text-gray-900">{selectedKnock.createdAt}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Updated At</label>
                  <p className="text-gray-900">{selectedKnock.updatedAt}</p>
                </div>
              </div>

              <div className={activeDetailTab === "linked" ? "pt-1" : "hidden"}>
                <h3 className="font-semibold text-lg text-gray-900 mb-4">Related Data</h3>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3 mb-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Link case</label>
                      <select
                        value={linkingCaseId}
                        onChange={(e) => setLinkingCaseId(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      >
                        <option value="">Select a case</option>
                        {availableCases.map((caseItem) => (
                          <option key={caseItem.recordId} value={caseItem.recordId}>
                            {caseItem.recordId} - {caseItem.description}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={handleLinkCase}
                      disabled={!linkingCaseId || isLinkingCase}
                      className="px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Link Case
                    </button>
                  </div>
                </div>

                <LinkedCasesList cases={linkedCases} onCaseClick={handleCaseClick} onRemoveCase={handleUnlinkCase} />
              </div>

              </div>

              <div className="xl:col-span-1">
                <div className="xl:sticky xl:top-24 border border-gray-200 rounded-lg bg-white p-4 max-h-[60vh] overflow-y-auto overflow-x-hidden">
              <div className="pt-0">
                <h3 className="font-semibold text-lg text-gray-900 mb-4">History</h3>
                <RecordHistoryTimeline history={selectedKnock.history} onQuote={setSelectedQuote} />

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
