import { useState } from "react";
import { ArrowLeft, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Download, Edit2, Save, Bookmark } from "lucide-react";
import { addAccountHistory, updateAccount, updateProject, type ProjectRecord } from "../data/apiClient";
import { DetailTabs } from "../components/DetailTabs";
import { LinkedCasesList, LinkedEntityList } from "../components/LinkedEntityCard";
import { CreateEntityDialog } from "../components/CreateEntityDialog";
import { RecordHistoryTimeline, formatHistoryEntryText } from "../components/RecordHistoryTimeline";
import { SearchableSelect } from "../components/SearchableSelect";
import { TableFieldSelector } from "../components/TableFieldSelector";
import { useLocation, useNavigate } from "react-router";
import { useSearch } from "../context/SearchContext";
import { useBookmarks } from "../context/BookmarksContext";
import { useAuth } from "../context/AuthContext";
import { useRecords } from "../context/RecordsContext";
import { useToast } from "../context/ToastContext";
import { accountTypes, accountVerticals, type AccountType, type AccountVertical } from "../data/accountOptions";
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

type AccountColumnKey = "accountName" | "type" | "vertical" | "website";
type AccountSearchKey = "accountName" | "type" | "vertical";

type AccountTableColumn = {
  key: AccountColumnKey;
  label: string;
  sortKey: AccountColumnKey;
  searchKey?: AccountSearchKey;
};

const ACCOUNT_TABLE_COLUMNS: AccountTableColumn[] = [
  { key: "accountName", label: "Account Name", sortKey: "accountName", searchKey: "accountName" },
  { key: "type", label: "Type", sortKey: "type", searchKey: "type" },
  { key: "vertical", label: "Vertical", sortKey: "vertical", searchKey: "vertical" },
  { key: "website", label: "Website", sortKey: "website" },
];

const DEFAULT_ACCOUNT_COLUMN_KEYS = ACCOUNT_TABLE_COLUMNS.map((column) => column.key);
const ACCOUNT_COLUMN_STORAGE_KEY = "accounts.visibleTableColumns";
const ACCOUNT_DETAIL_TABS = [
  { key: "details", label: "Details" },
  { key: "linkedCases", label: "Linked Cases" },
  { key: "linkedProjects", label: "Linked Projects" },
];
const RELATED_CREATE_BUTTON_CLASS = "inline-flex h-[42px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50";

function createProjectPayload(project: ProjectRecord, accountId: string | null) {
  return {
    projectName: project.projectName,
    accountId,
    startDate: project.startDate,
    closeDate: project.closeDate,
    seOwner: project.seOwner,
    isClosed: project.isClosed,
    stage: project.stage,
    sfdc: project.sfdc,
    sfdcValue: project.sfdcValue,
    metaData: project.metaData,
  };
}

