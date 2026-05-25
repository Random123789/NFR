import { useState } from "react";
import { useNavigate } from "react-router";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { AlertCircle, Briefcase, Building2, CalendarClock, ChevronDown, Clock3, DollarSign, Edit2, FolderKanban, Plus, Settings2, Target, Trash2, TrendingUp } from "lucide-react";
import { useRecords } from "../context/RecordsContext";
import { useAuth } from "../context/AuthContext";
import { casePriorityColors, caseStatusColors, knockStatusColors, mantisStatusColors, projectStageColors } from "../data/recordStyles";
import type { AccountRecord, CaseRecord, HistoryEntry, KnockRecord, MantisRecord, ProjectRecord } from "../data/apiClient";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Checkbox } from "../components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { accountVerticals, type AccountVertical } from "../data/accountOptions";
import { caseStatuses, casePriorities } from "../data/caseOptions";
import { createDetailPath } from "../navigation/detailNavigation";
import { formatUsdInteger } from "../utils/currency";

type CaseItem = CaseRecord;

function getMonthKey(dateString: string | null | undefined) {
  if (!dateString) return null;

  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return null;

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(monthKey: string) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  return new Date(year, month, 1).toLocaleString("en-US", { month: "short" });
}

function getCasePeople(caseItem: CaseItem) {
  return [
    caseItem.assignedTo?.trim(),
    caseItem.seOwner?.trim(),
    ...(caseItem.watcherNames ?? []).map((watcherName) => watcherName.trim()),
  ].filter(Boolean) as string[];
}

function caseMatchesOwnerFilter(caseItem: CaseItem, selectedOwners: string[]) {
  if (selectedOwners.length === 0) return true;

  const people = getCasePeople(caseItem);
  if (people.length === 0) {
    return selectedOwners.includes("Unassigned");
  }
  return people.some(p => selectedOwners.includes(p));
}

function buildActivityTrend(cases: CaseRecord[], accounts: AccountRecord[], projects: ProjectRecord[]) {
  const monthMap = new Map<string, { month: string; cases: number; accounts: number; projects: number }>();

  for (const caseItem of cases) {
    const monthKey = getMonthKey(caseItem.closeDate);
    if (!monthKey) continue;

    const bucket = monthMap.get(monthKey) ?? { month: getMonthLabel(monthKey), cases: 0, accounts: 0, projects: 0 };
    bucket.cases += 1;
    monthMap.set(monthKey, bucket);
  }

  for (const account of accounts) {
    const monthKey = getMonthKey(account.createdAt);
    if (!monthKey) continue;

    const bucket = monthMap.get(monthKey) ?? { month: getMonthLabel(monthKey), cases: 0, accounts: 0, projects: 0 };
    bucket.accounts += 1;
    monthMap.set(monthKey, bucket);
  }

  for (const project of projects) {
    const monthKey = getMonthKey(project.createdAt);
    if (!monthKey) continue;

    const bucket = monthMap.get(monthKey) ?? { month: getMonthLabel(monthKey), cases: 0, accounts: 0, projects: 0 };
    bucket.projects += 1;
    monthMap.set(monthKey, bucket);
  }

  const sortedMonths = [...monthMap.keys()].sort();
  const recentMonths = sortedMonths.slice(-4);

  return recentMonths.map((monthKey) => ({
    id: `activity-${monthKey}`,
    ...monthMap.get(monthKey)!,
  }));
}

export type CustomWidgetConfig = {
  id: string;
  title: string;
  daysToClose?: number | null;
  statusFilter?: string | null;
  priorityFilter?: string | null;
};

const CLOSED_CASE_STATUSES = new Set(["Closed-Resolved", "Closed-Dead"]);
const CLOSED_MANTIS_STATUSES = new Set(["resolved", "completed", "dead", "implemented", "rejected"]);
const CLOSED_KNOCK_STATUSES = new Set(["completed", "cancelled"]);
const CRITICAL_CASE_STATUS_FILTERS = ["Escalated"];
const CRITICAL_CASE_PRIORITY_FILTERS = ["High", "Very High"];
const OPEN_CASE_STATUS_FILTERS = caseStatuses.filter((status) => !CLOSED_CASE_STATUSES.has(status));

function isOpenCase(caseItem: CaseRecord) {
  return !CLOSED_CASE_STATUSES.has(caseItem.status ?? "");
}

function isOpenMantis(record: MantisRecord) {
  return !CLOSED_MANTIS_STATUSES.has((record.mantisStatus ?? "").trim().toLowerCase());
}

function isOpenKnock(record: KnockRecord) {
  return !CLOSED_KNOCK_STATUSES.has((record.status ?? "").trim().toLowerCase());
}

function priorityWeight(value: string | null | undefined) {
  if (value === "Very High") return 5;
  if (value === "High") return 4;
  if (value === "Medium") return 3;
  if (value === "Low") return 2;
  return 1;
}

function caseUrgencyScore(caseItem: CaseRecord) {
  const daysToClose = getDaysUntil(caseItem.closeDate);
  const deadlinePressure = daysToClose === null ? 0 : daysToClose < 0 ? 5 : daysToClose <= 7 ? 4 : daysToClose <= 14 ? 2 : 0;
  return (
    priorityWeight(caseItem.priority) +
    (caseItem.status === "Escalated" ? 6 : 0) +
    (caseItem.status === "New" ? 2 : 0) +
    deadlinePressure
  );
}

function isCaseOwnedBy(caseItem: CaseRecord, displayName: string | null | undefined) {
  const owner = (displayName ?? "").trim().toLowerCase();
  if (!owner) return false;
  return [caseItem.seOwner, caseItem.assignedTo].some((value) => (value ?? "").trim().toLowerCase() === owner);
}

function isCaseWatchedBy(caseItem: CaseRecord, displayName: string | null | undefined) {
  const watcher = (displayName ?? "").trim().toLowerCase();
  if (!watcher) return false;
  return (caseItem.watcherNames ?? []).some((value) => value.trim().toLowerCase() === watcher);
}

function getDaysUntil(dateString: string | null | undefined) {
  if (!dateString) return null;
  const target = new Date(dateString);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 3600 * 24));
}

type StatusAgingBucketId = "3m" | "6m" | "9m" | "12m";
type StatusAgingSort = "oldest" | "newest";

type StatusAgingCase = CaseRecord & {
  agingBucket: StatusAgingBucketId;
  statusAgeDays: number;
  statusSinceTimestamp: number;
  statusSinceLabel: string;
};

const DAY_MS = 1000 * 60 * 60 * 24;
const TRACKED_STATUS_AGE_STATUSES = new Set(["Acknowledged", "Escalated"]);
const STATUS_AGING_BUCKETS: Array<{ id: StatusAgingBucketId; label: string; detail: string; minDays: number; maxDays?: number }> = [
  { id: "3m", label: "3 months", detail: "90-179 days", minDays: 90, maxDays: 180 },
  { id: "6m", label: "6 months", detail: "180-269 days", minDays: 180, maxDays: 270 },
  { id: "9m", label: "9 months", detail: "270-364 days", minDays: 270, maxDays: 365 },
  { id: "12m", label: ">12 months", detail: "365+ days", minDays: 365 },
];

