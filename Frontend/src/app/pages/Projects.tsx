import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown, Download, Edit2, ExternalLink, Save, Bookmark, Trash2 } from "lucide-react";
import { addProjectHistory, deleteProject, listAssignableUsers, updateProject, type AssignableUser, type ProjectRecord } from "../data/apiClient";
import { DetailTabs } from "../components/DetailTabs";
import { LinkedEntityList, LinkedCasesList } from "../components/LinkedEntityCard";
import { CreateEntityDialog } from "../components/CreateEntityDialog";
import { RecordHistoryTimeline, formatHistoryEntryText } from "../components/RecordHistoryTimeline";
import { SearchableSelect } from "../components/SearchableSelect";
import { TypeaheadInput } from "../components/TypeaheadInput";
import { TableFieldSelector } from "../components/TableFieldSelector";
import { PageGuide } from "../components/PageGuide";
import { useLocation, useNavigate } from "react-router";
import { useSearch } from "../context/SearchContext";
import { useBookmarks } from "../context/BookmarksContext";
import { useAuth } from "../context/AuthContext";
import { useRecords } from "../context/RecordsContext";
import { useRecordReadState } from "../context/RecordReadContext";
import { useToast } from "../context/ToastContext";
import { projectStages } from "../data/projectOptions";
import { projectGuideSteps } from "../data/pageGuides";
import { projectStageColors } from "../data/recordStyles";
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
import { isActiveAssignableUser, isSeOwnerRole, toAssignableUserOption } from "../utils/assignableUsers";
import { formatUsdInteger, parseUsdIntegerInput } from "../utils/currency";
import { formatTimestampMinute } from "../utils/dateTime";
import { fieldSuggestions } from "../utils/typeaheadOptions";
import { getRecordActivityTimestamp } from "../utils/recordActivity";
import { unreadRowClassName } from "../utils/unreadRows";

type ProjectColumnKey = "projectName" | "account" | "startDate" | "closeDate" | "seOwner" | "isClosed" | "stage" | "sfdc" | "sfdcValue";
type ProjectSearchKey = "projectName" | "account" | "seOwner";

type ProjectTableColumn = {
  key: ProjectColumnKey;
  label: string;
  sortKey: ProjectColumnKey;
  searchKey?: ProjectSearchKey;
};

const PROJECT_TABLE_COLUMNS: ProjectTableColumn[] = [
  { key: "projectName", label: "Project Name", sortKey: "projectName", searchKey: "projectName" },
  { key: "account", label: "Account", sortKey: "account", searchKey: "account" },
  { key: "startDate", label: "Start Date", sortKey: "startDate" },
  { key: "closeDate", label: "Close Date", sortKey: "closeDate" },
  { key: "seOwner", label: "SE Owner", sortKey: "seOwner", searchKey: "seOwner" },
  { key: "isClosed", label: "Is Closed?", sortKey: "isClosed" },
  { key: "stage", label: "Stage", sortKey: "stage" },
  { key: "sfdc", label: "SFDC", sortKey: "sfdc" },
  { key: "sfdcValue", label: "SFDC Value (USD)", sortKey: "sfdcValue" },
];

const DEFAULT_PROJECT_COLUMN_KEYS = PROJECT_TABLE_COLUMNS.map((column) => column.key);
const PROJECT_COLUMN_STORAGE_KEY = "projects.visibleTableColumns";
const RELATED_CREATE_BUTTON_CLASS = "inline-flex h-[42px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50";
const SALESFORCE_URL_PREFIX = "https://fortinet.my.salesforce.com/";
const PROJECT_DETAIL_TABS = [
  { key: "details", label: "Details" },
  { key: "linkedAccounts", label: "Linked Accounts" },
  { key: "linkedCases", label: "Linked Cases" },
];

function createProjectPayload(project: ProjectRecord) {
  return {
    projectName: project.projectName,
    accountId: project.accountId,
    startDate: project.startDate,
    closeDate: project.closeDate,
    seOwner: project.seOwner,
    isClosed: project.isClosed,
    stage: project.stage,
    sfdc: project.sfdc,
    sfdcValue: typeof project.sfdcValue === "number"
      ? project.sfdcValue
      : parseUsdIntegerInput(String(project.sfdcValue ?? "")),
    metaData: project.metaData,
  };
}

