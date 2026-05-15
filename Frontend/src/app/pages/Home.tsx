import { useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Briefcase, FolderKanban, AlertCircle, Clock3 } from "lucide-react";
import { useRecords } from "../context/RecordsContext";
import { casePriorityColors, caseStatusColors } from "../data/recordStyles";
import type { AccountRecord, CaseRecord, ProjectRecord } from "../data/apiClient";

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
  return [caseItem.assignedTo?.trim(), caseItem.seOwner?.trim()].filter(Boolean) as string[];
}

function caseMatchesOwnerFilter(caseItem: CaseItem, selectedOwner: string) {
  if (selectedOwner === "All Owners") return true;

  const people = getCasePeople(caseItem);
  return selectedOwner === "Unassigned" ? people.length === 0 : people.includes(selectedOwner);
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

export function Home() {
  const { cases, accounts, projects } = useRecords();
  const [selectedOwner, setSelectedOwner] = useState("All Owners");

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
  const ownerFilters = ["All Owners", ...new Set(recentCases.flatMap((caseItem) => {
    const people = getCasePeople(caseItem);
    return people.length > 0 ? people : ["Unassigned"];
  }))];
  const filteredRecentCases = recentCases.filter((caseItem) => caseMatchesOwnerFilter(caseItem, selectedOwner));

  const filteredNewCases = filteredRecentCases.filter((caseItem) => caseItem.status === "New").length;
  const filteredEscalatedCases = filteredRecentCases.filter((caseItem) => caseItem.status === "Escalated").length;
  const filteredAssignedCases = filteredRecentCases.filter((caseItem) => Boolean(caseItem.assignedTo)).length;
  const filteredClosedCases = filteredRecentCases.filter((caseItem) => caseItem.status === "Closed-Resolved" || caseItem.status === "Closed-Dead").length;

  const stats = [
    {
      label: "New Cases",
      value: filteredNewCases.toString(),
      change: "Needs attention",
      trend: "up",
      icon: Briefcase,
      color: "bg-[#E31937]"
    },
    {
      label: "Escalated Cases",
      value: filteredEscalatedCases.toString(),
      change: "Requires follow-up",
      trend: "down",
      icon: AlertCircle,
      color: "bg-[#c41230]"
    },
    {
      label: "Assigned Cases",
      value: filteredAssignedCases.toString(),
      change: "Has assignee",
      trend: "neutral",
      icon: Clock3,
      color: "bg-[#2c3e50]"
    },
    {
      label: "Closed Cases",
      value: filteredClosedCases.toString(),
      change: "Completed",
      trend: "neutral",
      icon: FolderKanban,
      color: "bg-[#666666]"
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Home</h1>
        <p className="text-gray-600 mt-1">Overview of your metrics and activity</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
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
            {ownerFilters.map((owner) => (
              <button
                key={owner}
                type="button"
                onClick={() => setSelectedOwner(owner)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  selectedOwner === owner
                    ? "bg-[#E31937] text-white shadow-sm"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {owner}
              </button>
            ))}
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
                  <tr key={caseItem.recordId} className="hover:bg-gray-50 transition-colors">
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
    </div>
  );
}