export function Accounts() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { searchTerm } = useSearch();
  const { addBookmark, removeBookmark, isBookmarked } = useBookmarks();
  const { accounts, projects, cases, getAccountById, getProjectsByAccountId, upsertAccount, upsertProject } = useRecords();
  const {
    selectedRecord: selectedAccount,
    setSelectedRecord: setSelectedAccount,
    isEditing,
    editedRecord: editedAccount,
    setEditedRecord: setEditedAccount,
    activeDetailTab,
    setActiveDetailTab,
    handleBackFromDetail,
    handleEdit,
    handleCancelEdit,
    applySavedRecord,
  } = useRoutedEntityDetail({
    entityType: "account",
    getRecordById: getAccountById,
    resolveRouteRecordId: (routeParam) => resolveDetailRouteRecordId("account", routeParam, accounts),
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
    entityType: "account",
    entityRecordId: selectedAccount?.recordId,
    cases,
    entityLabel: "account",
    showToast,
  });
  const { newComment, setNewComment, selectedQuote, setSelectedQuote, isAddingComment, handleAddComment } = useRecordComments({
    selectedRecord: selectedAccount,
    setSelectedRecord: setSelectedAccount,
    addHistory: addAccountHistory,
    upsertRecord: upsertAccount,
    userName: user?.displayName,
    onError: (message) => showToast(message, "error"),
  });
  const [visibleAccountColumnKeys, setVisibleAccountColumnKeys] = useStoredColumnKeys<AccountColumnKey>(ACCOUNT_COLUMN_STORAGE_KEY, DEFAULT_ACCOUNT_COLUMN_KEYS);

  const [searchFilters, setSearchFilters] = useState({
    accountName: "",
    type: "",
    vertical: "",
  });
  const [linkingProjectId, setLinkingProjectId] = useState("");
  const [isLinkingProject, setIsLinkingProject] = useState(false);

  const [sortConfig, setSortConfig] = useState<SortConfig<AccountColumnKey>>({
    key: "",
    direction: null,
  });

  const handleCaseClick = (caseId: string) => {
    if (!selectedAccount?.recordId) return;

    navigate(createDetailPath("case", caseId), {
      state: createLinkedDetailState(
        "case",
        caseId,
        createDetailTarget("account", selectedAccount.recordId),
        (location.state as DetailRouteState | null) ?? null,
      ),
    });
  };

  const handleProjectClick = (projectId: string) => {
    if (!selectedAccount?.recordId) return;

    navigate(createDetailPath("project", projectId), {
      state: createLinkedDetailState(
        "project",
        projectId,
        createDetailTarget("account", selectedAccount.recordId),
        (location.state as DetailRouteState | null) ?? null,
      ),
    });
  };

  const handleSave = async () => {
    if (!editedAccount) return;

    try {
      const saved = await updateAccount(editedAccount.recordId, {
        accountName: editedAccount.accountName,
        website: editedAccount.website,
        type: editedAccount.type,
        vertical: editedAccount.vertical,
        metaData: editedAccount.metaData,
      });

      upsertAccount(saved);

      applySavedRecord(saved);
      showToast("Changes saved successfully!", "success");
    } catch (error) {
      console.error("Failed to save account:", error);
      showToast("Failed to save changes. Please try again.", "error");
    }
  };

  const handleLinkProject = async (projectId = linkingProjectId) => {
    if (!selectedAccount || !projectId) return;

    const project = projects.find((item) => item.recordId === projectId);
    if (!project) {
      showToast("Project not found.", "error");
      return;
    }

    setIsLinkingProject(true);
    try {
      const saved = await updateProject(project.recordId, createProjectPayload(project, selectedAccount.recordId));
      upsertProject(saved);
      setLinkingProjectId("");
      showToast("Project linked successfully.", "success");
    } catch (error) {
      console.error("Failed to link project to account:", error);
      showToast("Failed to link project.", "error");
    } finally {
      setIsLinkingProject(false);
    }
  };

  const handleSort = (key: AccountColumnKey) => {
    setSortConfig((current) => getNextSortConfig(current, key));
  };

  const handleToggleAccountColumn = (key: AccountColumnKey) => {
    const column = ACCOUNT_TABLE_COLUMNS.find((item) => item.key === key);
    const isCurrentlyVisible = visibleAccountColumnKeys.includes(key);
    const shouldHide = isCurrentlyVisible && visibleAccountColumnKeys.length > 1;

    if (shouldHide && column?.searchKey) {
      setSearchFilters((current) => ({ ...current, [column.searchKey!]: "" }));
    }

    if (shouldHide && sortConfig.key === key) {
      setSortConfig({ key: "", direction: null });
    }

    setVisibleAccountColumnKeys((current) => toggleColumnKey(current, key, DEFAULT_ACCOUNT_COLUMN_KEYS));
  };

  const handleResetAccountColumns = () => {
    setVisibleAccountColumnKeys(DEFAULT_ACCOUNT_COLUMN_KEYS);
  };

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const filteredAccounts = accounts.filter((account) => {
    if (normalizedSearchTerm) {
      const matchesGlobalSearch = [
        account.accountName,
        account.type,
        account.vertical,
        account.website,
      ].some((value) => (value ?? "").toLowerCase().includes(normalizedSearchTerm));

      if (!matchesGlobalSearch) return false;
    }

    if (searchFilters.accountName && !account.accountName.toLowerCase().includes(searchFilters.accountName.toLowerCase())) return false;
    if (searchFilters.type && !(account.type ?? "").toLowerCase().includes(searchFilters.type.toLowerCase())) return false;
    if (searchFilters.vertical && !(account.vertical ?? "").toLowerCase().includes(searchFilters.vertical.toLowerCase())) return false;
    return true;
  });

  const sortedAccounts = [...filteredAccounts].sort((a, b) => {
    if (!sortConfig.direction || !sortConfig.key) return 0;
    return compareValues(a[sortConfig.key], b[sortConfig.key], sortConfig.direction);
  });

  const relatedProjects = selectedAccount ? getProjectsByAccountId(selectedAccount.recordId) : [];
  const availableProjects = selectedAccount
    ? projects.filter((project) => project.accountId !== selectedAccount.recordId)
    : projects;
  const visibleAccountColumns = ACCOUNT_TABLE_COLUMNS.filter((column) => visibleAccountColumnKeys.includes(column.key));
  const detailGridClassName = activeDetailTab === "details"
    ? `grid grid-cols-1 gap-3 sm:grid-cols-2 ${
        isEditing
          ? ""
          : "[&>div]:flex [&>div]:min-w-0 [&>div]:items-baseline [&>div]:gap-x-2 [&>div]:gap-y-1 [&>div]:rounded-lg [&>div]:border [&>div]:border-gray-100 [&>div]:bg-gray-50 [&>div]:px-3 [&>div]:py-2 [&_label]:mb-0 [&_label]:shrink-0 [&_label]:font-semibold [&_label]:after:content-[':'] [&_p]:min-w-0 [&_p]:flex-1 [&_p]:break-words [&_a]:min-w-0 [&_a]:break-all"
      }`
    : "hidden";
  const textValue = (value: unknown) => value === null || value === undefined || value === "" ? "-" : String(value);

  const handleExportCsv = () => {
    exportRowsToCsv(
      "accounts",
      sortedAccounts,
      visibleAccountColumns.map((column) => ({
        label: column.label,
        value: (account) => textValue(account[column.key]),
      })),
    );
  };

  const renderSortIcon = (key: AccountColumnKey) => {
    if (sortConfig.key !== key || !sortConfig.direction) {
      return <ArrowUpDown className="w-4 h-4" />;
    }

    return sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />;
  };

  const renderColumnHeader = (column: AccountTableColumn) => (
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

  const renderColumnCell = (account: typeof accounts[0], column: AccountTableColumn) => {
    switch (column.key) {
      case "accountName":
        return <td key={column.key} className="px-6 py-4 text-sm font-medium text-gray-900">{account.accountName}</td>;
      case "type":
        return <td key={column.key} className="px-6 py-4 text-sm text-gray-700">{textValue(account.type)}</td>;
      case "vertical":
        return <td key={column.key} className="px-6 py-4 text-sm text-gray-700">{textValue(account.vertical)}</td>;
      case "website":
        return (
          <td key={column.key} className="px-6 py-4 text-sm">
            {account.website ? (
              <a href={account.website} target="_blank" rel="noopener noreferrer" className="text-[#E31937] hover:underline flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {account.website}
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="text-gray-500">-</span>
            )}
          </td>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Customer Accounts</h1>
        <p className="text-gray-600 mt-1">Manage Fortinet customer accounts and organizations</p>
      </div>

      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${selectedAccount ? "hidden" : ""}`}>
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Account Records</h2>
            <p className="text-sm text-gray-500">{visibleAccountColumns.length} of {ACCOUNT_TABLE_COLUMNS.length} fields shown</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={sortedAccounts.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <CreateEntityDialog
              entityType="account"
              onCreated={(account) => navigate(createDetailPath("account", account.recordId))}
            />
            <TableFieldSelector
              columns={ACCOUNT_TABLE_COLUMNS}
              visibleKeys={visibleAccountColumnKeys}
              onToggle={handleToggleAccountColumn}
              onReset={handleResetAccountColumns}
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
                {visibleAccountColumns.map(renderColumnHeader)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedAccounts.map((account) => (
                <tr
                  key={account.recordId}
                  onClick={() => navigate(createDetailPath("account", account.recordId))}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isBookmarked(account.recordId, 'account')) {
                          removeBookmark(account.recordId, 'account');
                        } else {
                          addBookmark({
                            id: account.recordId,
                            type: 'account',
                            title: account.accountName,
                            subtitle: account.vertical ?? undefined,
                            timestamp: Date.now(),
                          });
                        }
                      }}
                      className="text-gray-400 hover:text-yellow-500 transition-colors"
                      title="Bookmark"
                    >
                      <Bookmark className={`w-5 h-5 ${isBookmarked(account.recordId, 'account') ? 'fill-yellow-400 text-yellow-500' : ''}`} />
                    </button>
                  </td>
                  {visibleAccountColumns.map((column) => renderColumnCell(account, column))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedAccount && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="w-full">
            <div className="sticky top-[-1.5rem] z-10 bg-white border-b border-gray-200 p-6 flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-semibold text-gray-900">Account Details</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (isBookmarked(selectedAccount!.recordId, 'account')) {
                      removeBookmark(selectedAccount!.recordId, 'account');
                    } else {
                      addBookmark({
                        id: selectedAccount!.recordId,
                        type: 'account',
                        title: selectedAccount!.accountName,
                        subtitle: selectedAccount!.vertical ?? undefined,
                        timestamp: Date.now(),
                      });
                    }
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    isBookmarked(selectedAccount!.recordId, 'account')
                      ? 'bg-yellow-100 text-yellow-600'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Bookmark this account"
                >
                  <Bookmark className={`w-5 h-5 ${isBookmarked(selectedAccount!.recordId, 'account') ? 'fill-current' : ''}`} />
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
              <DetailTabs tabs={ACCOUNT_DETAIL_TABS} activeTab={activeDetailTab} onChange={setActiveDetailTab} />

              <div className={detailGridClassName}>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Account Name</label>
                  {isEditing && editedAccount ? (
                    <input
                      type="text"
                      value={editedAccount.accountName}
                      onChange={(e) => setEditedAccount({ ...editedAccount, accountName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900 font-medium">{selectedAccount.accountName}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Type</label>
                  {isEditing && editedAccount ? (
                    <select
                      value={editedAccount.type ?? ""}
                      onChange={(e) => setEditedAccount({ ...editedAccount, type: e.target.value ? e.target.value as AccountType : null })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">No type</option>
                      {accountTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-gray-900">{textValue(selectedAccount.type)}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Vertical</label>
                  {isEditing && editedAccount ? (
                    <select
                      value={editedAccount.vertical ?? ""}
                      onChange={(e) => setEditedAccount({ ...editedAccount, vertical: e.target.value ? e.target.value as AccountVertical : null })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">No vertical</option>
                      {accountVerticals.map((vertical) => (
                        <option key={vertical} value={vertical}>
                          {vertical}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-gray-900">{textValue(selectedAccount.vertical)}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Website</label>
                  {isEditing && editedAccount ? (
                    <input
                      type="url"
                      value={editedAccount.website ?? ""}
                      onChange={(e) => setEditedAccount({ ...editedAccount, website: e.target.value || null })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      placeholder="https://example.com"
                    />
                  ) : selectedAccount.website ? (
                    <a href={selectedAccount.website} target="_blank" rel="noopener noreferrer" className="text-[#E31937] hover:underline flex items-center gap-1">
                      {selectedAccount.website}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ) : (
                    <p className="text-gray-900">-</p>
                  )}
                </div>
              </div>

              <div className={activeDetailTab === "linkedCases" ? "pt-1" : "hidden"}>
                <h3 className="font-semibold text-lg text-gray-900 mb-4">Linked Cases</h3>
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
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
                      <button
                        type="button"
                        onClick={handleLinkCase}
                        disabled={!linkingCaseId || isLinkingCase}
                        className="px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Link Case
                      </button>
                      <CreateEntityDialog
                        entityType="case"
                        triggerLabel="New"
                        triggerTitle="Create case"
                        initialValues={{
                          account: selectedAccount.recordId,
                        }}
                        className={RELATED_CREATE_BUTTON_CLASS}
                        onCreated={(created) => {
                          void linkCase(created.recordId);
                        }}
                      />
                    </div>
                  </div>

                  <LinkedCasesList cases={linkedCases} onCaseClick={handleCaseClick} onRemoveCase={handleUnlinkCase} />
                </div>
              </div>

              <div className={activeDetailTab === "linkedProjects" ? "pt-1" : "hidden"}>
                <h3 className="font-semibold text-lg text-gray-900 mb-4">Linked Projects</h3>
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Link project</label>
                        <SearchableSelect
                          label="project"
                          value={linkingProjectId}
                          options={availableProjects.map((project) => ({
                            value: project.recordId,
                            label: project.projectName,
                            description: project.stage,
                          }))}
                          emptyLabel="Select a project"
                          searchPlaceholder="Search projects"
                          onChange={setLinkingProjectId}
                        />
                      </div>
                      <CreateEntityDialog
                        entityType="project"
                        triggerLabel="New"
                        triggerTitle="Create project"
                        initialValues={{
                          accountId: selectedAccount.recordId,
                        }}
                        hideLinkedCaseSelect
                        className={RELATED_CREATE_BUTTON_CLASS}
                        onCreated={(created) => {
                          upsertProject(created);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void handleLinkProject()}
                        disabled={!linkingProjectId || isLinkingProject}
                        className="px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Link Project
                      </button>
                    </div>
                  </div>

                  <LinkedEntityList
                    title="Linked Projects"
                    entities={relatedProjects}
                    fields={[
                      { label: "Name", key: "projectName" },
                      { label: "Stage", key: "stage" },
                      { label: "Value", key: "sfdcValue" },
                    ]}
                    onEntityClick={handleProjectClick}
                  />
                </div>
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
                <RecordHistoryTimeline history={selectedAccount.history} onQuote={setSelectedQuote} />
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
