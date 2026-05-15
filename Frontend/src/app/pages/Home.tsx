import { useState } from "react";
import { useNavigate } from "react-router";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Briefcase, FolderKanban, AlertCircle, Clock3, ChevronDown, Plus, Settings2, Trash2, Edit2 } from "lucide-react";
import { useRecords } from "../context/RecordsContext";
import { casePriorityColors, caseStatusColors } from "../data/recordStyles";
import type { AccountRecord, CaseRecord, ProjectRecord } from "../data/apiClient";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Checkbox } from "../components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "../components/ui/dialog";
import { caseStatuses, casePriorities } from "../data/caseOptions";

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

export function Home() {
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
                    onClick={() => navigate('/cases', { state: { openDetail: { entityType: 'case', recordId: caseItem.recordId } } })}
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