function parseHistoryTimestamp(value: string | null | undefined) {
  const text = (value ?? "").trim().replace("T", " ");
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

function getStatusEntryNewValue(entry: HistoryEntry) {
  const field = (entry.field ?? "").trim().toLowerCase();
  if (field === "status") {
    return entry.newValue ?? null;
  }

  const match = entry.changes?.match(/status changed from .* to (.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function getCurrentStatusSince(caseItem: CaseRecord) {
  const currentStatus = caseItem.status ?? "";
  if (!TRACKED_STATUS_AGE_STATUSES.has(currentStatus)) return null;

  const history = (caseItem.history ?? [])
    .map((entry, index) => ({
      entry,
      timestamp: parseHistoryTimestamp(entry.timestamp) + index,
    }))
    .filter(({ timestamp }) => timestamp > 0);

  const latestMatchingStatusEntry = [...history]
    .filter(({ entry }) => getStatusEntryNewValue(entry) === currentStatus)
    .sort((left, right) => right.timestamp - left.timestamp)[0];

  if (latestMatchingStatusEntry) {
    return latestMatchingStatusEntry.timestamp;
  }

  const earliestHistoryEntry = [...history].sort((left, right) => left.timestamp - right.timestamp)[0];
  return earliestHistoryEntry?.timestamp ?? null;
}

function getStatusAgingBucket(days: number) {
  return STATUS_AGING_BUCKETS.find((bucket) => days >= bucket.minDays && (bucket.maxDays === undefined || days < bucket.maxDays)) ?? null;
}

function buildStatusAgingCase(caseItem: CaseRecord): StatusAgingCase | null {
  const statusSinceTimestamp = getCurrentStatusSince(caseItem);
  if (!statusSinceTimestamp) return null;

  const statusAgeDays = Math.max(0, Math.floor((Date.now() - statusSinceTimestamp) / DAY_MS));
  const agingBucket = getStatusAgingBucket(statusAgeDays);
  if (!agingBucket) return null;

  return {
    ...caseItem,
    agingBucket: agingBucket.id,
    statusAgeDays,
    statusSinceTimestamp,
    statusSinceLabel: new Date(statusSinceTimestamp).toISOString().slice(0, 10),
  };
}

function formatStatusAge(days: number) {
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  const remainingDays = days % 30;
  return remainingDays > 0 ? `${months}mo ${remainingDays}d` : `${months}mo`;
}

function projectValue(project: ProjectRecord) {
  return typeof project.sfdcValue === "number" ? project.sfdcValue : 0;
}

function getAccountName(accounts: AccountRecord[], accountId: string | null | undefined) {
  return accounts.find((account) => account.recordId === accountId)?.accountName ?? "No account";
}

function getProjectName(projects: ProjectRecord[], projectId: string | null | undefined) {
  return projects.find((project) => project.recordId === projectId)?.projectName ?? "No project";
}

function getProjectForCase(projects: ProjectRecord[], caseItem: CaseRecord) {
  return projects.find((project) => project.recordId === caseItem.project);
}

function getAccountNamesForCase(accounts: AccountRecord[], caseItem: CaseRecord, project?: ProjectRecord) {
  const linkedAccountNames = (caseItem.accountIds ?? [])
    .map((accountId) => accounts.find((account) => account.recordId === accountId)?.accountName)
    .filter(Boolean);

  return linkedAccountNames.length > 0 ? linkedAccountNames.join(", ") : getAccountName(accounts, project?.accountId);
}

function formatDaysLabel(days: number | null) {
  if (days === null) return "No date";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  return `${days}d`;
}

function countLinkedCasesForMantis(cases: CaseRecord[], record: MantisRecord) {
  return cases.filter((caseItem) => (caseItem.mantisRecordIds ?? []).includes(record.recordId)).length;
}

function countLinkedCasesForKnock(cases: CaseRecord[], record: KnockRecord) {
  return cases.filter((caseItem) => (caseItem.knockRecordIds ?? []).includes(record.recordId)).length;
}

function ManagerHome() {
  const { cases, accounts, projects } = useRecords();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedVerticals, setSelectedVerticals] = useState<AccountVertical[]>([]);
  const [statusAgingBucketFilter, setStatusAgingBucketFilter] = useState<StatusAgingBucketId | "all">("all");
  const [statusAgingSort, setStatusAgingSort] = useState<StatusAgingSort>("oldest");

  const hasVerticalFilter = selectedVerticals.length > 0;
  const selectedVerticalSet = new Set<AccountVertical>(selectedVerticals);
  const accountsById = new Map(accounts.map((account) => [account.recordId, account]));
  const projectsById = new Map(projects.map((project) => [project.recordId, project]));
  const verticalFilterLabel = selectedVerticals.length === 0
    ? "All verticals"
    : selectedVerticals.length === 1
      ? selectedVerticals[0]
      : `${selectedVerticals.length} verticals`;

  const toggleVertical = (vertical: AccountVertical) => {
    setSelectedVerticals((current) =>
      current.includes(vertical)
        ? current.filter((selectedVertical) => selectedVertical !== vertical)
        : [...current, vertical]
    );
  };

  const projectMatchesVerticalFilter = (project: ProjectRecord) => {
    if (!hasVerticalFilter) return true;
    const account = project.accountId ? accountsById.get(project.accountId) : undefined;
    return Boolean(account?.vertical && selectedVerticalSet.has(account.vertical));
  };

  const caseMatchesVerticalFilter = (caseItem: CaseRecord) => {
    if (!hasVerticalFilter) return true;

    const hasMatchingLinkedAccount = (caseItem.accountIds ?? []).some((accountId) => {
      const vertical = accountsById.get(accountId)?.vertical;
      return Boolean(vertical && selectedVerticalSet.has(vertical));
    });
    if (hasMatchingLinkedAccount) return true;

    const project = caseItem.project ? projectsById.get(caseItem.project) : undefined;
    const projectAccount = project?.accountId ? accountsById.get(project.accountId) : undefined;
    return Boolean(projectAccount?.vertical && selectedVerticalSet.has(projectAccount.vertical));
  };

  const filteredCases = cases.filter(caseMatchesVerticalFilter);
  const filteredProjects = projects.filter(projectMatchesVerticalFilter);
  const openCases = filteredCases.filter(isOpenCase);
  const openProjects = filteredProjects.filter((project) => !project.isClosed);
  const managerDisplayName = (user?.displayName ?? "").trim();
  const managerKey = managerDisplayName.toLowerCase();
  const managerAssignedCases = managerKey
    ? openCases.filter((caseItem) => (caseItem.assignedTo ?? "").trim().toLowerCase() === managerKey)
    : [];
  const managerWatchedCases = managerKey
    ? openCases.filter((caseItem) => isCaseWatchedBy(caseItem, managerDisplayName))
    : [];
  const totalOpenPipeline = openProjects.reduce((sum, project) => sum + projectValue(project), 0);
  const highRiskCases = openCases.filter((caseItem) =>
    caseItem.status === "Escalated" || caseItem.priority === "High" || caseItem.priority === "Very High"
  );
  const veryHighCases = openCases.filter((caseItem) => caseItem.priority === "Very High");
  const closingSoonProjects = openProjects.filter((project) => {
    const days = getDaysUntil(project.closeDate);
    return days !== null && days >= 0 && days <= 45;
  });

  const valueByStage = Object.values(openProjects.reduce<Record<string, { id: string; stage: string; value: number; projects: number }>>((acc, project) => {
    const stage = project.stage || "No stage";
    acc[stage] = acc[stage] ?? { id: `stage-${stage}`, stage, value: 0, projects: 0 };
    acc[stage].value += projectValue(project);
    acc[stage].projects += 1;
    return acc;
  }, {})).sort((left, right) => right.value - left.value);

  const valueByVertical = Object.values(openProjects.reduce<Record<string, { id: string; vertical: string; value: number; projects: number }>>((acc, project) => {
    const vertical = accounts.find((account) => account.recordId === project.accountId)?.vertical || "No vertical";
    acc[vertical] = acc[vertical] ?? { id: `vertical-${vertical}`, vertical, value: 0, projects: 0 };
    acc[vertical].value += projectValue(project);
    acc[vertical].projects += 1;
    return acc;
  }, {})).sort((left, right) => right.value - left.value);

  const casesByOwner = Object.values(openCases.reduce<Record<string, { id: string; owner: string; total: number; escalated: number; veryHigh: number }>>((acc, caseItem) => {
    const owner = caseItem.seOwner || caseItem.assignedTo || "Unassigned";
    acc[owner] = acc[owner] ?? { id: `owner-${owner}`, owner, total: 0, escalated: 0, veryHigh: 0 };
    acc[owner].total += 1;
    if (caseItem.status === "Escalated") acc[owner].escalated += 1;
    if (caseItem.priority === "Very High") acc[owner].veryHigh += 1;
    return acc;
  }, {})).sort((left, right) => (right.escalated * 3 + right.veryHigh * 2 + right.total) - (left.escalated * 3 + left.veryHigh * 2 + left.total));

  const topFocusProjects = [...openProjects]
    .map((project) => {
      const relatedCases = openCases.filter((caseItem) => caseItem.project === project.recordId);
      const escalated = relatedCases.filter((caseItem) => caseItem.status === "Escalated").length;
      const veryHigh = relatedCases.filter((caseItem) => caseItem.priority === "Very High").length;
      const daysToClose = getDaysUntil(project.closeDate);
      const closingScore = daysToClose !== null && daysToClose >= 0 && daysToClose <= 45 ? 4 : 0;
      const valueScore = Math.min(projectValue(project) / 50000, 8);
      return {
        ...project,
        accountName: getAccountName(accounts, project.accountId),
        escalated,
        veryHigh,
        openCaseCount: relatedCases.length,
        daysToClose,
        focusScore: valueScore + escalated * 4 + veryHigh * 3 + closingScore,
      };
    })
    .sort((left, right) => right.focusScore - left.focusScore)
    .slice(0, 6);

  const priorityCases = [...highRiskCases]
    .sort((left, right) => {
      const priorityWeight = (value: string | null | undefined) => value === "Very High" ? 3 : value === "High" ? 2 : 1;
      return (right.status === "Escalated" ? 4 : 0) + priorityWeight(right.priority) - ((left.status === "Escalated" ? 4 : 0) + priorityWeight(left.priority));
    })
    .slice(0, 6);

  const statusAgingCases = openCases
    .map(buildStatusAgingCase)
    .filter((caseItem): caseItem is StatusAgingCase => Boolean(caseItem));
  const statusAgingBucketCounts = STATUS_AGING_BUCKETS.reduce<Record<StatusAgingBucketId, number>>((acc, bucket) => {
    acc[bucket.id] = statusAgingCases.filter((caseItem) => caseItem.agingBucket === bucket.id).length;
    return acc;
  }, { "3m": 0, "6m": 0, "9m": 0, "12m": 0 });
  const visibleStatusAgingCases = statusAgingCases
    .filter((caseItem) => statusAgingBucketFilter === "all" || caseItem.agingBucket === statusAgingBucketFilter)
    .sort((left, right) =>
      statusAgingSort === "oldest"
        ? right.statusAgeDays - left.statusAgeDays
        : left.statusAgeDays - right.statusAgeDays
    );

  const managerStats = [
    {
      label: "Open Pipeline",
      value: formatUsdInteger(totalOpenPipeline),
      detail: `${openProjects.length} open projects`,
      icon: DollarSign,
      color: "bg-[#E31937]",
      onClick: () => navigate("/projects"),
    },
    {
      label: "High-Risk Cases",
      value: highRiskCases.length.toString(),
      detail: `${veryHighCases.length} very high priority`,
      icon: AlertCircle,
      color: "bg-[#B5122B]",
      onClick: () =>
        navigate("/cases", {
          state: {
            statusFilters: CRITICAL_CASE_STATUS_FILTERS,
            priorityFilters: CRITICAL_CASE_PRIORITY_FILTERS,
            caseFilterMatchMode: "any",
          },
        }),
    },
    {
      label: "Closing Soon",
      value: closingSoonProjects.length.toString(),
      detail: "projects inside 45 days",
      icon: CalendarClock,
      color: "bg-[#2c3e50]",
      onClick: () => navigate("/projects"),
    },
    {
      label: "Assigned to Me",
      value: managerAssignedCases.length.toString(),
      detail: "open cases assigned to you",
      icon: Briefcase,
      color: "bg-[#6b7280]",
      onClick: () =>
        navigate("/cases", {
          state: {
            statusFilters: OPEN_CASE_STATUS_FILTERS,
            searchFilters: managerDisplayName ? { assignedTo: managerDisplayName } : {},
          },
        }),
    },
    {
      label: "Cases Watched",
      value: managerWatchedCases.length.toString(),
      detail: "open cases you are watching",
      icon: AlertCircle,
      color: "bg-[#8f1024]",
      onClick: () =>
        navigate("/cases", {
          state: {
            statusFilters: OPEN_CASE_STATUS_FILTERS,
            watcherFilters: managerDisplayName ? [managerDisplayName] : [],
          },
        }),
    },
    {
      label: "Coverage",
      value: casesByOwner.length.toString(),
      detail: "active SE owners",
      icon: Target,
      color: "bg-[#4b5563]",
      onClick: () => navigate("/cases"),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manager Dashboard</h1>
          <p className="mt-1 text-gray-600">Pipeline, risk, and focus areas for the SE team.</p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Filter manager dashboard by vertical"
              className="inline-flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#E31937] md:w-auto md:min-w-44"
            >
              <span className="truncate">{verticalFilterLabel}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Verticals</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {accountVerticals.map((vertical) => (
              <DropdownMenuCheckboxItem
                key={vertical}
                checked={selectedVerticals.includes(vertical)}
                onCheckedChange={() => toggleVertical(vertical)}
                onSelect={(event) => event.preventDefault()}
              >
                {vertical}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!hasVerticalFilter}
              onSelect={(event) => {
                event.preventDefault();
                setSelectedVerticals([]);
              }}
            >
              Overall view
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {managerStats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            onClick={stat.onClick}
            className="rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#E31937]"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                <p className="mt-2 truncate text-3xl font-semibold text-gray-900">{stat.value}</p>
                <p className="mt-1 text-sm text-gray-500">{stat.detail}</p>
              </div>
              <div className={`${stat.color} flex h-12 w-12 shrink-0 items-center justify-center rounded-lg`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Status Aging</h2>
            <p className="mt-1 text-sm text-gray-500">Acknowledged and escalated cases whose current status has not changed for 3+ months.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={statusAgingBucketFilter}
              onChange={(event) => setStatusAgingBucketFilter(event.target.value as StatusAgingBucketId | "all")}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937]"
            >
              <option value="all">All aging buckets</option>
              {STATUS_AGING_BUCKETS.map((bucket) => (
                <option key={bucket.id} value={bucket.id}>
                  {bucket.label}
                </option>
              ))}
            </select>
            <select
              value={statusAgingSort}
              onChange={(event) => setStatusAgingSort(event.target.value as StatusAgingSort)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937]"
            >
              <option value="oldest">Oldest status first</option>
              <option value="newest">Newest status first</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-gray-200 p-5 lg:grid-cols-4">
          {STATUS_AGING_BUCKETS.map((bucket) => {
            const isActive = statusAgingBucketFilter === bucket.id;
            return (
              <button
                key={bucket.id}
                type="button"
                onClick={() => setStatusAgingBucketFilter(isActive ? "all" : bucket.id)}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  isActive
                    ? "border-[#E31937] bg-red-50"
                    : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                }`}
              >
                <p className="text-xs font-medium uppercase text-gray-500">{bucket.label}</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">{statusAgingBucketCounts[bucket.id]}</p>
                <p className="mt-1 text-xs text-gray-500">{bucket.detail}</p>
              </button>
            );
          })}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Case</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Unchanged For</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Since</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {visibleStatusAgingCases.map((caseItem) => (
                <tr
                  key={caseItem.recordId}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => navigate(createDetailPath("case", caseItem.recordId), { state: { openDetail: { entityType: "case", recordId: caseItem.recordId } } })}
                >
                  <td className="max-w-md px-5 py-4">
                    <p className="line-clamp-1 text-sm font-medium text-gray-900">{caseItem.description}</p>
                    <p className="mt-1 text-xs text-gray-500">{caseItem.recordId} | {caseItem.priority || "No priority"}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${caseStatusColors[caseItem.status ?? ""] ?? "bg-gray-100 text-gray-700"}`}>
                      {caseItem.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm font-medium text-gray-900">{formatStatusAge(caseItem.statusAgeDays)}</td>
                  <td className="px-5 py-4 text-sm text-gray-700">{caseItem.statusSinceLabel}</td>
                  <td className="px-5 py-4 text-sm text-gray-700">{caseItem.seOwner || caseItem.assignedTo || "Unassigned"}</td>
                </tr>
              ))}
              {visibleStatusAgingCases.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-500">
                    No acknowledged or escalated cases have been unchanged in this aging range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Pipeline by Stage</h2>
              <p className="text-sm text-gray-500">Open project value by sales stage.</p>
            </div>
            <TrendingUp className="h-5 w-5 text-gray-400" />
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={valueByStage}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="stage" stroke="#6B7280" interval={0} angle={-15} textAnchor="end" height={70} />
              <YAxis stroke="#6B7280" tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value) => [formatUsdInteger(Number(value)), "Pipeline"]} />
              <Bar dataKey="value" fill="#E31937" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Pipeline by Vertical</h2>
              <p className="text-sm text-gray-500">Where the team has the largest opportunity.</p>
            </div>
            <Building2 className="h-5 w-5 text-gray-400" />
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={valueByVertical}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="vertical" stroke="#6B7280" />
              <YAxis stroke="#6B7280" tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value) => [formatUsdInteger(Number(value)), "Pipeline"]} />
              <Bar dataKey="value" fill="#2c3e50" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900">Recommended Focus</h2>
            <p className="mt-1 text-sm text-gray-500">Projects ranked by value, urgency, and open case pressure.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Project</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Account</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Value</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Risk</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Close</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {topFocusProjects.map((project) => (
                  <tr
                    key={project.recordId}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => navigate(createDetailPath("project", project.recordId))}
                  >
                    <td className="max-w-xs truncate px-5 py-4 text-sm font-medium text-gray-900">{project.projectName}</td>
                    <td className="px-5 py-4 text-sm text-gray-700">{project.accountName}</td>
                    <td className="px-5 py-4 text-sm text-gray-700">{formatUsdInteger(project.sfdcValue)}</td>
                    <td className="px-5 py-4 text-sm text-gray-700">
                      {project.escalated > 0 || project.veryHigh > 0
                        ? `${project.escalated} escalated, ${project.veryHigh} very high`
                        : `${project.openCaseCount} open cases`}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-700">
                      {project.daysToClose === null ? "-" : project.daysToClose < 0 ? "Past due" : `${project.daysToClose}d`}
                    </td>
                  </tr>
                ))}
                {topFocusProjects.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-500">No open projects to prioritize.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Team Load</h2>
            <p className="mt-1 text-sm text-gray-500">Open case pressure by SE owner.</p>
            <div className="mt-4 space-y-3">
              {casesByOwner.slice(0, 6).map((owner) => (
                <div key={owner.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-900">{owner.owner}</span>
                    <span className="text-gray-500">{owner.total} open</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full bg-[#E31937]"
                      style={{ width: `${Math.min(100, owner.total * 12 + owner.escalated * 14 + owner.veryHigh * 10)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{owner.escalated} escalated, {owner.veryHigh} very high</p>
                </div>
              ))}
              {casesByOwner.length === 0 && <p className="text-sm text-gray-500">No open case load.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Priority Cases</h2>
            <p className="mt-1 text-sm text-gray-500">Cases that may need leadership attention.</p>
            <div className="mt-4 divide-y divide-gray-100">
              {priorityCases.map((caseItem) => (
                <button
                  key={caseItem.recordId}
                  type="button"
                  onClick={() => navigate(createDetailPath("case", caseItem.recordId), { state: { openDetail: { entityType: "case", recordId: caseItem.recordId } } })}
                  className="block w-full py-3 text-left hover:bg-gray-50"
                >
                  <p className="line-clamp-2 text-sm font-medium text-gray-900">{caseItem.description}</p>
                  <p className="mt-1 text-xs text-gray-500">{caseItem.status || "-"} | {caseItem.priority || "-"} | {caseItem.seOwner || caseItem.assignedTo || "Unassigned"}</p>
                </button>
              ))}
              {priorityCases.length === 0 && <p className="py-6 text-sm text-gray-500">No high-risk open cases right now.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Home() {
  const { user } = useAuth();

  if (user?.role === "manager") {
    return <ManagerHome />;
  }

  return <SalesEngineerHome />;
}

function SalesEngineerHome() {
  const { user } = useAuth();
  const { cases, accounts, projects, mantisRecords, knocks } = useRecords();
  const navigate = useNavigate();
  const userName = (user?.displayName ?? "").trim().toLowerCase();

  const visibleOpenCases = cases.filter(isOpenCase);
  const seOwnedOpenCases = userName
    ? visibleOpenCases.filter((caseItem) => (caseItem.seOwner ?? "").trim().toLowerCase() === userName)
    : [];
  const ownedOpenCases = visibleOpenCases.filter((caseItem) => isCaseOwnedBy(caseItem, user?.displayName));
  const focusCases = user?.role === "user" && ownedOpenCases.length > 0 ? ownedOpenCases : visibleOpenCases;
  const focusCaseProjectIds = new Set(focusCases.map((caseItem) => caseItem.project).filter(Boolean) as string[]);
  const seOwnerSearchFilters = user?.displayName ? { seOwner: user.displayName } : {};
  const focusCaseSearchFilters = user?.role === "user" && ownedOpenCases.length > 0 ? seOwnerSearchFilters : {};

  const openProjects = projects.filter((project) => !project.isClosed);
  const ownedOpenProjects = openProjects.filter((project) => {
    const projectOwner = (project.seOwner ?? "").trim().toLowerCase();
    return (userName && projectOwner === userName) || focusCaseProjectIds.has(project.recordId);
  });
  const focusProjects = user?.role === "user" && ownedOpenProjects.length > 0 ? ownedOpenProjects : openProjects;

  const highRiskCases = focusCases.filter((caseItem) =>
    caseItem.status === "Escalated" || caseItem.priority === "High" || caseItem.priority === "Very High"
  );
  const newCases = focusCases.filter((caseItem) => caseItem.status === "New");
  const overdueCases = focusCases.filter((caseItem) => {
    const days = getDaysUntil(caseItem.closeDate);
    return days !== null && days < 0;
  });

  const activeMantis = mantisRecords.filter(isOpenMantis);
  const activeKnocks = knocks.filter(isOpenKnock);
  const soonMantis = activeMantis.filter((record) => {
    const days = getDaysUntil(record.mantisTargetDate);
    return days !== null && days <= 30;
  });
  const soonKnocks = activeKnocks.filter((record) => {
    const days = getDaysUntil(record.targetDate);
    return days !== null && days <= 30;
  });

  const pressureProjects = focusProjects
    .map((project) => {
      const relatedCases = focusCases.filter((caseItem) => caseItem.project === project.recordId);
      const escalated = relatedCases.filter((caseItem) => caseItem.status === "Escalated").length;
      const highPriority = relatedCases.filter((caseItem) => caseItem.priority === "High" || caseItem.priority === "Very High").length;
      const daysToClose = getDaysUntil(project.closeDate);
      const closePressure = daysToClose === null ? 0 : daysToClose < 0 ? 5 : daysToClose <= 30 ? 4 : daysToClose <= 60 ? 2 : 0;
      return {
        ...project,
        accountName: getAccountName(accounts, project.accountId),
        daysToClose,
        escalated,
        highPriority,
        openCaseCount: relatedCases.length,
        pressureScore: closePressure + escalated * 5 + highPriority * 3 + relatedCases.length,
      };
    })
    .sort((left, right) => right.pressureScore - left.pressureScore || projectValue(right) - projectValue(left))
    .slice(0, 6);

  const pipelineInPlay = focusProjects.reduce((sum, project) => sum + projectValue(project), 0);
  const pipelineAtRisk = pressureProjects.reduce((sum, project) => sum + projectValue(project), 0);

  const attentionCases = [...focusCases]
    .sort((left, right) => caseUrgencyScore(right) - caseUrgencyScore(left) || right.recordId.localeCompare(left.recordId))
    .slice(0, 7);

  const productAskFollowUps = [
    ...activeMantis.map((record) => {
      const daysToTarget = getDaysUntil(record.mantisTargetDate);
      const linkedCases = countLinkedCasesForMantis(cases, record);
      return {
        id: record.recordId,
        type: "mantis" as const,
        label: "Mantis",
        publicId: record.mantisId || record.recordId,
        description: record.description,
        status: record.mantisStatus || "No status",
        daysToTarget,
        linkedCases,
        score: (daysToTarget !== null && daysToTarget <= 30 ? 6 : 0) + (daysToTarget !== null && daysToTarget < 0 ? 8 : 0) + Math.min(linkedCases, 4),
      };
    }),
    ...activeKnocks.map((record) => {
      const daysToTarget = getDaysUntil(record.targetDate);
      const linkedCases = countLinkedCasesForKnock(cases, record);
      return {
        id: record.recordId,
        type: "knock" as const,
        label: "Knock",
        publicId: record.knockId || record.recordId,
        description: record.description,
        status: record.status || "No status",
        daysToTarget,
        linkedCases,
        score: (daysToTarget !== null && daysToTarget <= 30 ? 6 : 0) + (daysToTarget !== null && daysToTarget < 0 ? 8 : 0) + Math.min(linkedCases, 4),
      };
    }),
  ]
    .sort((left, right) => right.score - left.score || (left.daysToTarget ?? 999) - (right.daysToTarget ?? 999))
    .slice(0, 7);

  const accountImpact = accounts
    .map((account) => {
      const accountProjects = focusProjects.filter((project) => project.accountId === account.recordId);
      const accountCases = focusCases.filter((caseItem) =>
        (caseItem.accountIds ?? []).includes(account.recordId) || Boolean(caseItem.project && accountProjects.some((project) => project.recordId === caseItem.project))
      );
      const urgentCases = accountCases.filter((caseItem) => caseItem.status === "Escalated" || caseItem.priority === "High" || caseItem.priority === "Very High");
      const value = accountProjects.reduce((sum, project) => sum + projectValue(project), 0);
      return {
        ...account,
        openCaseCount: accountCases.length,
        urgentCaseCount: urgentCases.length,
        projectCount: accountProjects.length,
        value,
      };
    })
    .filter((account) => account.openCaseCount > 0 || account.value > 0)
    .sort((left, right) => right.urgentCaseCount - left.urgentCaseCount || right.value - left.value)
    .slice(0, 5);

  const caseStatusData = [
    { id: "case-status-new", name: "New", value: focusCases.filter((caseItem) => caseItem.status === "New").length },
    { id: "case-status-ack", name: "Acknowledged", value: focusCases.filter((caseItem) => caseItem.status === "Acknowledged").length },
    { id: "case-status-escalated", name: "Escalated", value: focusCases.filter((caseItem) => caseItem.status === "Escalated").length },
    { id: "case-status-monitoring", name: "Monitoring", value: focusCases.filter((caseItem) => caseItem.status === "Monitoring").length },
  ].filter((item) => item.value > 0);

  const askStatusData = [
    { id: "ask-status-mantis", name: "Mantis", active: activeMantis.length, dueSoon: soonMantis.length },
    { id: "ask-status-knock", name: "Knock", active: activeKnocks.length, dueSoon: soonKnocks.length },
  ];

  const stats = [
    {
      label: "Open Cases",
      value: focusCases.length.toString(),
      detail: `${newCases.length} new, ${overdueCases.length} overdue`,
      icon: Briefcase,
      color: "bg-[#E31937]",
      onClick: () => navigate("/cases"),
    },
    {
      label: "Critical Cases",
      value: highRiskCases.length.toString(),
      detail: "escalated or high priority",
      icon: AlertCircle,
      color: "bg-[#c41230]",
      onClick: () =>
        navigate("/cases", {
          state: {
            statusFilters: CRITICAL_CASE_STATUS_FILTERS,
            priorityFilters: CRITICAL_CASE_PRIORITY_FILTERS,
            caseFilterMatchMode: "any",
            searchFilters: focusCaseSearchFilters,
          },
        }),
    },
    {
      label: "Pipeline in Play",
      value: formatUsdInteger(pipelineInPlay),
      detail: `${formatUsdInteger(pipelineAtRisk)} needs focus`,
      icon: DollarSign,
      color: "bg-[#2c3e50]",
      onClick: () => navigate("/projects"),
    },
    {
      label: "Assigned to SE",
      value: seOwnedOpenCases.length.toString(),
      detail: "open cases where you are SE owner",
      icon: Target,
      color: "bg-[#4b5563]",
      onClick: () =>
        navigate("/cases", {
          state: {
            statusFilters: OPEN_CASE_STATUS_FILTERS,
            searchFilters: seOwnerSearchFilters,
          },
        }),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SE Focus</h1>
          <p className="mt-1 text-gray-600">
            {user?.role === "user" && ownedOpenCases.length > 0
              ? `${user.displayName}'s active cases, projects, and product asks.`
              : "Active cases, projects, and product asks across your visible accounts."}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm">
          {focusProjects.length} active projects · {activeMantis.length} Mantis · {activeKnocks.length} Knocks
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            onClick={stat.onClick}
            className="rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#E31937]"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                <p className="mt-2 truncate text-3xl font-semibold text-gray-900">{stat.value}</p>
                <p className="mt-1 text-sm text-gray-500">{stat.detail}</p>
              </div>
              <div className={`${stat.color} flex h-12 w-12 shrink-0 items-center justify-center rounded-lg`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900">Attention Queue</h2>
            <p className="mt-1 text-sm text-gray-500">Ranked by escalation, priority, and deadline pressure.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {attentionCases.map((caseItem) => {
              const project = getProjectForCase(projects, caseItem);
              const accountName = getAccountNamesForCase(accounts, caseItem, project);
              return (
                <button
                  key={caseItem.recordId}
                  type="button"
                  onClick={() => navigate(createDetailPath("case", caseItem.recordId), { state: { openDetail: { entityType: "case", recordId: caseItem.recordId } } })}
                  className="block w-full px-5 py-4 text-left hover:bg-gray-50"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-medium text-gray-900">{caseItem.description}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {accountName} · {project?.projectName ?? "No project"} · {caseItem.seOwner || caseItem.assignedTo || "Unassigned"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${caseStatusColors[caseItem.status ?? ""] ?? "bg-gray-100 text-gray-700"}`}>
                        {caseItem.status || "-"}
                      </span>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${casePriorityColors[caseItem.priority ?? ""] ?? "bg-gray-100 text-gray-700"}`}>
                        {caseItem.priority || "-"}
                      </span>
                      <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                        {formatDaysLabel(getDaysUntil(caseItem.closeDate))}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
            {attentionCases.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-gray-500">No open cases need attention right now.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900">Deal Pressure</h2>
            <p className="mt-1 text-sm text-gray-500">Open opportunities with case load or close-date pressure.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {pressureProjects.map((project) => (
              <button
                key={project.recordId}
                type="button"
                onClick={() => navigate(createDetailPath("project", project.recordId))}
                className="block w-full px-5 py-4 text-left hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{project.projectName}</p>
                    <p className="mt-1 text-xs text-gray-500">{project.accountName} · {formatUsdInteger(project.sfdcValue)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${projectStageColors[project.stage ?? ""] ?? "bg-gray-100 text-gray-700"}`}>
                    {project.stage || "No stage"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-gray-600">
                  <div>
                    <span className="block text-gray-400">Close</span>
                    <span className="font-medium text-gray-900">{formatDaysLabel(project.daysToClose)}</span>
                  </div>
                  <div>
                    <span className="block text-gray-400">Cases</span>
                    <span className="font-medium text-gray-900">{project.openCaseCount}</span>
                  </div>
                  <div>
                    <span className="block text-gray-400">Risk</span>
                    <span className="font-medium text-gray-900">{project.escalated} esc, {project.highPriority} high</span>
                  </div>
                </div>
              </button>
            ))}
            {pressureProjects.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-gray-500">No open projects with pressure signals.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Open Case Mix</h2>
              <p className="text-sm text-gray-500">Current workload by case state.</p>
            </div>
            <Target className="h-5 w-5 text-gray-400" />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={caseStatusData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="name" stroke="#6B7280" />
              <YAxis stroke="#6B7280" allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#E31937" radius={[6, 6, 0, 0]} name="Cases" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Product Ask Load</h2>
              <p className="text-sm text-gray-500">Active Mantis and Knock items, including near-term targets.</p>
            </div>
            <Clock3 className="h-5 w-5 text-gray-400" />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={askStatusData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="name" stroke="#6B7280" />
              <YAxis stroke="#6B7280" allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="active" fill="#2c3e50" radius={[6, 6, 0, 0]} name="Active" />
              <Bar dataKey="dueSoon" fill="#E31937" radius={[6, 6, 0, 0]} name="Due in 30d" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900">Mantis and Knock Follow-Ups</h2>
            <p className="mt-1 text-sm text-gray-500">Active product asks sorted by target pressure and case linkage.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {productAskFollowUps.map((ask) => (
              <button
                key={`${ask.type}-${ask.id}`}
                type="button"
                onClick={() => navigate(createDetailPath(ask.type, ask.id))}
                className="block w-full px-5 py-4 text-left hover:bg-gray-50"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase text-gray-500">{ask.label} · {ask.publicId}</p>
                    <p className="mt-1 line-clamp-2 text-sm font-medium text-gray-900">{ask.description}</p>
                    <p className="mt-1 text-xs text-gray-500">{ask.linkedCases} linked cases · target {formatDaysLabel(ask.daysToTarget)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    ask.type === "mantis"
                      ? mantisStatusColors[ask.status] ?? "bg-gray-100 text-gray-700"
                      : knockStatusColors[ask.status] ?? "bg-gray-100 text-gray-700"
                  }`}>
                    {ask.status}
                  </span>
                </div>
              </button>
            ))}
            {productAskFollowUps.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-gray-500">No active Mantis or Knock follow-ups.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900">Customer Impact</h2>
            <p className="mt-1 text-sm text-gray-500">Accounts with open cases, high-risk work, or active project value.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {accountImpact.map((account) => (
              <button
                key={account.recordId}
                type="button"
                onClick={() => navigate(createDetailPath("account", account.recordId))}
                className="block w-full px-5 py-4 text-left hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{account.accountName}</p>
                    <p className="mt-1 text-xs text-gray-500">{account.vertical || "No vertical"} · {account.projectCount} active projects</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-gray-900">{formatUsdInteger(account.value)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">{account.openCaseCount} open cases</span>
                  <span className="rounded-full bg-[#E31937] px-2.5 py-0.5 text-xs font-medium text-white">{account.urgentCaseCount} high risk</span>
                </div>
              </button>
            ))}
            {accountImpact.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-gray-500">No account pressure signals right now.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamHome() {
  const { cases, accounts, projects } = useRecords();
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
  const navigate = useNavigate();

  // Load custom widgets from localStorage
  const [customWidgets, setCustomWidgets] = useState<CustomWidgetConfig[]>(() => {
    try {
      const saved = localStorage.getItem("nfr_custom_widgets_v1");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isWidgetModalOpen, setIsWidgetModalOpen] = useState(false);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [widgetForm, setWidgetForm] = useState({
    title: "",
    daysToClose: "",
    statusFilter: "All",
    priorityFilter: "All",
  });

  const saveCustomWidgets = (widgets: CustomWidgetConfig[]) => {
    setCustomWidgets(widgets);
    localStorage.setItem("nfr_custom_widgets_v1", JSON.stringify(widgets));
  };

  const openNewWidgetModal = () => {
    setEditingWidgetId(null);
    setWidgetForm({ title: "My Custom Widget", daysToClose: "", statusFilter: "All", priorityFilter: "All" });
    setIsWidgetModalOpen(true);
  };

  const openEditWidgetModal = (widget: CustomWidgetConfig, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingWidgetId(widget.id);
    setWidgetForm({
      title: widget.title,
      daysToClose: widget.daysToClose?.toString() || "",
      statusFilter: widget.statusFilter || "All",
      priorityFilter: widget.priorityFilter || "All",
    });
    setIsWidgetModalOpen(true);
  };

  const saveWidget = () => {
    if (!widgetForm.title.trim()) return;
    const newWidget: CustomWidgetConfig = {
      id: editingWidgetId || Math.random().toString(36).substring(7),
      title: widgetForm.title.trim(),
      daysToClose: widgetForm.daysToClose ? parseInt(widgetForm.daysToClose, 10) : null,
      statusFilter: widgetForm.statusFilter !== "All" ? widgetForm.statusFilter : null,
      priorityFilter: widgetForm.priorityFilter !== "All" ? widgetForm.priorityFilter : null,
    };
    
    if (editingWidgetId) {
      saveCustomWidgets(customWidgets.map(w => w.id === editingWidgetId ? newWidget : w));
    } else {
      saveCustomWidgets([...customWidgets, newWidget]);
    }
    setIsWidgetModalOpen(false);
  };

  const removeWidget = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    saveCustomWidgets(customWidgets.filter(w => w.id !== id));
  };

  const casesByStatus = [
    { id: "home-status-new", name: "New", value: cases.filter(c => c.status === "New").length },
    { id: "home-status-ack", name: "Acknowledged", value: cases.filter(c => c.status === "Acknowledged").length },
    { id: "home-status-escalated", name: "Escalated", value: cases.filter(c => c.status === "Escalated").length },
    { id: "home-status-monitoring", name: "Monitoring", value: cases.filter(c => c.status === "Monitoring").length },
    { id: "home-status-closed-resolved", name: "Closed-Resolved", value: cases.filter(c => c.status === "Closed-Resolved").length },
    { id: "home-status-closed-dead", name: "Closed-Dead", value: cases.filter(c => c.status === "Closed-Dead").length },
  ].filter(item => item.value > 0);

  const activityData = buildActivityTrend(cases, accounts, projects);

  const sortedCases = [...cases].sort((left, right) => right.recordId.localeCompare(left.recordId));

  const recentCases = sortedCases.slice(0, 8);
  const ownerFilters = [...new Set(recentCases.flatMap((caseItem) => {
    const people = getCasePeople(caseItem);
    return people.length > 0 ? people : ["Unassigned"];
  }))];
  const filteredRecentCases = recentCases.filter((caseItem) => caseMatchesOwnerFilter(caseItem, selectedOwners));

  const filteredNewCases = filteredRecentCases.filter((caseItem) => caseItem.status === "New").length;
  const filteredAckCases = filteredRecentCases.filter((caseItem) => caseItem.status === "Acknowledged").length;
  const filteredEscalatedCases = filteredRecentCases.filter((caseItem) => caseItem.status === "Escalated").length;
  const filteredMonitoringCases = filteredRecentCases.filter((caseItem) => caseItem.status === "Monitoring").length;

  const stats = [
    {
      label: "New Cases",
      value: filteredNewCases.toString(),
      change: "Needs attention",
      trend: "up",
      icon: Briefcase,
      color: "bg-[#E31937]",
      filterState: { statusFilter: "New" }
    },
    {
      label: "Acknowledged Cases",
      value: filteredAckCases.toString(),
      change: "In progress",
      trend: "neutral",
      icon: FolderKanban,
      color: "bg-[#2c3e50]",
      filterState: { statusFilter: "Acknowledged" }
    },
    {
      label: "Escalated Cases",
      value: filteredEscalatedCases.toString(),
      change: "Requires follow-up",
      trend: "down",
      icon: AlertCircle,
      color: "bg-[#c41230]",
      filterState: { statusFilter: "Escalated" }
    },
    {
      label: "Monitoring Cases",
      value: filteredMonitoringCases.toString(),
      change: "Pending resolution",
      trend: "neutral",
      icon: Clock3,
      color: "bg-[#666666]",
      filterState: { statusFilter: "Monitoring" }
    },
  ];

  const dynamicWidgets = customWidgets.map((widget) => {
    const matchingCases = filteredRecentCases.filter(c => {
      let match = true;
      if (widget.statusFilter && c.status !== widget.statusFilter) match = false;
      if (widget.priorityFilter && c.priority !== widget.priorityFilter) match = false;
      if (widget.daysToClose && widget.daysToClose > 0) {
          if (!c.closeDate) {
              match = false;
          } else {
              const daysDiff = (new Date(c.closeDate).getTime() - Date.now()) / (1000 * 3600 * 24);
              if (daysDiff < 0 || daysDiff > widget.daysToClose) match = false;
          }
      }
      return match;
    });

    let customFilterState: any = {};
    if (widget.statusFilter) customFilterState.statusFilter = widget.statusFilter;
    if (widget.priorityFilter) customFilterState.priorityFilter = widget.priorityFilter;
    if (widget.daysToClose) customFilterState.daysToCloseFilter = widget.daysToClose;

    let subMsg = "Custom filter";
    if (widget.daysToClose) subMsg = `Next ${widget.daysToClose} days`;
    else if (widget.priorityFilter) subMsg = `${widget.priorityFilter} Priority`;

    return {
      id: widget.id,
      label: widget.title,
      value: matchingCases.length.toString(),
      change: subMsg,
      trend: "neutral" as const,
      icon: Settings2,
      color: "bg-[#0f172a]",
      isCustom: true,
      originalWidget: widget,
      filterState: customFilterState
    };
  });

  const allStats = [...stats, ...dynamicWidgets];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Home</h1>
          <p className="text-gray-600 mt-1">Overview of your metrics and activity</p>
        </div>
        <button 
          onClick={openNewWidgetModal}
          className="flex items-center gap-2 rounded-md bg-[#E31937] px-4 py-2 text-sm font-medium text-white hover:bg-[#c41230] focus:outline-none focus:ring-2 focus:ring-[#E31937] focus:ring-offset-2 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Widget
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {allStats.map((stat) => (
          <div 
            key={stat.label + (stat.id || "")} 
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-shadow relative group"
            onClick={() => navigate('/cases', { state: stat.filterState })}
          >
            {'isCustom' in stat && stat.isCustom && (
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={(e) => openEditWidgetModal((stat as any).originalWidget, e)}
                  className="p-1 text-gray-400 hover:text-blue-600 focus:outline-none"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button 
                  onClick={(e) => removeWidget(stat.id, e)}
                  className="p-1 text-gray-400 hover:text-red-600 focus:outline-none"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm text-gray-600">{stat.label}</p>
                <p className="text-3xl font-semibold text-gray-900 mt-2">{stat.value}</p>
                <p className={`text-sm mt-2 ${
                  stat.trend === "up" ? "text-green-600" :
                  stat.trend === "down" ? "text-red-600" :
                  "text-gray-600"
                }`}>
                  {stat.trend === "up" ? "↑" : stat.trend === "down" ? "↓" : "→"} {stat.change}
                </p>
              </div>
              <div className={`${stat.color} w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ml-4`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="font-semibold text-lg text-gray-900 mb-4">Cases by Status</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={casesByStatus}>
              <CartesianGrid key="home-status-grid" strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis key="home-status-xaxis" dataKey="name" stroke="#6B7280" />
              <YAxis key="home-status-yaxis" stroke="#6B7280" />
              <Tooltip key="home-status-tooltip" />
              <Bar key="home-status-bar" dataKey="value" fill="#E31937" radius={[8, 8, 0, 0]} name="Cases" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="font-semibold text-lg text-gray-900 mb-4">Activity Trend</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={activityData}>
              <CartesianGrid key="home-activity-grid" strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis key="home-activity-xaxis" dataKey="month" stroke="#6B7280" />
              <YAxis key="home-activity-yaxis" stroke="#6B7280" />
              <Tooltip key="home-activity-tooltip" />
              <Legend key="home-activity-legend" />
              <Line key="home-activity-line-cases" type="monotone" dataKey="cases" stroke="#E31937" strokeWidth={2} name="Cases" />
              <Line key="home-activity-line-accounts" type="monotone" dataKey="accounts" stroke="#2c3e50" strokeWidth={2} name="Accounts" />
              <Line key="home-activity-line-projects" type="monotone" dataKey="projects" stroke="#666666" strokeWidth={2} name="Projects" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200 space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="font-semibold text-lg text-gray-900">Recent Cases</h2>
              <p className="text-sm text-gray-600 mt-1">Filter the latest cases by assignee or SE owner.</p>
            </div>
            <p className="text-sm text-gray-500">
              Showing {filteredRecentCases.length} of {recentCases.length}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#E31937]">
                  Filter Owners <ChevronDown className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-2 bg-white rounded-md shadow-md border border-gray-200">
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {ownerFilters.map((owner) => (
                    <label key={owner} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer p-2 hover:bg-gray-50 rounded">
                      <Checkbox 
                         checked={selectedOwners.includes(owner)}
                         onCheckedChange={(checked) => {
                           if (checked) {
                             setSelectedOwners(prev => [...prev, owner]);
                           } else {
                             setSelectedOwners(prev => prev.filter(o => o !== owner));
                           }
                         }}
                      />
                      {owner}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Description</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Priority</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Assigned To</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">SE Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRecentCases.length > 0 ? (
                filteredRecentCases.map((caseItem) => (
                  <tr 
                    key={caseItem.recordId} 
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => navigate(createDetailPath("case", caseItem.recordId), { state: { openDetail: { entityType: 'case', recordId: caseItem.recordId } } })}
                  >
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-md truncate whitespace-nowrap" title={caseItem.description}>
                      {caseItem.description}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium ${caseStatusColors[caseItem.status ?? ""]}`}>
                        {caseItem.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium ${casePriorityColors[caseItem.priority ?? ""]}`}>
                        {caseItem.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{caseItem.assignedTo || "Unassigned"}</td>
                    <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{caseItem.seOwner || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-6 py-10 text-center text-sm text-gray-500" colSpan={5}>
                    No recent cases match this owner filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isWidgetModalOpen && (
        <Dialog open={isWidgetModalOpen} onOpenChange={setIsWidgetModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingWidgetId ? "Edit Custom Widget" : "Create Custom Widget"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Widget Title <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={widgetForm.title}
                  onChange={e => setWidgetForm({ ...widgetForm, title: e.target.value })}
                  placeholder="e.g. Critical Bug Cases"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Status Filter</label>
                <select 
                  value={widgetForm.statusFilter}
                  onChange={e => setWidgetForm({ ...widgetForm, statusFilter: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white"
                >
                  <option value="All">All Statuses</option>
                  {caseStatuses.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Priority Filter</label>
                <select 
                  value={widgetForm.priorityFilter}
                  onChange={e => setWidgetForm({ ...widgetForm, priorityFilter: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white"
                >
                  <option value="All">All Priorities</option>
                  {casePriorities.map(priority => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Closing Within (Days)</label>
                <input 
                  type="number" 
                  min="0"
                  value={widgetForm.daysToClose}
                  onChange={e => setWidgetForm({ ...widgetForm, daysToClose: e.target.value })}
                  placeholder="e.g. 60"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                />
              </div>
            </div>
            <DialogFooter>
              <button 
                onClick={() => setIsWidgetModalOpen(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
              >
                Cancel
              </button>
              <button 
                onClick={saveWidget}
                disabled={!widgetForm.title.trim()}
                className="rounded-md bg-[#E31937] px-4 py-2 text-sm font-medium text-white hover:bg-[#c41230] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Widget
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}
