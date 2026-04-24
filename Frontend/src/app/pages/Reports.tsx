import { useEffect, useState } from "react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ChevronDown } from "lucide-react";
import {
  getCasesByPriorityReport,
  getCasesByProductReport,
  getCasesByStatusReport,
  getCasesOverTimeReport,
  getReportSummary,
  type ReportSummary,
  type ReportTimelineValue,
  type ReportValue,
} from "../data/apiClient";
import { chartColors } from "../data/recordStyles";

export function Reports() {
  const [dateRange, setDateRange] = useState("last-30-days");
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [casesByStatus, setCasesByStatus] = useState<ReportValue[]>([]);
  const [casesByPriority, setCasesByPriority] = useState<ReportValue[]>([]);
  const [casesOverTime, setCasesOverTime] = useState<ReportTimelineValue[]>([]);
  const [casesByProduct, setCasesByProduct] = useState<ReportValue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setIsLoading(true);
      setError(null);

      try {
        const [summaryData, statusData, priorityData, timelineData, productData] = await Promise.all([
          getReportSummary(dateRange),
          getCasesByStatusReport(dateRange),
          getCasesByPriorityReport(dateRange),
          getCasesOverTimeReport(dateRange),
          getCasesByProductReport(dateRange),
        ]);

        if (cancelled) return;

        setSummary(summaryData);
        setCasesByStatus(statusData);
        setCasesByPriority(priorityData);
        setCasesOverTime(timelineData);
        setCasesByProduct(productData);
      } catch (loadError) {
        if (cancelled) return;
        console.error("Failed to load reports:", loadError);
        setError("Failed to load report data from the backend.");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadReports();

    return () => {
      cancelled = true;
    };
  }, [dateRange]);

  const safeSummary: ReportSummary = summary ?? {
    totalCases: 0,
    openCases: 0,
    escalatedCases: 0,
    closedCases: 0,
  };

  const casesByProductChart = casesByProduct.map((entry) => ({
    id: `product-${entry.label}`,
    product: entry.label,
    cases: entry.value,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-600 mt-1">Visualize and analyze NFR data from MySQL</p>
        </div>

        <div className="relative">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="appearance-none px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white"
          >
            <option value="last-7-days">Last 7 days</option>
            <option value="last-30-days">Last 30 days</option>
            <option value="last-90-days">Last 90 days</option>
            <option value="year-to-date">Year to date</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="font-semibold text-lg text-gray-900 mb-4">Cases by Status</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={casesByStatus}>
              <CartesianGrid key="status-grid" strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis key="status-xaxis" dataKey="label" stroke="#6B7280" />
              <YAxis key="status-yaxis" stroke="#6B7280" />
              <Tooltip key="status-tooltip" />
              <Bar key="status-bar" dataKey="value" fill="#E31937" radius={[8, 8, 0, 0]} name="Cases" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="font-semibold text-lg text-gray-900 mb-4">Cases by Priority</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                key="priority-pie"
                data={casesByPriority}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ label, value }) => `${label}: ${value}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
                nameKey="label"
              >
                {casesByPriority.map((entry, index) => (
                  <Cell key={entry.label} fill={chartColors[index % chartColors.length]} />
                ))}
              </Pie>
              <Tooltip key="priority-tooltip" />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:col-span-2">
          <h2 className="font-semibold text-lg text-gray-900 mb-4">Cases Over Time</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={casesOverTime}>
              <CartesianGrid key="timeline-grid" strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis key="timeline-xaxis" dataKey="monthLabel" stroke="#6B7280" />
              <YAxis key="timeline-yaxis" stroke="#6B7280" />
              <Tooltip key="timeline-tooltip" />
              <Legend key="timeline-legend" />
              <Line key="timeline-line-created" type="monotone" dataKey="created" stroke="#E31937" strokeWidth={2} name="Created" />
              <Line key="timeline-line-closed" type="monotone" dataKey="closed" stroke="#2c3e50" strokeWidth={2} name="Closed" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:col-span-2">
          <h2 className="font-semibold text-lg text-gray-900 mb-4">Cases by Product</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={casesByProductChart} layout="vertical">
              <CartesianGrid key="product-grid" strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis key="product-xaxis" type="number" stroke="#6B7280" />
              <YAxis key="product-yaxis" dataKey="product" type="category" stroke="#6B7280" width={150} />
              <Tooltip key="product-tooltip" />
              <Bar key="product-bar" dataKey="cases" fill="#E31937" radius={[0, 8, 8, 0]} name="Cases" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-600 mb-1">Total Cases</div>
          <div className="text-3xl font-semibold text-gray-900">{safeSummary.totalCases}</div>
          <div className="text-sm text-green-600 mt-2">Live from MySQL</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-600 mb-1">Open Cases</div>
          <div className="text-3xl font-semibold text-gray-900">{safeSummary.openCases}</div>
          <div className="text-sm text-orange-600 mt-2">Active workload</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-600 mb-1">Escalated Cases</div>
          <div className="text-3xl font-semibold text-gray-900">{safeSummary.escalatedCases}</div>
          <div className="text-sm text-red-600 mt-2">Requires attention</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-600 mb-1">Closed Cases</div>
          <div className="text-3xl font-semibold text-gray-900">{safeSummary.closedCases}</div>
          <div className="text-sm text-green-600 mt-2">Resolved</div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading report data...</div>
      ) : null}
    </div>
  );
}