function buildSalesforceUrl(sfdc: string | null | undefined) {
  const trimmed = sfdc?.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${SALESFORCE_URL_PREFIX}${encodeURIComponent(trimmed)}`;
}

export function Projects() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { addBookmark, removeBookmark, isBookmarked } = useBookmarks();
  const { isRecordUnread, markRecordRead } = useRecordReadState();
  const { searchTerm } = useSearch();
  const { accounts, projects, cases, getAccountById, getProjectById, upsertProject, removeProject, refreshRecords } = useRecords();
  const {
    selectedRecord: selectedProject,
    setSelectedRecord: setSelectedProject,
    isEditing,
    editedRecord: editedProject,
    setEditedRecord: setEditedProject,
    activeDetailTab,
    setActiveDetailTab,
    handleBackFromDetail,
    handleEdit,
    handleCancelEdit,
    applySavedRecord,
  } = useRoutedEntityDetail({
    entityType: "project",
    getRecordById: getProjectById,
    resolveRouteRecordId: (routeParam) => resolveDetailRouteRecordId("project", routeParam, projects),
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
    entityType: "project",
    entityRecordId: selectedProject?.recordId,
    cases,
    entityLabel: "project",
    showToast,
  });
  const { newComment, setNewComment, selectedQuote, setSelectedQuote, isAddingComment, handleAddComment } = useRecordComments({
    selectedRecord: selectedProject,
    setSelectedRecord: setSelectedProject,
    addHistory: addProjectHistory,
    upsertRecord: upsertProject,
    userName: user?.displayName,
    onError: (message) => showToast(message, "error"),
  });
  const selectedProjectActivityAt = getRecordActivityTimestamp(selectedProject);
  const projectNameSuggestions = useMemo(
    () => fieldSuggestions(projects, "projectName", selectedProject?.recordId),
    [projects, selectedProject?.recordId],
  );
  const projectSfdcSuggestions = useMemo(
    () => fieldSuggestions(projects, "sfdc", selectedProject?.recordId),
    [projects, selectedProject?.recordId],
  );
  const projectSfdcValueSuggestions = useMemo(
    () => fieldSuggestions(projects, "sfdcValue", selectedProject?.recordId),
    [projects, selectedProject?.recordId],
  );

  useEffect(() => {
    if (!selectedProject) return;
    void markRecordRead("project", selectedProject.recordId);
  }, [markRecordRead, selectedProject?.recordId, selectedProjectActivityAt]);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [visibleProjectColumnKeys, setVisibleProjectColumnKeys] = useStoredColumnKeys<ProjectColumnKey>(PROJECT_COLUMN_STORAGE_KEY, DEFAULT_PROJECT_COLUMN_KEYS);
  const [linkingAccountId, setLinkingAccountId] = useState("");
  const [isLinkingAccount, setIsLinkingAccount] = useState(false);

  const [searchFilters, setSearchFilters] = useState({
    projectName: "",
    account: "",
    seOwner: "",
  });

  const [sortConfig, setSortConfig] = useState<SortConfig<ProjectColumnKey>>({
    key: "",
    direction: null,
  });
  const activeAssignableUsers = useMemo(() => assignableUsers.filter(isActiveAssignableUser), [assignableUsers]);
  const seOwnerSelectOptions = useMemo(
    () => activeAssignableUsers.filter((assignableUser) => isSeOwnerRole(assignableUser.role)).map(toAssignableUserOption),
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

  const handleAccountClick = (accountId: string) => {
    if (!selectedProject?.recordId) return;

    navigate(createDetailPath("account", accountId), {
      state: createLinkedDetailState(
        "account",
        accountId,
        createDetailTarget("project", selectedProject.recordId),
        (location.state as DetailRouteState | null) ?? null,
      ),
    });
  };

  const handleCaseClick = (caseId: string) => {
    if (!selectedProject?.recordId) return;

    navigate(createDetailPath("case", caseId), {
      state: createLinkedDetailState(
        "case",
        caseId,
        createDetailTarget("project", selectedProject.recordId),
        (location.state as DetailRouteState | null) ?? null,
      ),
    });
  };

  const handleSave = async () => {
    if (!editedProject) return;

    try {
      const saved = await updateProject(editedProject.recordId, {
        ...createProjectPayload(editedProject),
      });

      upsertProject(saved);

      applySavedRecord(saved);
      showToast("Changes saved successfully!", "success");
    } catch (error) {
      console.error("Failed to save project:", error);
      showToast("Failed to save changes. Please try again.", "error");
    }
  };

  const canDeleteRecords = user?.role === "manager" || user?.role === "admin";

  const handleDelete = async () => {
    if (!selectedProject) return;
    const confirmed = window.confirm(`Delete project "${selectedProject.projectName}"? Linked cases will be detached.`);
    if (!confirmed) return;

    try {
      await deleteProject(selectedProject.recordId);
      removeBookmark(selectedProject.recordId, "project");
      removeProject(selectedProject.recordId);
      setSelectedProject(null);
      await refreshRecords();
      showToast("Project deleted.", "success");
      navigate("/projects");
    } catch (error) {
      console.error("Failed to delete project:", error);
      showToast(error instanceof Error ? error.message : "Failed to delete project.", "error");
    }
  };

  const handleLinkAccount = async (accountId = linkingAccountId) => {
    if (!selectedProject || !accountId) return;

    setIsLinkingAccount(true);
    try {
      const saved = await updateProject(selectedProject.recordId, {
        ...createProjectPayload(selectedProject),
        accountId,
      });

      upsertProject(saved);
      setSelectedProject(saved);
      if (editedProject?.recordId === saved.recordId) {
        setEditedProject(saved);
      }
      setLinkingAccountId("");
      showToast("Account linked successfully.", "success");
    } catch (error) {
      console.error("Failed to link account to project:", error);
      showToast("Failed to link account.", "error");
    } finally {
      setIsLinkingAccount(false);
    }
  };

  const handleSort = (key: ProjectColumnKey) => {
    setSortConfig((current) => getNextSortConfig(current, key));
  };

  const handleToggleProjectColumn = (key: ProjectColumnKey) => {
    const column = PROJECT_TABLE_COLUMNS.find((item) => item.key === key);
    const isCurrentlyVisible = visibleProjectColumnKeys.includes(key);
    const shouldHide = isCurrentlyVisible && visibleProjectColumnKeys.length > 1;

    if (shouldHide && column?.searchKey) {
      setSearchFilters((current) => ({ ...current, [column.searchKey!]: "" }));
    }

    if (shouldHide && sortConfig.key === key) {
      setSortConfig({ key: "", direction: null });
    }

    setVisibleProjectColumnKeys((current) => toggleColumnKey(current, key, DEFAULT_PROJECT_COLUMN_KEYS));
  };

  const handleResetProjectColumns = () => {
    setVisibleProjectColumnKeys(DEFAULT_PROJECT_COLUMN_KEYS);
  };

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const filteredProjects = projects.filter((project) => {
    if (normalizedSearchTerm) {
      const matchesGlobalSearch = [
        project.projectName,
        getAccountById(project.accountId)?.accountName,
        project.startDate,
        project.closeDate,
        project.seOwner,
        project.isClosed ? "yes" : "no",
        project.stage,
        project.sfdc,
        project.sfdcValue,
      ].some((value) => String(value ?? "").toLowerCase().includes(normalizedSearchTerm));

      if (!matchesGlobalSearch) return false;
    }

    if (searchFilters.projectName && !project.projectName.toLowerCase().includes(searchFilters.projectName.toLowerCase())) return false;
    if (searchFilters.account) {
      const account = getAccountById(project.accountId);
      if (!account?.accountName.toLowerCase().includes(searchFilters.account.toLowerCase())) return false;
    }
    if (searchFilters.seOwner && !(project.seOwner ?? "").toLowerCase().includes(searchFilters.seOwner.toLowerCase())) return false;
    return true;
  });

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (!sortConfig.direction || !sortConfig.key) return 0;

    let aValue: unknown = "";
    let bValue: unknown = "";

    switch (sortConfig.key) {
      case "account":
        aValue = getAccountById(a.accountId)?.accountName || "";
        bValue = getAccountById(b.accountId)?.accountName || "";
        break;
      default:
        aValue = a[sortConfig.key as keyof typeof a] || "";
        bValue = b[sortConfig.key as keyof typeof b] || "";
    }

    return compareValues(aValue, bValue, sortConfig.direction);
  });

  const account = selectedProject ? getAccountById(selectedProject.accountId) : null;
  const availableAccounts = selectedProject
    ? accounts.filter((item) => item.recordId !== selectedProject.accountId)
    : accounts;
  const visibleProjectColumns = PROJECT_TABLE_COLUMNS.filter((column) => visibleProjectColumnKeys.includes(column.key));
  const detailGridClassName = activeDetailTab === "details"
    ? `grid grid-cols-1 gap-3 sm:grid-cols-2 ${
        isEditing
          ? ""
          : "[&>div]:flex [&>div]:min-w-0 [&>div]:items-baseline [&>div]:gap-x-2 [&>div]:gap-y-1 [&>div]:rounded-lg [&>div]:border [&>div]:border-gray-100 [&>div]:bg-gray-50 [&>div]:px-3 [&>div]:py-2 [&_label]:mb-0 [&_label]:shrink-0 [&_label]:font-semibold [&_label]:after:content-[':'] [&_p]:min-w-0 [&_p]:flex-1 [&_p]:break-words [&_a]:min-w-0 [&_a]:flex-1 [&_a]:break-all"
      }`
    : "hidden";

  const textValue = (value: unknown) => value === null || value === undefined || value === "" ? "-" : String(value);
  const closedText = (value: boolean | number | null | undefined) => value ? "Yes" : "No";

  const getProjectExportValue = (project: ProjectRecord, key: ProjectColumnKey) => {
    switch (key) {
      case "account":
        return getAccountById(project.accountId)?.accountName || "";
      case "isClosed":
        return closedText(project.isClosed);
      case "sfdcValue":
        return formatUsdInteger(project.sfdcValue);
      default:
        return textValue(project[key]);
    }
  };

  const handleExportCsv = () => {
    exportRowsToCsv(
      "projects",
      sortedProjects,
      visibleProjectColumns.map((column) => ({
        label: column.label,
        value: (project) => getProjectExportValue(project, column.key),
      })),
    );
  };

  const renderSortIcon = (key: ProjectColumnKey) => {
    if (sortConfig.key !== key || !sortConfig.direction) {
      return <ArrowUpDown className="w-4 h-4" />;
    }

    return sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />;
  };

  const renderColumnHeader = (column: ProjectTableColumn) => (
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

  const renderColumnCell = (project: typeof projects[0], column: ProjectTableColumn) => {
    switch (column.key) {
      case "projectName":
        return <td key={column.key} className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">{project.projectName}</td>;
      case "account":
        return <td key={column.key} className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{getAccountById(project.accountId)?.accountName || "-"}</td>;
      case "startDate":
        return <td key={column.key} className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{textValue(project.startDate)}</td>;
      case "closeDate":
        return <td key={column.key} className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{textValue(project.closeDate)}</td>;
      case "seOwner":
        return <td key={column.key} className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{textValue(project.seOwner)}</td>;
      case "isClosed":
        return (
          <td key={column.key} className="px-6 py-4">
            <span className={`inline-flex whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium ${project.isClosed ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
              {closedText(project.isClosed)}
            </span>
          </td>
        );
      case "stage":
        return (
          <td key={column.key} className="px-6 py-4">
            <span className={`inline-flex whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium ${projectStageColors[project.stage || ""] ?? "bg-gray-100 text-gray-700"}`}>
              {textValue(project.stage)}
            </span>
          </td>
        );
      case "sfdc":
        return (
          <td key={column.key} className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">
            {buildSalesforceUrl(project.sfdc) ? (
              <a
                href={buildSalesforceUrl(project.sfdc)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#E31937] hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                {project.sfdc}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              textValue(project.sfdc)
            )}
          </td>
        );
      case "sfdcValue":
        return <td key={column.key} className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">{formatUsdInteger(project.sfdcValue)}</td>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div data-guide-id="projects-intro">
          <h1 className="text-2xl font-bold text-gray-900">Customer Projects</h1>
          <p className="text-gray-600 mt-1">Track Fortinet customer projects and implementations</p>
        </div>
        <PageGuide label="Projects" steps={projectGuideSteps} />
      </div>

      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${selectedProject ? "hidden" : ""}`}>
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Project Records</h2>
            <p className="text-sm text-gray-500">{visibleProjectColumns.length} of {PROJECT_TABLE_COLUMNS.length} fields shown</p>
          </div>
          <div data-guide-id="projects-actions" className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={sortedProjects.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <CreateEntityDialog
              entityType="project"
              onCreated={(project) => navigate(createDetailPath("project", project.recordId))}
            />
            <TableFieldSelector
              columns={PROJECT_TABLE_COLUMNS}
              visibleKeys={visibleProjectColumnKeys}
              onToggle={handleToggleProjectColumn}
              onReset={handleResetProjectColumns}
            />
          </div>
        </div>
        <div data-guide-id="projects-table" className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 w-12">
                  <Bookmark className="h-4 w-4 text-gray-500" aria-label="Bookmark" />
                </th>
                {visibleProjectColumns.map(renderColumnHeader)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedProjects.map((project) => (
                <tr
                  key={project.recordId}
                  onClick={() => navigate(createDetailPath("project", project.recordId))}
                  className={unreadRowClassName(isRecordUnread("project", project.recordId, getRecordActivityTimestamp(project)))}
                >
                  <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isBookmarked(project.recordId, 'project')) {
                          removeBookmark(project.recordId, 'project');
                        } else {
                          addBookmark({
                            id: project.recordId,
                            type: 'project',
                            title: project.projectName,
                            subtitle: project.stage,
                            timestamp: Date.now(),
                          });
                        }
                      }}
                      className="text-gray-400 hover:text-yellow-500 transition-colors"
                      title="Bookmark"
                    >
                      <Bookmark className={`w-5 h-5 ${isBookmarked(project.recordId, 'project') ? 'fill-yellow-400 text-yellow-500' : ''}`} />
                    </button>
                  </td>
                  {visibleProjectColumns.map((column) => renderColumnCell(project, column))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedProject && (
        <div data-guide-id="projects-detail" className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="w-full">
            <div className="sticky top-[-1.5rem] z-10 bg-white border-b border-gray-200 p-6 flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-semibold text-gray-900">Project Details</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (isBookmarked(selectedProject!.recordId, 'project')) {
                      removeBookmark(selectedProject!.recordId, 'project');
                    } else {
                      addBookmark({
                        id: selectedProject!.recordId,
                        type: 'project',
                        title: selectedProject!.projectName,
                        subtitle: selectedProject!.stage,
                        timestamp: Date.now(),
                      });
                    }
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    isBookmarked(selectedProject!.recordId, 'project')
                      ? 'bg-yellow-100 text-yellow-600'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Bookmark this project"
                >
                  <Bookmark className={`w-5 h-5 ${isBookmarked(selectedProject!.recordId, 'project') ? 'fill-current' : ''}`} />
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
              <DetailTabs tabs={PROJECT_DETAIL_TABS} activeTab={activeDetailTab} onChange={setActiveDetailTab} />

              <div className={detailGridClassName}>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Project Name</label>
                  {isEditing && editedProject ? (
                    <TypeaheadInput
                      type="text"
                      value={editedProject.projectName}
                      onChange={(projectName) => setEditedProject({ ...editedProject, projectName })}
                      options={projectNameSuggestions}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900 font-medium">{selectedProject.projectName}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Account</label>
                  {isEditing && editedProject ? (
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <SearchableSelect
                          label="account"
                          value={editedProject.accountId ?? ""}
                          options={accounts.map((item) => ({
                            value: item.recordId,
                            label: item.accountName,
                            description: [item.type, item.vertical].filter(Boolean).join(" | "),
                          }))}
                          emptyLabel="No account"
                          searchPlaceholder="Search accounts"
                          onChange={(accountId) => setEditedProject({ ...editedProject, accountId: accountId || null })}
                        />
                      </div>
                      <CreateEntityDialog
                        entityType="account"
                        triggerLabel="New"
                        triggerTitle="Create account"
                        hideLinkedCaseSelect
                        className={RELATED_CREATE_BUTTON_CLASS}
                        onCreated={(created) => {
                          setEditedProject((current) => current ? { ...current, accountId: created.recordId } : current);
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-gray-900">{textValue(account?.accountName || selectedProject.accountId)}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Start Date</label>
                  {isEditing && editedProject ? (
                    <input
                      type="date"
                      value={editedProject.startDate ?? ""}
                      onChange={(e) => setEditedProject({ ...editedProject, startDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{textValue(selectedProject.startDate)}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Close Date</label>
                  {isEditing && editedProject ? (
                    <input
                      type="date"
                      value={editedProject.closeDate ?? ""}
                      onChange={(e) => setEditedProject({ ...editedProject, closeDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{textValue(selectedProject.closeDate)}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">SE Owner</label>
                  {isEditing && editedProject ? (
                    <SearchableSelect
                      label="SE owner"
                      value={editedProject.seOwner ?? ""}
                      options={seOwnerSelectOptions}
                      emptyLabel="No SE owner"
                      searchPlaceholder="Search users"
                      onChange={(seOwner) => setEditedProject({ ...editedProject, seOwner })}
                    />
                  ) : (
                    <p className="text-gray-900">{textValue(selectedProject.seOwner)}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Is Closed?</label>
                  {isEditing && editedProject ? (
                    <div className="grid grid-cols-2 rounded-lg border border-gray-300 bg-white p-1 text-sm">
                      {[
                        { label: "No", value: false },
                        { label: "Yes", value: true },
                      ].map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => setEditedProject({ ...editedProject, isClosed: option.value })}
                          className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                            editedProject.isClosed === option.value
                              ? "bg-[#E31937] text-white"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-900">{closedText(selectedProject.isClosed)}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Stage</label>
                  {isEditing && editedProject ? (
                    <select
                      value={editedProject.stage ?? ""}
                      onChange={(e) => setEditedProject({ ...editedProject, stage: e.target.value as typeof projectStages[number] })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      {projectStages.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${projectStageColors[selectedProject.stage || ""] ?? "bg-gray-100 text-gray-700"}`}>
                      {textValue(selectedProject.stage)}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">SFDC</label>
                  {isEditing && editedProject ? (
                    <TypeaheadInput
                      type="text"
                      value={editedProject.sfdc ?? ""}
                      onChange={(sfdc) => setEditedProject({ ...editedProject, sfdc })}
                      options={projectSfdcSuggestions}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    buildSalesforceUrl(selectedProject.sfdc) ? (
                      <a
                        href={buildSalesforceUrl(selectedProject.sfdc)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#E31937] hover:underline"
                      >
                        {selectedProject.sfdc}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ) : (
                      <p className="text-gray-900">{textValue(selectedProject.sfdc)}</p>
                    )
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">SFDC Value (USD)</label>
                  {isEditing && editedProject ? (
                    <TypeaheadInput
                      type="text"
                      value={editedProject.sfdcValue === null || editedProject.sfdcValue === undefined ? "" : String(editedProject.sfdcValue)}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      onChange={(sfdcValue) => setEditedProject({ ...editedProject, sfdcValue: parseUsdIntegerInput(sfdcValue) })}
                      options={projectSfdcValueSuggestions}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900 font-medium">{formatUsdInteger(selectedProject.sfdcValue)}</p>
                  )}
                </div>
              </div>

              <div className={activeDetailTab === "linkedAccounts" ? "pt-1" : "hidden"}>
                <h3 className="font-semibold text-lg text-gray-900 mb-4">Linked Accounts</h3>
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end">
                      <div className="min-w-0 flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Link account</label>
                        <SearchableSelect
                          label="account"
                          value={linkingAccountId}
                          options={availableAccounts.map((item) => ({
                            value: item.recordId,
                            label: item.accountName,
                            description: [item.type, item.vertical].filter(Boolean).join(" | "),
                          }))}
                          emptyLabel="Select an account"
                          searchPlaceholder="Search accounts"
                          onChange={setLinkingAccountId}
                        />
                      </div>
                      <CreateEntityDialog
                        entityType="account"
                        triggerLabel="New"
                        triggerTitle="Create account"
                        hideLinkedCaseSelect
                        className={RELATED_CREATE_BUTTON_CLASS}
                        onCreated={(created) => {
                          void handleLinkAccount(created.recordId);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void handleLinkAccount()}
                        disabled={!linkingAccountId || isLinkingAccount}
                        className="px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Link Account
                      </button>
                    </div>
                  </div>
                  <LinkedEntityList
                    title="Account"
                    entities={account ? [account] : []}
                    fields={[
                      { label: "Name", key: "accountName" },
                      { label: "Type", key: "type" },
                      { label: "Vertical", key: "vertical" },
                    ]}
                    onEntityClick={handleAccountClick}
                  />
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
                      <CreateEntityDialog
                        entityType="case"
                        triggerLabel="New"
                        triggerTitle="Create case"
                        initialValues={{
                          account: selectedProject.accountId ?? "",
                          project: selectedProject.recordId,
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
                <RecordHistoryTimeline history={selectedProject.history} onQuote={setSelectedQuote} />
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
