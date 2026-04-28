import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { PencilLine, Plus, Trash2, X } from "lucide-react";
import {
  cases,
  products,
  getProductById,
  createCustomReport,
  deleteCustomReport,
  getCustomReports,
  updateCustomReport,
  type CaseRecord,
  type CustomReportInput,
  type CustomReportRecord,
  type ReportFilters,
  type ReportTimelineValue,
  type ReportValue,
} from "../data/apiClient";
import { chartColors } from "../data/recordStyles";

type ReportChartType = "bar" | "line" | "pie" | "table";
type ReportMetric = "status" | "priority" | "product" | "owner" | "category" | "monthCreated";
type ReportDateRange = "all-time" | "last-7-days" | "last-30-days" | "last-90-days" | "year-to-date";

type CustomReportDraft = CustomReportInput;

const defaultFilters: ReportFilters = {
  dateRange: "last-30-days",
  owner: "",
  status: "",
  priority: "",
  category: "",
  product: "",
};

const defaultDraft: CustomReportDraft = {
  title: "",
  chartType: "bar",
  metric: "status",
  layoutSpan: 1,
  sortOrder: 0,
  filters: defaultFilters,
};

function getCaseOwnerLabel(caseOwner: string | null | undefined) {
  return caseOwner?.trim() || "Unassigned";
}

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

function isWithinDays(dateString: string | null | undefined, days: number) {
  if (!dateString) return false;

  const parsed = new Date(dateString).getTime();
  if (Number.isNaN(parsed)) return false;

  return Date.now() - parsed <= days * 24 * 60 * 60 * 1000;
}

function isWithinDateRange(dateString: string | null | undefined, range: ReportDateRange) {
  if (range === "all-time") return true;
  if (range === "last-7-days") return isWithinDays(dateString, 7);
  if (range === "last-30-days") return isWithinDays(dateString, 30);
  if (range === "last-90-days") return isWithinDays(dateString, 90);

  if (!dateString) return false;
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return false;

  const startOfYear = new Date(new Date().getFullYear(), 0, 1);
  return parsed.getTime() >= startOfYear.getTime();
}

