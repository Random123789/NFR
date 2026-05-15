import { useState } from "react";
import { ArrowLeft, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Download, Edit2, Save, Bookmark } from "lucide-react";
import { addKnockHistory, updateKnock } from "../data/apiClient";
import { DetailTabs } from "../components/DetailTabs";
import { LinkedCasesList } from "../components/LinkedEntityCard";
import { CreateEntityDialog } from "../components/CreateEntityDialog";
import { RecordHistoryTimeline, formatHistoryEntryText } from "../components/RecordHistoryTimeline";
import { TableFieldSelector } from "../components/TableFieldSelector";
import { useLocation, useNavigate } from "react-router";
import { useSearch } from "../context/SearchContext";
import { useBookmarks } from "../context/BookmarksContext";
import { useAuth } from "../context/AuthContext";
import { useRecords } from "../context/RecordsContext";
import { useToast } from "../context/ToastContext";
import { knockStatusColors } from "../data/recordStyles";
import { useRoutedEntityDetail } from "../hooks/useEntityDetail";
import { useLinkedCases } from "../hooks/useLinkedCases";
import { useRecordComments } from "../hooks/useRecordComments";
import { compareValues, getNextSortConfig, toggleColumnKey, useStoredColumnKeys, type SortConfig } from "../hooks/useTableColumns";
import {
  createDetailTarget,
  createLinkedDetailState,
  type DetailRouteState,
} from "../navigation/detailNavigation";
import { exportRowsToCsv } from "../utils/csvExport";
import { formatRelatedCaseOption } from "../utils/caseLabels";
import { formatTimestampMinute } from "../utils/dateTime";

type KnockColumnKey = "knockId" | "knockUrl" | "description" | "status" | "requestDate" | "targetDate";
type KnockSearchKey = "knockId" | "knockUrl" | "description";

type KnockTableColumn = {
  key: KnockColumnKey;
  label: string;
  sortKey: KnockColumnKey;
  searchKey?: KnockSearchKey;
};

const KNOCK_TABLE_COLUMNS: KnockTableColumn[] = [
  { key: "knockId", label: "Knock ID", sortKey: "knockId", searchKey: "knockId" },
  { key: "knockUrl", label: "Knock URL", sortKey: "knockUrl", searchKey: "knockUrl" },
  { key: "description", label: "Description", sortKey: "description", searchKey: "description" },
  { key: "status", label: "Status", sortKey: "status" },
  { key: "requestDate", label: "Request Date", sortKey: "requestDate" },
  { key: "targetDate", label: "Target Date", sortKey: "targetDate" },
];

const DEFAULT_KNOCK_COLUMN_KEYS = KNOCK_TABLE_COLUMNS.map((column) => column.key);
const KNOCK_COLUMN_STORAGE_KEY = "knock.visibleTableColumns";
const KNOCK_DETAIL_TABS = [
  { key: "details", label: "Details" },
  { key: "linkedCases", label: "Linked Cases" },
];
const RELATED_CREATE_BUTTON_CLASS = "inline-flex h-[42px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50";

