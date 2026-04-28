import { useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Briefcase, Building2, FolderKanban, AlertCircle, Clock3 } from "lucide-react";
import { cases, accounts, projects } from "../data/apiClient";
import { casePriorityColors, caseStatusColors } from "../data/recordStyles";

type CaseItem = (typeof cases)[number];

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

function getCaseOwnerLabel(caseOwner: string | null | undefined) {
  return caseOwner?.trim() || "Unassigned";
}

function getCaseAgeInDays(caseItem: CaseItem) {
  const createdAt = new Date(caseItem.createdAt).getTime();
  if (Number.isNaN(createdAt)) return null;

  return Math.max(0, (Date.now() - createdAt) / (1000 * 60 * 60 * 24));
}

function getAverageCaseAge(casesList: CaseItem[]) {
  const ages = casesList
    .map(getCaseAgeInDays)
    .filter((age): age is number => age !== null);

  if (ages.length === 0) return 0;

  return ages.reduce((sum, age) => sum + age, 0) / ages.length;
}

function isWithinDays(dateString: string | null | undefined, days: number) {
  if (!dateString) return false;

  const parsed = new Date(dateString).getTime();
  if (Number.isNaN(parsed)) return false;

  return Date.now() - parsed <= days * 24 * 60 * 60 * 1000;
}

function buildActivityTrend() {
  const monthMap = new Map<string, { month: string; cases: number; accounts: number; projects: number }>();

  for (const caseItem of cases) {
    const monthKey = getMonthKey(caseItem.createdAt);
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
  const [selectedOwner, setSelectedOwner] = useState("All Owners");

  const casesByStatus = [
    { id: "home-status-open", name: "Open", value: cases.filter(c => c.status === "Open").length },
    { id: "home-status-progress", name: "In Progress", value: cases.filter(c => c.status === "In Progress").length },
    { id: "home-status-escalated", name: "Escalated", value: cases.filter(c => c.status === "Escalated").length },
    { id: "home-status-closed", name: "Closed", value: cases.filter(c => c.status === "Closed").length },
  ].filter(item => item.value > 0);

  const activityData = buildActivityTrend();

  const sortedCases = [...cases].sort((left, right) => {
    const leftDate = new Date(left.updatedAt || left.createdAt).getTime();
    const rightDate = new Date(right.updatedAt || right.createdAt).getTime();
    return rightDate - leftDate;
  });

  const recentCases = sortedCases.slice(0, 8);
  const ownerFilters = ["All Owners", ...new Set(recentCases.map((caseItem) => getCaseOwnerLabel(caseItem.caseOwner)))];
  const filteredRecentCases = selectedOwner === "All Owners"
    ? recentCases
    : recentCases.filter((caseItem) => getCaseOwnerLabel(caseItem.caseOwner) === selectedOwner);

  const filteredOpenCases = filteredRecentCases.filter((caseItem) => caseItem.status === "Open").length;
  const filteredEscalatedCases = filteredRecentCases.filter((caseItem) => caseItem.status === "Escalated").length;
  const filteredRecentlyUpdatedCases = filteredRecentCases.filter((caseItem) => isWithinDays(caseItem.updatedAt || caseItem.createdAt, 7)).length;
  const filteredAverageCaseAge = getAverageCaseAge(filteredRecentCases);

  const stats = [
    {
      label: "Open Cases",
      value: filteredOpenCases.toString(),
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
      label: "Updated in 7 Days",
      value: filteredRecentlyUpdatedCases.toString(),
      change: "Recently active",
      trend: "neutral",
      icon: Clock3,
      color: "bg-[#2c3e50]"
    },
    {
      label: "Average Case Age",
      value: `${filteredAverageCaseAge.toFixed(1)}d`,
      change: "Lower is better",
      trend: "neutral",
      icon: FolderKanban,
      color: "bg-[#666666]"
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Home</h1>
        <p className="text-gray-600 mt-1">Overview of your NFR metrics and activity</p>
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
              <p className="text-sm text-gray-600 mt-1">Filter the latest cases by owner name.</p>
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
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Case ID</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Description</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Priority</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRecentCases.length > 0 ? (
                filteredRecentCases.map((caseItem) => (
                  <tr key={caseItem.recordId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-[#E31937] whitespace-nowrap">{caseItem.recordId}</td>
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
                    <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{getCaseOwnerLabel(caseItem.caseOwner)}</td>
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