function groupCases(casesList: CaseRecord[], metric: ReportMetric): ReportValue[] {
  const map = new Map<string, number>();

  for (const caseItem of casesList) {
    let label = "Unknown";

    switch (metric) {
      case "status":
        label = caseItem.status?.trim() || "Unassigned";
        break;
      case "priority":
        label = caseItem.priority?.trim() || "Unassigned";
        break;
      case "category":
        label = caseItem.category?.trim() || "Unassigned";
        break;
      case "owner":
        label = getCaseOwnerLabel(caseItem.caseOwner);
        break;
      case "product":
        label = getProductById(caseItem.product)?.productName || caseItem.product || "Unassigned";
        break;
      default:
        break;
    }

    map.set(label, (map.get(label) ?? 0) + 1);
  }

  return [...map.entries()]
    .map(([label, value]) => ({ id: `${metric}-${label}`, label, value }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
}

function buildTrend(casesList: CaseRecord[]): ReportTimelineValue[] {
  const monthMap = new Map<string, { created: number; closed: number }>();

  for (const caseItem of casesList) {
    const createdMonth = getMonthKey(caseItem.createdAt);
    if (createdMonth) {
      const bucket = monthMap.get(createdMonth) ?? { created: 0, closed: 0 };
      bucket.created += 1;
      monthMap.set(createdMonth, bucket);
    }

    const closedMonth = getMonthKey(caseItem.closeDate);
    if (closedMonth) {
      const bucket = monthMap.get(closedMonth) ?? { created: 0, closed: 0 };
      bucket.closed += 1;
      monthMap.set(closedMonth, bucket);
    }
  }

  return [...monthMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([monthKey, value]) => ({
      monthLabel: getMonthLabel(monthKey),
      created: value.created,
      closed: value.closed,
    }));
}

function buildReportData(report: CustomReportRecord, sourceCases: CaseRecord[]) {
  const filteredCases = sourceCases.filter((caseItem) => {
    if (!isWithinDateRange(caseItem.createdAt, report.filters.dateRange as ReportDateRange)) return false;
    if (report.filters.owner && getCaseOwnerLabel(caseItem.caseOwner) !== report.filters.owner) return false;
    if (report.filters.status && (caseItem.status ?? "") !== report.filters.status) return false;
    if (report.filters.priority && (caseItem.priority ?? "") !== report.filters.priority) return false;
    if (report.filters.category && (caseItem.category ?? "") !== report.filters.category) return false;
    if (report.filters.product && (caseItem.product ?? "") !== report.filters.product) return false;
    return true;
  });

  if (report.metric === "monthCreated") {
    return buildTrend(filteredCases).map((item) => ({
      id: item.monthLabel,
      label: item.monthLabel,
      value: item.created + item.closed,
    }));
  }

  return groupCases(filteredCases, report.metric);
}

function describeFilters(report: CustomReportRecord) {
  const parts = [
    `Range: ${report.filters.dateRange}`,
    report.filters.owner ? `Owner: ${report.filters.owner}` : null,
    report.filters.status ? `Status: ${report.filters.status}` : null,
    report.filters.priority ? `Priority: ${report.filters.priority}` : null,
    report.filters.category ? `Category: ${report.filters.category}` : null,
    report.filters.product ? `Product: ${report.filters.product}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" • ") : "No filters applied";
}

function getLayoutSpanLabel(layoutSpan: 1 | 2) {
  return layoutSpan === 2 ? "Full width" : "Half width";
}

function sortCustomReports(reports: CustomReportRecord[]) {
  return [...reports].sort(
    (left, right) => left.sortOrder - right.sortOrder || right.updatedAt.localeCompare(left.updatedAt) || right.id - left.id,
  );
}

function buildCustomReportPayload(report: CustomReportRecord) {
  return {
    title: report.title,
    chartType: report.chartType,
    metric: report.metric,
    layoutSpan: report.layoutSpan,
    sortOrder: report.sortOrder,
    filters: report.filters,
  };
}

export function Reports() {
  const [customReports, setCustomReports] = useState<CustomReportRecord[]>([]);
  const [draftReport, setDraftReport] = useState<CustomReportDraft>(defaultDraft);
  const [editingReportId, setEditingReportId] = useState<number | null>(null);
  const [draggingReportId, setDraggingReportId] = useState<number | null>(null);
  const [dropTargetReportId, setDropTargetReportId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ownerOptions = useMemo(() => {
    return [
      ...new Set(cases.map((caseItem) => getCaseOwnerLabel(caseItem.caseOwner))),
    ].sort((left, right) => left.localeCompare(right));
  }, []);

  const statusOptions = useMemo(() => {
    return [
      ...new Set(cases.map((caseItem) => caseItem.status?.trim()).filter((value): value is string => Boolean(value))),
    ].sort((left, right) => left.localeCompare(right));
  }, []);

  const priorityOptions = useMemo(() => {
    return [
      ...new Set(cases.map((caseItem) => caseItem.priority?.trim()).filter((value): value is string => Boolean(value))),
    ].sort((left, right) => left.localeCompare(right));
  }, []);

  const categoryOptions = useMemo(() => {
    return [
      ...new Set(cases.map((caseItem) => caseItem.category?.trim()).filter((value): value is string => Boolean(value))),
    ].sort((left, right) => left.localeCompare(right));
  }, []);

  const productOptions = useMemo(() => {
    return products
      .map((product) => ({ value: product.recordId, label: product.productName }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCustomReports() {
      try {
        const savedReports = await getCustomReports();
        if (!cancelled) {
          setCustomReports(sortCustomReports(savedReports));
        }
      } catch (loadError) {
        if (!cancelled) {
          console.error("Failed to load custom reports:", loadError);
          setCustomReports([]);
        }
      }
    }

    void loadCustomReports();

    return () => {
      cancelled = true;
    };
  }, []);

  const orderedReports = useMemo(() => sortCustomReports(customReports), [customReports]);

  const handleCreateOrUpdateReport = async () => {
    if (!draftReport.title.trim()) return;

    const payload: CustomReportInput = {
      title: draftReport.title.trim(),
      chartType: draftReport.chartType,
      metric: draftReport.metric,
      layoutSpan: draftReport.layoutSpan,
      sortOrder: draftReport.sortOrder,
      filters: draftReport.filters,
    };

    try {
      if (editingReportId !== null) {
        const updatedReport = await updateCustomReport(editingReportId, payload);
        setCustomReports((currentReports) =>
          sortCustomReports(currentReports.map((report) => (report.id === editingReportId ? updatedReport : report))),
        );
        setEditingReportId(null);
      } else {
        const createdReport = await createCustomReport(payload);
        setCustomReports((currentReports) => sortCustomReports([createdReport, ...currentReports]));
      }

      setDraftReport(defaultDraft);
    } catch (saveError) {
      console.error("Failed to save custom report:", saveError);
    }
  };

  const handleEditReport = (report: CustomReportRecord) => {
    setEditingReportId(report.id);
    setDraftReport({
      title: report.title,
      chartType: report.chartType,
      metric: report.metric,
      layoutSpan: report.layoutSpan,
      sortOrder: report.sortOrder,
      filters: report.filters,
    });
  };

  const handleDropReport = async (targetReportId: number) => {
    if (draggingReportId === null || draggingReportId === targetReportId) {
      setDropTargetReportId(null);
      return;
    }

    const sourceIndex = orderedReports.findIndex((report) => report.id === draggingReportId);
    const targetIndex = orderedReports.findIndex((report) => report.id === targetReportId);
    if (sourceIndex < 0 || targetIndex < 0) {
      setDropTargetReportId(null);
      return;
    }

    const reordered = [...orderedReports];
    const [draggedReport] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, draggedReport);

    const withUpdatedOrder = reordered.map((report, index) => ({
      ...report,
      sortOrder: index,
    }));

    const changedReports = withUpdatedOrder.filter((report) => {
      const original = orderedReports.find((item) => item.id === report.id);
      return original && original.sortOrder !== report.sortOrder;
    });

    if (changedReports.length === 0) {
      setDropTargetReportId(null);
      return;
    }

    try {
      const updatedReports = await Promise.all(
        changedReports.map((report) => updateCustomReport(report.id, buildCustomReportPayload(report))),
      );

      setCustomReports((currentReports) =>
        sortCustomReports(
          currentReports.map((report) => {
            const updated = updatedReports.find((item) => item.id === report.id);
            return updated ?? report;
          }),
        ),
      );
    } catch (moveError) {
      console.error("Failed to reorder custom reports:", moveError);
    } finally {
      setDropTargetReportId(null);
    }
  };

  const handleDeleteReport = async (reportId: number) => {
    try {
      await deleteCustomReport(reportId);
      setCustomReports((currentReports) => sortCustomReports(currentReports.filter((report) => report.id !== reportId)));
      if (editingReportId === reportId) {
        setEditingReportId(null);
        setDraftReport(defaultDraft);
      }
    } catch (deleteError) {
      console.error("Failed to delete custom report:", deleteError);
    }
  };

  const handleCancelEdit = () => {
    setEditingReportId(null);
    setDraftReport(defaultDraft);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-600 mt-1">Visualize NFR data and build your own custom reports.</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
        <div>
          <h2 className="font-semibold text-lg text-gray-900">Custom Report Builder</h2>
          <p className="text-sm text-gray-600 mt-1">Choose a chart, filter the cases, and save the report for later editing.</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-1 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Report title</label>
              <input
                type="text"
                value={draftReport.title}
                onChange={(e) => setDraftReport({ ...draftReport, title: e.target.value })}
                placeholder="e.g. High Priority by Owner"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chart type</label>
              <select
                value={draftReport.chartType}
                onChange={(e) => setDraftReport({ ...draftReport, chartType: e.target.value as ReportChartType })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white"
              >
                <option value="bar">Bar</option>
                <option value="line">Line</option>
                <option value="pie">Pie</option>
                <option value="table">Table</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Report metric</label>
              <select
                value={draftReport.metric}
                onChange={(e) => setDraftReport({ ...draftReport, metric: e.target.value as ReportMetric })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white"
              >
                <option value="status">Case status</option>
                <option value="priority">Priority</option>
                <option value="owner">Owner</option>
                <option value="product">Product</option>
                <option value="category">Category</option>
                <option value="monthCreated">Created over time</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chart width</label>
              <select
                value={draftReport.layoutSpan}
                onChange={(e) => setDraftReport({ ...draftReport, layoutSpan: Number(e.target.value) as 1 | 2 })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white"
              >
                <option value={1}>Half width</option>
                <option value={2}>Full width</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date range</label>
              <select
                value={draftReport.filters.dateRange}
                onChange={(e) =>
                  setDraftReport({
                    ...draftReport,
                    filters: { ...draftReport.filters, dateRange: e.target.value as ReportDateRange },
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white"
              >
                <option value="all-time">All time</option>
                <option value="last-7-days">Last 7 days</option>
                <option value="last-30-days">Last 30 days</option>
                <option value="last-90-days">Last 90 days</option>
                <option value="year-to-date">Year to date</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreateOrUpdateReport}
                disabled={!draftReport.title.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#E31937] px-4 py-2 text-white hover:bg-[#c41230] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingReportId ? <PencilLine className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editingReportId ? "Update report" : "Save report"}
              </button>
              {editingReportId ? (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              ) : null}
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="text-sm font-medium text-gray-700">Filters</div>
              <select
                value={draftReport.filters.owner}
                onChange={(e) => setDraftReport({ ...draftReport, filters: { ...draftReport.filters, owner: e.target.value } })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white"
              >
                <option value="">Any owner</option>
                {ownerOptions.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </select>

              <select
                value={draftReport.filters.status}
                onChange={(e) => setDraftReport({ ...draftReport, filters: { ...draftReport.filters, status: e.target.value } })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white"
              >
                <option value="">Any status</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>

              <select
                value={draftReport.filters.priority}
                onChange={(e) => setDraftReport({ ...draftReport, filters: { ...draftReport.filters, priority: e.target.value } })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white"
              >
                <option value="">Any priority</option>
                {priorityOptions.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>

              <select
                value={draftReport.filters.category}
                onChange={(e) => setDraftReport({ ...draftReport, filters: { ...draftReport.filters, category: e.target.value } })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white"
              >
                <option value="">Any category</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>

              <select
                value={draftReport.filters.product}
                onChange={(e) => setDraftReport({ ...draftReport, filters: { ...draftReport.filters, product: e.target.value } })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white"
              >
                <option value="">Any product</option>
                {productOptions.map((product) => (
                  <option key={product.value} value={product.value}>
                    {product.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="xl:col-span-2 grid grid-cols-1 xl:grid-cols-2 gap-4 auto-rows-max">
            {customReports.length === 0 ? (
              <div className="xl:col-span-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-sm text-gray-600">
                No custom reports saved yet. Create one on the left, then edit or delete it from here later.
              </div>
            ) : null}

            {orderedReports.map((report) => {
              const reportData = buildReportData(report, cases);
              const isTable = report.chartType === "table";
              const cardSpanClass = report.layoutSpan === 2 ? "xl:col-span-2" : "xl:col-span-1";
              const isDragging = draggingReportId === report.id;
              const isDropTarget = dropTargetReportId === report.id;

              return (
                <div
                  key={report.id}
                  draggable
                  onDragStart={() => {
                    setDraggingReportId(report.id);
                    setDropTargetReportId(report.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (dropTargetReportId !== report.id) {
                      setDropTargetReportId(report.id);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    void handleDropReport(report.id);
                  }}
                  onDragEnd={() => {
                    setDraggingReportId(null);
                    setDropTargetReportId(null);
                  }}
                  className={`${cardSpanClass} rounded-xl border bg-white shadow-sm overflow-hidden transition-opacity ${
                    isDropTarget ? "border-[#E31937]" : "border-gray-200"
                  } ${isDragging ? "opacity-70" : "opacity-100"}`}
                >
                  <div className="flex flex-col gap-3 border-b border-gray-200 p-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">{report.title}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {report.chartType.toUpperCase()} chart for {report.metric}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Drag to reorder • Position {report.sortOrder + 1} • {getLayoutSpanLabel(report.layoutSpan)} • {describeFilters(report)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditReport(report)}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <PencilLine className="h-4 w-4" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteReport(report.id)}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="p-4">
                    {reportData.length === 0 ? (
                      <div className="rounded-lg bg-gray-50 p-6 text-sm text-gray-500">No cases match this configuration.</div>
                    ) : isTable ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-600">
                              <th className="px-3 py-2">Label</th>
                              <th className="px-3 py-2">Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {reportData.map((row) => (
                              <tr key={row.label}>
                                <td className="px-3 py-2 text-gray-900">{row.label}</td>
                                <td className="px-3 py-2 text-gray-700">{row.value}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : report.chartType === "pie" ? (
                      <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                          <Pie
                            data={reportData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ label, value }) => `${label}: ${value}`}
                            outerRadius={110}
                            dataKey="value"
                            nameKey="label"
                          >
                            {reportData.map((entry, index) => (
                              <Cell key={entry.label} fill={chartColors[index % chartColors.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : report.chartType === "line" ? (
                      <ResponsiveContainer width="100%" height={320}>
                        <LineChart data={reportData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                          <XAxis dataKey="label" stroke="#6B7280" />
                          <YAxis stroke="#6B7280" />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="value" stroke="#E31937" strokeWidth={2} name="Cases" />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={reportData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                          <XAxis dataKey="label" stroke="#6B7280" />
                          <YAxis stroke="#6B7280" />
                          <Tooltip />
                          <Bar dataKey="value" fill="#E31937" radius={[8, 8, 0, 0]} name="Cases" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}