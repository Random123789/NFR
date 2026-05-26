import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Download, Edit2, Save, Bookmark, Trash2 } from "lucide-react";
import { addMantisHistory, deleteMantis, updateMantis } from "../data/apiClient";
import { DetailTabs } from "../components/DetailTabs";
import { LinkedCasesList } from "../components/LinkedEntityCard";
import { CreateEntityDialog } from "../components/CreateEntityDialog";
import { RecordHistoryTimeline, formatHistoryEntryText } from "../components/RecordHistoryTimeline";
import { SearchableSelect } from "../components/SearchableSelect";
import { TypeaheadInput, TypeaheadTextarea } from "../components/TypeaheadInput";
import { TableFieldSelector } from "../components/TableFieldSelector";
import { PageGuide } from "../components/PageGuide";
import { useLocation, useNavigate } from "react-router";
import { useSearch } from "../context/SearchContext";
import { useBookmarks } from "../context/BookmarksContext";
import { useAuth } from "../context/AuthContext";
import { useRecords } from "../context/RecordsContext";
import { useRecordReadState } from "../context/RecordReadContext";
import { useToast } from "../context/ToastContext";
import { mantisStatusColors } from "../data/recordStyles";
import { mantisGuideSteps } from "../data/pageGuides";
import { buildMantisUrl, mantisCategories, mantisStatuses } from "../data/mantisOptions";
import { useRoutedEntityDetail } from "../hooks/useEntityDetail";
import { useLinkedCases } from "../hooks/useLinkedCases";
import { useRecordComments } from "../hooks/useRecordComments";
import { compareValues, getNextSortConfig, toggleColumnKey, useStoredColumnKeys, type SortConfig } from "../hooks/useTableColumns";
import {
  createDetailPath,
  createDetailTarget,
  createLinkedDetailState,
  resolveDetailRouteRecordId,
  type DetailRouteState,
} from "../navigation/detailNavigation";
import { exportRowsToCsv } from "../utils/csvExport";
import { formatRelatedCaseOption } from "../utils/caseLabels";
import { formatTimestampMinute } from "../utils/dateTime";
import { fieldSuggestions } from "../utils/typeaheadOptions";
import { getRecordActivityTimestamp } from "../utils/recordActivity";
import { unreadRowClassName } from "../utils/unreadRows";

type MantisColumnKey = "mantisId" | "mantisUrl" | "description" | "category" | "mantisStatus" | "mantisRequestDate" | "mantisTargetDate";
type MantisSearchKey = "mantisId" | "mantisUrl" | "description" | "category";

type MantisTableColumn = {
  key: MantisColumnKey;
  label: string;
  sortKey: MantisColumnKey;
  searchKey?: MantisSearchKey;
};

const MANTIS_TABLE_COLUMNS: MantisTableColumn[] = [
  { key: "mantisId", label: "Mantis ID", sortKey: "mantisId", searchKey: "mantisId" },
  { key: "mantisUrl", label: "Mantis URL", sortKey: "mantisUrl", searchKey: "mantisUrl" },
  { key: "description", label: "Description", sortKey: "description", searchKey: "description" },
  { key: "category", label: "Category", sortKey: "category", searchKey: "category" },
  { key: "mantisStatus", label: "Status", sortKey: "mantisStatus" },
  { key: "mantisRequestDate", label: "Request Date", sortKey: "mantisRequestDate" },
  { key: "mantisTargetDate", label: "Target Date", sortKey: "mantisTargetDate" },
];

const DEFAULT_MANTIS_COLUMN_KEYS = MANTIS_TABLE_COLUMNS.map((column) => column.key);
const MANTIS_COLUMN_STORAGE_KEY = "mantis.visibleTableColumns";
const MANTIS_DETAIL_TABS = [
  { key: "details", label: "Details" },
  { key: "linkedCases", label: "Linked Cases" },
];
const RELATED_CREATE_BUTTON_CLASS = "inline-flex h-[42px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50";