export function Knock() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { addBookmark, removeBookmark, isBookmarked } = useBookmarks();
  const { searchTerm } = useSearch();
  const { accounts, projects, knocks, cases, getKnockById, upsertKnock } = useRecords();
  const {
    selectedRecord: selectedKnock,
    setSelectedRecord: setSelectedKnock,
    isEditing,
    editedRecord: editedKnock,
    setEditedRecord: setEditedKnock,
    activeDetailTab,
    setActiveDetailTab,
    handleBackFromDetail,
    handleEdit,
    handleCancelEdit,
    applySavedRecord,
  } = useRoutedEntityDetail({
    entityType: "knock",
    getRecordById: getKnockById,
  });
  const {
    linkedCases,
    linkingCaseId,
    setLinkingCaseId,
    isLinkingCase,
    availableCases,
    linkCase,
    handleLinkCase,
    handleUnlinkCase,
  } = useLinkedCases({
    entityType: "knock",
    entityRecordId: selectedKnock?.recordId,
    cases,
    entityLabel: "knock",
    showToast,
  });
  const { newComment, setNewComment, selectedQuote, setSelectedQuote, isAddingComment, handleAddComment } = useRecordComments({
    selectedRecord: selectedKnock,
    setSelectedRecord: setSelectedKnock,
    addHistory: addKnockHistory,
    upsertRecord: upsertKnock,
    userName: user?.displayName,
    onError: (message) => showToast(message, "error"),
  });
  const [visibleKnockColumnKeys, setVisibleKnockColumnKeys] = useStoredColumnKeys<KnockColumnKey>(KNOCK_COLUMN_STORAGE_KEY, DEFAULT_KNOCK_COLUMN_KEYS);

  const [searchFilters, setSearchFilters] = useState({
    knockId: "",
    knockUrl: "",
    description: "",
  });

  const [sortConfig, setSortConfig] = useState<SortConfig<KnockColumnKey>>({
    key: "",
    direction: null,
  });

  const handleCaseClick = (caseId: string) => {
    if (!selectedKnock?.recordId) return;

    navigate('/cases', {
      state: createLinkedDetailState(
        "case",
        caseId,
        createDetailTarget("knock", selectedKnock.recordId),
        (location.state as DetailRouteState | null) ?? null,
      ),
    });
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

      upsertKnock(saved);

      applySavedRecord(saved);
      showToast("Changes saved successfully!", "success");
    } catch (error) {
      console.error("Failed to save knock:", error);
      showToast("Failed to save changes. Please try again.", "error");
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
        knock.description,
        knock.knockId,
        knock.knockUrl,
        knock.status,
      ].some((value) => (value ?? "").toLowerCase().includes(normalizedSearchTerm));

      if (!matchesGlobalSearch) return false;
    }

    if (searchFilters.knockId && !(knock.knockId ?? "").toLowerCase().includes(searchFilters.knockId.toLowerCase())) return false;
    if (searchFilters.knockUrl && !(knock.knockUrl ?? "").toLowerCase().includes(searchFilters.knockUrl.toLowerCase())) return false;
    if (searchFilters.description && !knock.description.toLowerCase().includes(searchFilters.description.toLowerCase())) return false;
    return true;
  });

  const sortedKnocks = [...filteredKnocks].sort((a, b) => {
    if (!sortConfig.direction || !sortConfig.key) return 0;
    return compareValues(a[sortConfig.key], b[sortConfig.key], sortConfig.direction);
  });

  const visibleKnockColumns = KNOCK_TABLE_COLUMNS.filter((column) => visibleKnockColumnKeys.includes(column.key));
  const detailGridClassName = activeDetailTab === "details"
    ? `grid grid-cols-1 gap-3 sm:grid-cols-2 ${
        isEditing
          ? ""
          : "[&>div]:flex [&>div]:min-w-0 [&>div]:items-baseline [&>div]:gap-x-2 [&>div]:gap-y-1 [&>div]:rounded-lg [&>div]:border [&>div]:border-gray-100 [&>div]:bg-gray-50 [&>div]:px-3 [&>div]:py-2 [&_label]:mb-0 [&_label]:shrink-0 [&_label]:font-semibold [&_label]:after:content-[':'] [&_p]:min-w-0 [&_p]:flex-1 [&_p]:break-words [&_a]:min-w-0 [&_a]:break-all"
      }`
    : "hidden";

  const handleExportCsv = () => {
    exportRowsToCsv(
      "knock",
      sortedKnocks,
      visibleKnockColumns.map((column) => ({
        label: column.label,
        value: (knock) => knock[column.key] ?? "",
      })),
    );
  };

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
      case "knockId":
        return <td key={column.key} className="px-6 py-4 text-sm text-[#E31937] hover:underline whitespace-nowrap">{knock.knockId || "-"}</td>;
      case "knockUrl":
        return (
          <td key={column.key} className="px-6 py-4 text-sm whitespace-nowrap">
            {knock.knockUrl ? (
              <a
                href={knock.knockUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#E31937] hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                Open
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="text-gray-500">-</span>
            )}
          </td>
        );
      case "description":
        return (
          <td key={column.key} className="px-6 py-4 text-sm text-gray-900 max-w-md truncate whitespace-nowrap" title={knock.description}>
            {knock.description}
          </td>
        );
      case "status":
        return (
          <td key={column.key} className="px-6 py-4">
            <span className={`inline-flex whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium ${knockStatusColors[knock.status ?? ""] ?? "bg-gray-100 text-gray-700"}`}>
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={sortedKnocks.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <CreateEntityDialog
              entityType="knock"
              onCreated={(knock) => {
                setSelectedKnock(knock);
                setActiveDetailTab("details");
              }}
            />
            <TableFieldSelector
              columns={KNOCK_TABLE_COLUMNS}
              visibleKeys={visibleKnockColumnKeys}
              onToggle={handleToggleKnockColumn}
              onReset={handleResetKnockColumns}
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
              <DetailTabs tabs={KNOCK_DETAIL_TABS} activeTab={activeDetailTab} onChange={setActiveDetailTab} />

              <div className={detailGridClassName}>
                <div className="order-1">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Knock ID</label>
                  {isEditing && editedKnock ? (
                    <input
                      type="text"
                      value={editedKnock.knockId ?? ""}
                      onChange={(e) => setEditedKnock({ ...editedKnock, knockId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedKnock.knockId || "-"}</p>
                  )}
                </div>
                <div className="order-3">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
                  {isEditing && editedKnock ? (
                    <input
                      type="text"
                      value={editedKnock.status ?? ""}
                      onChange={(e) => setEditedKnock({ ...editedKnock, status: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${knockStatusColors[selectedKnock.status ?? ""] ?? "bg-gray-100 text-gray-700"}`}>
                      {selectedKnock.status ?? "-"}
                    </span>
                  )}
                </div>
                <div className="order-2">
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
                      <a href={selectedKnock.knockUrl} target="_blank" rel="noopener noreferrer" className="break-all text-[#E31937] hover:underline inline-flex items-center gap-1">
                        {selectedKnock.knockUrl}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <p className="text-gray-900">-</p>
                    )
                  )}
                </div>
                <div className="order-4">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Request Date</label>
                  {isEditing && editedKnock ? (
                    <input
                      type="date"
                      value={editedKnock.requestDate ?? ""}
                      onChange={(e) => setEditedKnock({ ...editedKnock, requestDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedKnock.requestDate || "-"}</p>
                  )}
                </div>
                <div className="order-5">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Target Date</label>
                  {isEditing && editedKnock ? (
                    <input
                      type="date"
                      value={editedKnock.targetDate ?? ""}
                      onChange={(e) => setEditedKnock({ ...editedKnock, targetDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedKnock.targetDate || "-"}</p>
                  )}
                </div>
                <div className="order-6 sm:col-span-2">
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
              </div>

              <div className={activeDetailTab === "linkedCases" ? "pt-1" : "hidden"}>
                <h3 className="font-semibold text-lg text-gray-900 mb-4">Linked Cases</h3>
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
                            {formatRelatedCaseOption(caseItem, accounts, projects)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <CreateEntityDialog
                      entityType="case"
                      triggerLabel="New"
                      triggerTitle="Create case"
                      initialValues={{
                        knockIds: [selectedKnock.recordId],
                      }}
                      className={RELATED_CREATE_BUTTON_CLASS}
                      onCreated={(created) => {
                        void linkCase(created.recordId);
                      }}
                    />
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

                <div className="mb-4 border-b border-gray-200 pb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Add Comment</label>
                  {selectedQuote && (
                    <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 border-l-4 border-l-[#6264A7]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-gray-500 font-medium">
                          Replying to {selectedQuote.user} - {formatTimestampMinute(selectedQuote.timestamp)}
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
                      disabled={isAddingComment || !newComment.trim()}
                      className="px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isAddingComment ? "Adding..." : "Add Comment"}
                    </button>
                  </div>
                </div>
                <RecordHistoryTimeline history={selectedKnock.history} onQuote={setSelectedQuote} />
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