export function Mantis() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { addBookmark, removeBookmark, isBookmarked } = useBookmarks();
  const { isRecordUnread, markRecordRead } = useRecordReadState();
  const { searchTerm } = useSearch();
  const { accounts, projects, mantisRecords, cases, getMantisById, upsertMantis, removeMantis, refreshRecords } = useRecords();
  const {
    selectedRecord: selectedMantis,
    setSelectedRecord: setSelectedMantis,
    isEditing,
    editedRecord: editedMantis,
    setEditedRecord: setEditedMantis,
    activeDetailTab,
    setActiveDetailTab,
    handleBackFromDetail,
    handleEdit,
    handleCancelEdit,
    applySavedRecord,
  } = useRoutedEntityDetail({
    entityType: "mantis",
    getRecordById: getMantisById,
    resolveRouteRecordId: (routeParam) => resolveDetailRouteRecordId("mantis", routeParam, mantisRecords, (mantis) => [mantis.mantisId]),
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
    entityType: "mantis",
    entityRecordId: selectedMantis?.recordId,
    cases,
    entityLabel: "Mantis",
    showToast,
  });
  const { newComment, setNewComment, selectedQuote, setSelectedQuote, isAddingComment, handleAddComment } = useRecordComments({
    selectedRecord: selectedMantis,
    setSelectedRecord: setSelectedMantis,
    addHistory: addMantisHistory,
    upsertRecord: upsertMantis,
    userName: user?.displayName,
    onError: (message) => showToast(message, "error"),
  });
  const selectedMantisActivityAt = getRecordActivityTimestamp(selectedMantis);
  const mantisDescriptionSuggestions = useMemo(
    () => fieldSuggestions(mantisRecords, "description", selectedMantis?.recordId),
    [mantisRecords, selectedMantis?.recordId],
  );
  const mantisIdSuggestions = useMemo(
    () => fieldSuggestions(mantisRecords, "mantisId", selectedMantis?.recordId),
    [mantisRecords, selectedMantis?.recordId],
  );

  useEffect(() => {
    if (!selectedMantis) return;
    void markRecordRead("mantis", selectedMantis.recordId);
  }, [markRecordRead, selectedMantis?.recordId, selectedMantisActivityAt]);
  const [visibleMantisColumnKeys, setVisibleMantisColumnKeys] = useStoredColumnKeys<MantisColumnKey>(MANTIS_COLUMN_STORAGE_KEY, DEFAULT_MANTIS_COLUMN_KEYS);

  const [searchFilters, setSearchFilters] = useState({
    mantisId: "",
    mantisUrl: "",
    description: "",
    category: "",
  });

  const [sortConfig, setSortConfig] = useState<SortConfig<MantisColumnKey>>({
    key: "",
    direction: null,
  });

  const handleCaseClick = (caseId: string) => {
    if (!selectedMantis?.recordId) return;

    navigate(createDetailPath("case", caseId), {
      state: createLinkedDetailState(
        "case",
        caseId,
        createDetailTarget("mantis", selectedMantis.recordId),
        (location.state as DetailRouteState | null) ?? null,
      ),
    });
  };

  const handleSave = async () => {
    if (!editedMantis) return;

    try {
      const saved = await updateMantis(editedMantis.recordId, {
        description: editedMantis.description,
        mantisId: editedMantis.mantisId,
        mantisUrl: buildMantisUrl(editedMantis.mantisId),
        category: editedMantis.category,
        mantisStatus: editedMantis.mantisStatus,
        mantisRequestDate: editedMantis.mantisRequestDate,
        mantisTargetDate: editedMantis.mantisTargetDate,
        metaData: editedMantis.metaData,
      });

      upsertMantis(saved);

      applySavedRecord(saved);
      showToast("Changes saved successfully!", "success");
    } catch (error) {
      console.error("Failed to save Mantis:", error);
      showToast("Failed to save changes. Please try again.", "error");
    }
  };

  const canDeleteRecords = user?.role === "manager" || user?.role === "admin";

  const handleDelete = async () => {
    if (!selectedMantis) return;
    const label = selectedMantis.mantisId || selectedMantis.description;
    const confirmed = window.confirm(`Delete Mantis "${label}"? Linked cases will be detached.`);
    if (!confirmed) return;

    try {
      await deleteMantis(selectedMantis.recordId);
      removeBookmark(selectedMantis.recordId, "mantis");
      removeMantis(selectedMantis.recordId);
      setSelectedMantis(null);
      await refreshRecords();
      showToast("Mantis deleted.", "success");
      navigate("/mantis");
    } catch (error) {
      console.error("Failed to delete Mantis:", error);
      showToast(error instanceof Error ? error.message : "Failed to delete Mantis.", "error");
    }
  };

  const handleSort = (key: MantisColumnKey) => {
    setSortConfig((current) => getNextSortConfig(current, key));
  };

  const handleToggleMantisColumn = (key: MantisColumnKey) => {
    const column = MANTIS_TABLE_COLUMNS.find((item) => item.key === key);
    const isCurrentlyVisible = visibleMantisColumnKeys.includes(key);
    const shouldHide = isCurrentlyVisible && visibleMantisColumnKeys.length > 1;

    if (shouldHide && column?.searchKey) {
      setSearchFilters((current) => ({ ...current, [column.searchKey!]: "" }));
    }

    if (shouldHide && sortConfig.key === key) {
      setSortConfig({ key: "", direction: null });
    }

    setVisibleMantisColumnKeys((current) => toggleColumnKey(current, key, DEFAULT_MANTIS_COLUMN_KEYS));
  };

  const handleResetMantisColumns = () => {
    setVisibleMantisColumnKeys(DEFAULT_MANTIS_COLUMN_KEYS);
  };

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const filteredMantisRecords = mantisRecords.filter((mantis) => {
    if (normalizedSearchTerm) {
      const matchesGlobalSearch = [
        mantis.recordId,
        mantis.description,
        mantis.mantisId,
        mantis.mantisUrl,
        mantis.category,
        mantis.mantisStatus,
      ].some((value) => (value ?? "").toLowerCase().includes(normalizedSearchTerm));

      if (!matchesGlobalSearch) return false;
    }

    if (searchFilters.mantisId && !(mantis.mantisId ?? "").toLowerCase().includes(searchFilters.mantisId.toLowerCase())) return false;
    if (searchFilters.mantisUrl && !(mantis.mantisUrl ?? "").toLowerCase().includes(searchFilters.mantisUrl.toLowerCase())) return false;
    if (searchFilters.description && !mantis.description.toLowerCase().includes(searchFilters.description.toLowerCase())) return false;
    if (searchFilters.category && !(mantis.category ?? "").toLowerCase().includes(searchFilters.category.toLowerCase())) return false;
    return true;
  });

  const sortedMantisRecords = [...filteredMantisRecords].sort((a, b) => {
    if (!sortConfig.direction || !sortConfig.key) return 0;
    return compareValues(a[sortConfig.key], b[sortConfig.key], sortConfig.direction);
  });

  const visibleMantisColumns = MANTIS_TABLE_COLUMNS.filter((column) => visibleMantisColumnKeys.includes(column.key));
  const detailGridClassName = activeDetailTab === "details"
    ? `grid grid-cols-1 gap-3 sm:grid-cols-2 ${
        isEditing
          ? ""
          : "[&>div]:flex [&>div]:min-w-0 [&>div]:items-baseline [&>div]:gap-x-2 [&>div]:gap-y-1 [&>div]:rounded-lg [&>div]:border [&>div]:border-gray-100 [&>div]:bg-gray-50 [&>div]:px-3 [&>div]:py-2 [&_label]:mb-0 [&_label]:shrink-0 [&_label]:font-semibold [&_label]:after:content-[':'] [&_p]:min-w-0 [&_p]:flex-1 [&_p]:break-words [&_a]:min-w-0 [&_a]:break-all"
      }`
    : "hidden";

  const handleExportCsv = () => {
    exportRowsToCsv(
      "mantis",
      sortedMantisRecords,
      visibleMantisColumns.map((column) => ({
        label: column.label,
        value: (mantis) => mantis[column.key] ?? "",
      })),
    );
  };

  const renderSortIcon = (key: MantisColumnKey) => {
    if (sortConfig.key !== key || !sortConfig.direction) {
      return <ArrowUpDown className="w-4 h-4" />;
    }

    return sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />;
  };

  const renderColumnHeader = (column: MantisTableColumn) => (
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

  const renderColumnCell = (mantis: typeof mantisRecords[0], column: MantisTableColumn) => {
    const mantisUrl = mantis.mantisUrl || buildMantisUrl(mantis.mantisId);

    switch (column.key) {
      case "mantisId":
        return <td key={column.key} className="px-6 py-4 text-sm text-[#E31937] hover:underline whitespace-nowrap">{mantis.mantisId || "-"}</td>;
      case "mantisUrl":
        return (
          <td key={column.key} className="px-6 py-4 text-sm whitespace-nowrap">
            {mantisUrl ? (
              <a
                href={mantisUrl}
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
          <td key={column.key} className="px-6 py-4 text-sm text-gray-900 max-w-md truncate whitespace-nowrap" title={mantis.description}>
            {mantis.description}
          </td>
        );
      case "category":
        return <td key={column.key} className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">{mantis.category || "-"}</td>;
      case "mantisStatus":
        return (
          <td key={column.key} className="px-6 py-4">
            <span className={`inline-flex whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium ${mantisStatusColors[mantis.mantisStatus ?? ""] ?? "bg-gray-100 text-gray-700"}`}>
              {mantis.mantisStatus || "-"}
            </span>
          </td>
        );
      case "mantisRequestDate":
        return <td key={column.key} className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{mantis.mantisRequestDate}</td>;
      case "mantisTargetDate":
        return <td key={column.key} className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{mantis.mantisTargetDate}</td>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div data-guide-id="mantis-intro">
          <h1 className="text-2xl font-bold text-gray-900">Mantis</h1>
          <p className="text-gray-600 mt-1">Track new feature requests and enhancements</p>
        </div>
        <PageGuide label="Mantis" steps={mantisGuideSteps} />
      </div>

      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${selectedMantis ? "hidden" : ""}`}>
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Mantis Records</h2>
            <p className="text-sm text-gray-500">{visibleMantisColumns.length} of {MANTIS_TABLE_COLUMNS.length} fields shown</p>
          </div>
          <div data-guide-id="mantis-actions" className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={sortedMantisRecords.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <CreateEntityDialog
              entityType="mantis"
              onCreated={(mantis) => navigate(createDetailPath("mantis", mantis.mantisId || mantis.recordId))}
            />
            <TableFieldSelector
              columns={MANTIS_TABLE_COLUMNS}
              visibleKeys={visibleMantisColumnKeys}
              onToggle={handleToggleMantisColumn}
              onReset={handleResetMantisColumns}
            />
          </div>
        </div>
        <div data-guide-id="mantis-table" className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 w-12">
                  <Bookmark className="h-4 w-4 text-gray-500" aria-label="Bookmark" />
                </th>
                {visibleMantisColumns.map(renderColumnHeader)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedMantisRecords.map((mantis) => (
                <tr
                  key={mantis.recordId}
                  onClick={() => navigate(createDetailPath("mantis", mantis.mantisId || mantis.recordId))}
                  className={unreadRowClassName(isRecordUnread("mantis", mantis.recordId, getRecordActivityTimestamp(mantis)))}
                >
                  <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isBookmarked(mantis.recordId, 'mantis')) {
                          removeBookmark(mantis.recordId, 'mantis');
                        } else {
                          addBookmark({
                            id: mantis.recordId,
                            type: 'mantis',
                            title: mantis.description,
                            subtitle: mantis.mantisStatus || undefined,
                            timestamp: Date.now(),
                          });
                        }
                      }}
                      className="text-gray-400 hover:text-yellow-500 transition-colors"
                      title="Bookmark"
                    >
                      <Bookmark className={`w-5 h-5 ${isBookmarked(mantis.recordId, 'mantis') ? 'fill-yellow-400 text-yellow-500' : ''}`} />
                    </button>
                  </td>
                  {visibleMantisColumns.map((column) => renderColumnCell(mantis, column))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedMantis && (
        <div data-guide-id="mantis-detail" className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="w-full">
            <div className="sticky top-[-1.5rem] z-10 bg-white border-b border-gray-200 p-6 flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-semibold text-gray-900">Mantis Details</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (isBookmarked(selectedMantis!.recordId, 'mantis')) {
                      removeBookmark(selectedMantis!.recordId, 'mantis');
                    } else {
                      addBookmark({
                        id: selectedMantis!.recordId,
                        type: 'mantis',
                        title: selectedMantis!.description,
                        subtitle: selectedMantis!.mantisStatus || undefined,
                        timestamp: Date.now(),
                      });
                    }
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    isBookmarked(selectedMantis!.recordId, 'mantis')
                      ? 'bg-yellow-100 text-yellow-600'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Bookmark this Mantis"
                >
                  <Bookmark className={`w-5 h-5 ${isBookmarked(selectedMantis!.recordId, 'mantis') ? 'fill-current' : ''}`} />
                </button>
                {canDeleteRecords && !isEditing ? (
                  <button
                    onClick={() => void handleDelete()}
                    className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-[#B5122B] transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                ) : null}
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
              <DetailTabs tabs={MANTIS_DETAIL_TABS} activeTab={activeDetailTab} onChange={setActiveDetailTab} />

              <div className={detailGridClassName}>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Mantis ID</label>
                  {isEditing && editedMantis ? (
                    <TypeaheadInput
                      type="text"
                      value={editedMantis.mantisId ?? ""}
                      onChange={(mantisId) =>
                        setEditedMantis({
                          ...editedMantis,
                          mantisId,
                          mantisUrl: buildMantisUrl(mantisId),
                        })
                      }
                      options={mantisIdSuggestions}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedMantis.mantisId || "-"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Mantis URL</label>
                  {isEditing && editedMantis ? (
                    <input
                      type="url"
                      value={editedMantis.mantisUrl ?? ""}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      placeholder="Generated from Mantis ID"
                    />
                  ) : selectedMantis.mantisUrl || buildMantisUrl(selectedMantis.mantisId) ? (
                    <a href={selectedMantis.mantisUrl || buildMantisUrl(selectedMantis.mantisId)} target="_blank" rel="noopener noreferrer" className="break-all text-[#E31937] hover:underline inline-flex items-center gap-1">
                      {selectedMantis.mantisUrl || buildMantisUrl(selectedMantis.mantisId)}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ) : (
                    <p className="text-gray-900">-</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Category</label>
                  {isEditing && editedMantis ? (
                    <select
                      value={editedMantis.category ?? ""}
                      onChange={(e) => setEditedMantis({ ...editedMantis, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">Select category</option>
                      {mantisCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-gray-900">{selectedMantis.category || "-"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
                  {isEditing && editedMantis ? (
                    <select
                      value={editedMantis.mantisStatus ?? ""}
                      onChange={(e) => setEditedMantis({ ...editedMantis, mantisStatus: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">Select status</option>
                      {mantisStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${mantisStatusColors[selectedMantis.mantisStatus ?? ""] ?? "bg-gray-100 text-gray-700"}`}>
                      {selectedMantis.mantisStatus || "-"}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Request Date</label>
                  {isEditing && editedMantis ? (
                    <input
                      type="date"
                      value={editedMantis.mantisRequestDate ?? ""}
                      onChange={(e) => setEditedMantis({ ...editedMantis, mantisRequestDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedMantis.mantisRequestDate || "-"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Target Date</label>
                  {isEditing && editedMantis ? (
                    <input
                      type="date"
                      value={editedMantis.mantisTargetDate ?? ""}
                      onChange={(e) => setEditedMantis({ ...editedMantis, mantisTargetDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedMantis.mantisTargetDate || "-"}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
                  {isEditing && editedMantis ? (
                    <TypeaheadTextarea
                      value={editedMantis.description}
                      onChange={(description) => setEditedMantis({ ...editedMantis, description })}
                      options={mantisDescriptionSuggestions}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedMantis.description}</p>
                  )}
                </div>
              </div>

              <div className={activeDetailTab === "linkedCases" ? "pt-1" : "hidden"}>
                <h3 className="font-semibold text-lg text-gray-900 mb-4">Linked Cases</h3>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3 mb-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Link case</label>
                      <SearchableSelect
                        label="case"
                        value={linkingCaseId}
                        options={availableCases.map((caseItem) => ({
                          value: caseItem.recordId,
                          label: formatRelatedCaseOption(caseItem, accounts, projects),
                          description: [caseItem.status, caseItem.priority].filter(Boolean).join(" | "),
                        }))}
                        emptyLabel="Select a case"
                        searchPlaceholder="Search account, project, or description"
                        onChange={setLinkingCaseId}
                      />
                    </div>
                    <CreateEntityDialog
                      entityType="case"
                      triggerLabel="New"
                      triggerTitle="Create case"
                      initialValues={{
                        mantisIds: [selectedMantis.recordId],
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
                <RecordHistoryTimeline history={selectedMantis.history} onQuote={setSelectedQuote} />
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
