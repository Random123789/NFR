import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Columns3,
  Database,
  Eye,
  Filter,
  GripVertical,
  Link2,
  Maximize2,
  Minimize2,
  PencilLine,
  Plus,
  Save,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import {
  createCustomReport,
  deleteCustomReport,
  getCustomReports,
  getReportBuilderSchema,
  previewReportQuery,
  runCustomReport,
  updateCustomReport,
  type CustomReportInput,
  type CustomReportRecord,
  type ReportBuilderFieldOption,
  type ReportBuilderSchema,
  type ReportChartType,
  type ReportFilterRule,
  type ReportJoinSpec,
  type ReportQueryMode,
  type ReportQuerySpec,
  type ReportRunResult,
} from "../data/apiClient";
import { chartColors } from "../data/recordStyles";

const defaultFilters = {
  dateRange: "all-time",
  owner: "",
  status: "",
  priority: "",
  category: "",
  product: "",
};

const TABLE_FIELD_PRESETS: Record<string, string[]> = {
  cases: ["cases.recordId", "cases.createdAt", "cases.updatedAt", "cases.status", "cases.priority", "cases.caseOwner", "cases.assignedTo", "cases.nfrRecordId", "cases.knockRecordId"],
  accounts: ["accounts.recordId", "accounts.accountName", "accounts.type", "accounts.vertical", "accounts.createdAt", "accounts.updatedAt"],
  projects: ["projects.recordId", "projects.projectName", "projects.stage", "projects.se", "projects.startDate", "projects.closeDate"],
  products: ["products.recordId", "products.productName", "products.productFamily", "products.createdAt", "products.updatedAt"],
  nfrs: ["nfrs.recordId", "nfrs.mantisId", "nfrs.nfrStatus", "nfrs.nfrRequestDate", "nfrs.nfrTargetDate"],
  knocks: ["knocks.recordId", "knocks.knockId", "knocks.status", "knocks.requestDate", "knocks.targetDate"],
};

const JOIN_FIELD_PRESETS: Record<string, string[]> = {
  accounts: ["accounts.accountName", "accounts.type", "accounts.vertical"],
  projects: ["projects.projectName", "projects.stage", "projects.se"],
  products: ["products.productName", "products.productFamily"],
  nfrs: ["nfrs.mantisId", "nfrs.nfrStatus", "nfrs.nfrTargetDate"],
  knocks: ["knocks.knockId", "knocks.status", "knocks.targetDate"],
  cases: ["cases.recordId", "cases.status", "cases.priority", "cases.createdAt"],
};

function createDefaultQuerySpec(base = "cases"): ReportQuerySpec {
  return {
    base,
    joins: [
      { source: "accounts", joinType: "left" },
      { source: "projects", joinType: "left" },
    ],
    mode: "aggregate",
    fields: ["cases.recordId", "cases.status", "accounts.accountName", "projects.projectName"],
    filters: [],
    groupBy: "cases.status",
    metric: { type: "count" },
    limit: 50,
    sortBy: "value",
    sortDirection: "desc",
  };
}

function createDefaultDraft(): CustomReportInput {
  return {
    title: "",
    chartType: "bar",
    metric: "count",
    layoutSpan: 2,
    sortOrder: 0,
    filters: defaultFilters,
    querySpec: createDefaultQuerySpec(),
  };
}

function fieldSource(fieldKey: string) {
  return fieldKey.split(".")[0] ?? "";
}

function sortCustomReports(reports: CustomReportRecord[]) {
  return [...reports].sort(
    (left, right) => left.sortOrder - right.sortOrder || right.updatedAt.localeCompare(left.updatedAt) || right.id - left.id,
  );
}

function getSource(schema: ReportBuilderSchema | null, key: string) {
  return schema?.sources.find((source) => source.key === key);
}

function getField(schema: ReportBuilderSchema | null, key: string) {
  return schema?.sources.flatMap((source) => source.fields).find((field) => field.key === key);
}

function getScopedFields(schema: ReportBuilderSchema | null, spec: ReportQuerySpec): ReportBuilderFieldOption[] {
  const activeSources = new Set([spec.base, ...spec.joins.map((join) => join.source)]);
  return (schema?.sources ?? [])
    .filter((source) => activeSources.has(source.key))
    .flatMap((source) => source.fields);
}

function getDefaultGroupBy(schema: ReportBuilderSchema | null, base: string) {
  const preferred = ["cases.status", "accounts.accountName", "projects.stage", "products.productFamily", "nfrs.nfrStatus", "knocks.status"];
  const source = getSource(schema, base);
  return preferred.find((field) => fieldSource(field) === base && source?.fields.some((option) => option.key === field)) ?? source?.fields[0]?.key ?? `${base}.recordId`;
}

function getDefaultFields(schema: ReportBuilderSchema | null, base: string) {
  const source = getSource(schema, base);
  const availableFields = new Set(source?.fields.map((field) => field.key) ?? []);
  const preset = (TABLE_FIELD_PRESETS[base] ?? []).filter((field) => availableFields.has(field));
  if (preset.length > 0) return preset;
  return source?.fields.slice(0, 6).map((field) => field.key) ?? [`${base}.recordId`];
}

function getDefaultJoinFields(schema: ReportBuilderSchema | null, sourceKey: string) {
  const source = getSource(schema, sourceKey);
  const availableFields = new Set(source?.fields.map((field) => field.key) ?? []);
  return (JOIN_FIELD_PRESETS[sourceKey] ?? []).filter((field) => availableFields.has(field));
}

function uniqueFields(fields: string[]) {
  return [...new Set(fields)];
}

function describeReport(schema: ReportBuilderSchema | null, report: CustomReportRecord) {
  const spec = report.querySpec ?? createDefaultQuerySpec();
  const base = getSource(schema, spec.base)?.label ?? spec.base;
  const joined = spec.joins.map((join) => getSource(schema, join.source)?.label ?? join.source);
  const shape = spec.mode === "table" ? "Table" : `Grouped by ${getField(schema, spec.groupBy ?? "")?.label ?? spec.groupBy}`;
  return [base, joined.length ? joined.join(", ") : null, shape].filter(Boolean).join(" / ");
}

function buildCustomReportPayload(report: CustomReportRecord): CustomReportInput {
  return {
    title: report.title,
    chartType: report.chartType,
    metric: report.metric,
    layoutSpan: report.layoutSpan,
    sortOrder: report.sortOrder,
    filters: report.filters,
    querySpec: report.querySpec,
  };
}

function toChartRows(result: ReportRunResult) {
  return result.rows.map((row, index) => ({
    id: String(row.label ?? index),
    label: String(row.label ?? "Unassigned"),
    value: Number(row.value ?? 0),
  }));
}

function formatCell(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function ReportVisualization({ chartType, result }: { chartType: ReportChartType; result?: ReportRunResult }) {
  if (!result) {
    return <div className="border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">Loading report data...</div>;
  }

  if (result.rows.length === 0) {
    return <div className="border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">No rows match this report.</div>;
  }

  if (chartType === "table" || result.mode === "table") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-600">
              {result.columns.map((column) => (
                <th key={column.key} className="px-3 py-2">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {result.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {result.columns.map((column) => (
                  <td key={column.key} className="px-3 py-2 text-gray-700">
                    {formatCell(row[column.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const chartRows = toChartRows(result);

  if (chartType === "pie") {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie
            data={chartRows}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ label, value }) => `${label}: ${value}`}
            outerRadius={110}
            dataKey="value"
            nameKey="label"
          >
            {chartRows.map((entry, index) => (
              <Cell key={entry.id} fill={chartColors[index % chartColors.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartRows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="label" stroke="#6B7280" />
          <YAxis stroke="#6B7280" />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="value" stroke="#E31937" strokeWidth={2} name="Count" />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={chartRows}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="label" stroke="#6B7280" />
        <YAxis stroke="#6B7280" />
        <Tooltip />
        <Bar dataKey="value" fill="#E31937" radius={[6, 6, 0, 0]} name="Count" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Reports() {
  const [schema, setSchema] = useState<ReportBuilderSchema | null>(null);
  const [customReports, setCustomReports] = useState<CustomReportRecord[]>([]);
  const [draftReport, setDraftReport] = useState<CustomReportInput>(createDefaultDraft);
  const [editingReportId, setEditingReportId] = useState<number | null>(null);
  const [draggingReportId, setDraggingReportId] = useState<number | null>(null);
  const [dropTargetReportId, setDropTargetReportId] = useState<number | null>(null);
  const [previewResult, setPreviewResult] = useState<ReportRunResult | null>(null);
  const [reportResults, setReportResults] = useState<Record<number, ReportRunResult>>({});
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentSpec = draftReport.querySpec ?? createDefaultQuerySpec();
  const baseSource = getSource(schema, currentSpec.base);
  const scopedFields = useMemo(() => getScopedFields(schema, currentSpec), [schema, currentSpec]);
  const orderedReports = useMemo(() => sortCustomReports(customReports), [customReports]);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      try {
        const [builderSchema, savedReports] = await Promise.all([getReportBuilderSchema(), getCustomReports()]);
        if (!cancelled) {
          setSchema(builderSchema);
          setCustomReports(sortCustomReports(savedReports));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load reports");
        }
      }
    }

    void loadReports();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (customReports.length === 0) return;

    let cancelled = false;

    async function loadResults() {
      const entries = await Promise.all(
        customReports.map(async (report) => {
          try {
            return [report.id, await runCustomReport(report.id)] as const;
          } catch {
            return [report.id, undefined] as const;
          }
        }),
      );

      if (!cancelled) {
        setReportResults((current) => {
          const next = { ...current };
          for (const [reportId, result] of entries) {
            if (result) next[reportId] = result;
          }
          return next;
        });
      }
    }

    void loadResults();

    return () => {
      cancelled = true;
    };
  }, [customReports]);

  const updateSpec = (updater: (spec: ReportQuerySpec) => ReportQuerySpec) => {
    setDraftReport((current) => {
      const nextSpec = updater(current.querySpec ?? createDefaultQuerySpec());
      const nextChartType = nextSpec.mode === "table" ? "table" : current.chartType === "table" ? "bar" : current.chartType;
      return {
        ...current,
        chartType: nextChartType,
        metric: nextSpec.mode === "table" ? "table" : "count",
        querySpec: nextSpec,
      };
    });
    setPreviewResult(null);
  };

  const handleBaseChange = (base: string) => {
    updateSpec(() => ({
      ...createDefaultQuerySpec(base),
      joins: [],
      fields: getDefaultFields(schema, base),
      groupBy: getDefaultGroupBy(schema, base),
    }));
  };

  const handleJoinToggle = (source: string, enabled: boolean) => {
    updateSpec((spec) => {
      const joins = enabled
        ? [...spec.joins, { source, joinType: "left" as const }]
        : spec.joins.filter((join) => join.source !== source);

      const fields = enabled
        ? uniqueFields([...spec.fields, ...(spec.mode === "table" ? getDefaultJoinFields(schema, source) : [])])
        : spec.fields.filter((field) => fieldSource(field) !== source);
      const filters = enabled ? spec.filters : spec.filters.filter((filter) => fieldSource(filter.field) !== source);
      const groupBy = !enabled && fieldSource(spec.groupBy ?? "") === source ? getDefaultGroupBy(schema, spec.base) : spec.groupBy;

      return { ...spec, joins, fields, filters, groupBy };
    });
  };

  const handleJoinTypeChange = (source: string, joinType: ReportJoinSpec["joinType"]) => {
    updateSpec((spec) => ({
      ...spec,
      joins: spec.joins.map((join) => (join.source === source ? { ...join, joinType } : join)),
    }));
  };

  const handleFieldToggle = (fieldKey: string, enabled: boolean) => {
    updateSpec((spec) => ({
      ...spec,
      fields: enabled ? [...spec.fields, fieldKey] : spec.fields.filter((field) => field !== fieldKey),
    }));
  };

  const handleFilterChange = (index: number, nextFilter: ReportFilterRule) => {
    updateSpec((spec) => ({
      ...spec,
      filters: spec.filters.map((filter, filterIndex) => (filterIndex === index ? nextFilter : filter)),
    }));
  };

  const handleAddFilter = () => {
    const field = scopedFields[0]?.key ?? `${currentSpec.base}.recordId`;
    updateSpec((spec) => ({
      ...spec,
      filters: [...spec.filters, { field, operator: "eq", value: "" }],
    }));
  };

  const handleRemoveFilter = (index: number) => {
    updateSpec((spec) => ({
      ...spec,
      filters: spec.filters.filter((_, filterIndex) => filterIndex !== index),
    }));
  };

  const handlePreview = async () => {
    if (!draftReport.querySpec) return;

    setLoadingPreview(true);
    setError(null);
    try {
      const result = await previewReportQuery(draftReport.querySpec);
      setPreviewResult(result);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Failed to preview report");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCreateOrUpdateReport = async () => {
    if (!draftReport.title.trim() || !draftReport.querySpec) return;

    const payload: CustomReportInput = {
      title: draftReport.title.trim(),
      chartType: draftReport.chartType,
      metric: draftReport.metric,
      layoutSpan: draftReport.layoutSpan,
      sortOrder: draftReport.sortOrder,
      filters: draftReport.filters,
      querySpec: draftReport.querySpec,
    };

    try {
      if (editingReportId !== null) {
        const updatedReport = await updateCustomReport(editingReportId, payload);
        const result = await runCustomReport(updatedReport.id);
        setCustomReports((currentReports) =>
          sortCustomReports(currentReports.map((report) => (report.id === editingReportId ? updatedReport : report))),
        );
        setReportResults((current) => ({ ...current, [updatedReport.id]: result }));
        setEditingReportId(null);
      } else {
        const createdReport = await createCustomReport(payload);
        const result = await runCustomReport(createdReport.id);
        setCustomReports((currentReports) => sortCustomReports([createdReport, ...currentReports]));
        setReportResults((current) => ({ ...current, [createdReport.id]: result }));
      }

      setDraftReport(createDefaultDraft());
      setPreviewResult(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save report");
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
      querySpec: report.querySpec ?? createDefaultQuerySpec(),
    });
    setPreviewResult(reportResults[report.id] ?? null);
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

    try {
      const updatedReports = await Promise.all(
        changedReports.map((report) => updateCustomReport(report.id, buildCustomReportPayload(report))),
      );
      setCustomReports((currentReports) =>
        sortCustomReports(
          currentReports.map((report) => updatedReports.find((item) => item.id === report.id) ?? report),
        ),
      );
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "Failed to reorder reports");
    } finally {
      setDropTargetReportId(null);
    }
  };

  const handleReportSpanChange = async (report: CustomReportRecord, layoutSpan: 1 | 2) => {
    if (report.layoutSpan === layoutSpan) return;

    const resizedReport = { ...report, layoutSpan };
    setCustomReports((currentReports) =>
      sortCustomReports(currentReports.map((item) => (item.id === report.id ? resizedReport : item))),
    );

    try {
      const savedReport = await updateCustomReport(report.id, buildCustomReportPayload(resizedReport));
      setCustomReports((currentReports) =>
        sortCustomReports(currentReports.map((item) => (item.id === report.id ? savedReport : item))),
      );
    } catch (resizeError) {
      setError(resizeError instanceof Error ? resizeError.message : "Failed to resize report");
      setCustomReports((currentReports) =>
        sortCustomReports(currentReports.map((item) => (item.id === report.id ? report : item))),
      );
    }
  };

  const handleDeleteReport = async (reportId: number) => {
    try {
      await deleteCustomReport(reportId);
      setCustomReports((currentReports) => sortCustomReports(currentReports.filter((report) => report.id !== reportId)));
      setReportResults((current) => {
        const next = { ...current };
        delete next[reportId];
        return next;
      });
      if (editingReportId === reportId) {
        setEditingReportId(null);
        setDraftReport(createDefaultDraft());
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete report");
    }
  };

  const activeFieldGroups = useMemo(() => {
    const activeSources = new Set([currentSpec.base, ...currentSpec.joins.map((join) => join.source)]);
    return (schema?.sources ?? []).filter((source) => activeSources.has(source.key));
  }, [schema, currentSpec]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="mt-1 text-gray-600">Build saved reports from joined NFR records.</p>
        </div>
      </div>

      {error ? (
        <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 p-5">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-[#E31937]" />
            <h2 className="text-lg font-semibold text-gray-900">Custom Report Builder</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr]">
          <div className="border-b border-gray-200 p-5 xl:border-b-0 xl:border-r">
            <div className="space-y-5">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Report title</span>
                <input
                  type="text"
                  value={draftReport.title}
                  onChange={(event) => setDraftReport({ ...draftReport, title: event.target.value })}
                  placeholder="e.g. Open cases by account"
                  className="w-full border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Output</span>
                  <select
                    value={currentSpec.mode}
                    onChange={(event) => {
                      const mode = event.target.value as ReportQueryMode;
                      updateSpec((spec) => ({
                        ...spec,
                        mode,
                        fields:
                          mode === "table"
                            ? uniqueFields([
                                ...getDefaultFields(schema, spec.base),
                                ...spec.joins.flatMap((join) => getDefaultJoinFields(schema, join.source)),
                              ])
                            : spec.fields,
                        groupBy: mode === "aggregate" ? spec.groupBy ?? getDefaultGroupBy(schema, spec.base) : null,
                        sortBy: mode === "aggregate" ? "value" : getDefaultFields(schema, spec.base)[0] ?? `${spec.base}.recordId`,
                      }));
                    }}
                    className="w-full border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                  >
                    <option value="aggregate">Summary chart</option>
                    <option value="table">Details table</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Width</span>
                  <select
                    value={draftReport.layoutSpan}
                    onChange={(event) => setDraftReport({ ...draftReport, layoutSpan: Number(event.target.value) as 1 | 2 })}
                    className="w-full border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                  >
                    <option value={1}>Half</option>
                    <option value={2}>Full</option>
                  </select>
                </label>
              </div>

              {currentSpec.mode === "aggregate" ? (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Chart</span>
                  <select
                    value={draftReport.chartType}
                    onChange={(event) => setDraftReport({ ...draftReport, chartType: event.target.value as ReportChartType })}
                    className="w-full border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                  >
                    <option value="bar">Bar</option>
                    <option value="line">Line</option>
                    <option value="pie">Pie</option>
                  </select>
                </label>
              ) : null}

              <div className="border-t border-gray-200 pt-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <Database className="h-4 w-4" />
                  Start From
                </div>
                <select
                  value={currentSpec.base}
                  onChange={(event) => handleBaseChange(event.target.value)}
                  className="w-full border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                >
                  {(schema?.sources ?? []).map((source) => (
                    <option key={source.key} value={source.key}>
                      {source.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-t border-gray-200 pt-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <Link2 className="h-4 w-4" />
                  Include
                </div>
                <div className="space-y-2">
                  {(baseSource?.joins ?? []).map((joinOption) => {
                    const selected = currentSpec.joins.find((join) => join.source === joinOption.source);
                    return (
                      <div key={joinOption.source} className="grid grid-cols-[1fr_150px] gap-2">
                        <label className="flex items-center gap-2 border border-gray-200 px-3 py-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={Boolean(selected)}
                            onChange={(event) => handleJoinToggle(joinOption.source, event.target.checked)}
                            className="h-4 w-4 accent-[#E31937]"
                          />
                          {joinOption.label}
                        </label>
                        <select
                          value={selected?.joinType ?? "left"}
                          disabled={!selected}
                          onChange={(event) => handleJoinTypeChange(joinOption.source, event.target.value as ReportJoinSpec["joinType"])}
                          className="border border-gray-300 bg-white px-2 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                        >
                          <option value="left">Keep base</option>
                          <option value="inner">Matches</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-gray-200 pt-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  {currentSpec.mode === "table" ? <Columns3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
                  {currentSpec.mode === "table" ? "Fields" : "Group By"}
                </div>

                {currentSpec.mode === "aggregate" ? (
                  <select
                    value={currentSpec.groupBy ?? ""}
                    onChange={(event) => updateSpec((spec) => ({ ...spec, groupBy: event.target.value }))}
                    className="w-full border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                  >
                    {scopedFields.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-3">
                    <div className="border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                      Pick the columns to show in the table. Joined sources add their common name/status/date columns automatically.
                    </div>
                    <div className="max-h-64 space-y-4 overflow-y-auto pr-1">
                      {activeFieldGroups.map((source) => (
                        <div key={source.key}>
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{source.label}</div>
                          <div className="space-y-1">
                            {source.fields.map((field) => (
                              <label key={field.key} className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={currentSpec.fields.includes(field.key)}
                                  onChange={(event) => handleFieldToggle(field.key, event.target.checked)}
                                  className="h-4 w-4 accent-[#E31937]"
                                />
                                {field.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 pt-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <Filter className="h-4 w-4" />
                    Filters
                  </div>
                  <button
                    type="button"
                    onClick={handleAddFilter}
                    className="inline-flex items-center gap-1 border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>

                <div className="space-y-2">
                  {currentSpec.filters.length === 0 ? (
                    <div className="border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-500">No filters</div>
                  ) : null}

                  {currentSpec.filters.map((filter, index) => {
                    const needsValue = filter.operator !== "empty" && filter.operator !== "notEmpty";
                    return (
                      <div key={`${filter.field}-${index}`} className="grid grid-cols-[1fr_120px] gap-2">
                        <select
                          value={filter.field}
                          onChange={(event) => handleFilterChange(index, { ...filter, field: event.target.value })}
                          className="border border-gray-300 bg-white px-2 py-2 text-sm"
                        >
                          {scopedFields.map((field) => (
                            <option key={field.key} value={field.key}>
                              {field.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={filter.operator}
                          onChange={(event) => handleFilterChange(index, { ...filter, operator: event.target.value })}
                          className="border border-gray-300 bg-white px-2 py-2 text-sm"
                        >
                          {(schema?.operators ?? []).map((operator) => (
                            <option key={operator.key} value={operator.key}>
                              {operator.label}
                            </option>
                          ))}
                        </select>
                        {needsValue ? (
                          <input
                            type="text"
                            value={filter.value ?? ""}
                            onChange={(event) => handleFilterChange(index, { ...filter, value: event.target.value })}
                            className="border border-gray-300 px-2 py-2 text-sm"
                          />
                        ) : (
                          <div />
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveFilter(index)}
                          className="inline-flex items-center justify-center border border-red-200 px-2 py-2 text-sm text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-gray-200 pt-5">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Limit</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={currentSpec.limit}
                    onChange={(event) => updateSpec((spec) => ({ ...spec, limit: Number(event.target.value) }))}
                    className="w-full border border-gray-300 px-3 py-2"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Sort</span>
                  <select
                    value={currentSpec.sortBy ?? (currentSpec.mode === "aggregate" ? "value" : currentSpec.fields[0] ?? "")}
                    onChange={(event) => updateSpec((spec) => ({ ...spec, sortBy: event.target.value }))}
                    className="w-full border border-gray-300 bg-white px-3 py-2"
                  >
                    {currentSpec.mode === "aggregate" ? (
                      <>
                        <option value="value">Count</option>
                        <option value="label">Label</option>
                      </>
                    ) : (
                      scopedFields.map((field) => (
                        <option key={field.key} value={field.key}>
                          {field.label}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-5">
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={loadingPreview}
                  className="inline-flex items-center gap-2 border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Eye className="h-4 w-4" />
                  Preview
                </button>
                <button
                  type="button"
                  onClick={handleCreateOrUpdateReport}
                  disabled={!draftReport.title.trim()}
                  className="inline-flex items-center gap-2 bg-[#E31937] px-4 py-2 text-white hover:bg-[#c41230] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {editingReportId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editingReportId ? "Update" : "Save"}
                </button>
                {editingReportId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingReportId(null);
                      setDraftReport(createDefaultDraft());
                      setPreviewResult(null);
                    }}
                    className="inline-flex items-center gap-2 border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-900">Preview</h3>
              <span className="text-sm text-gray-500">{currentSpec.mode === "table" ? "Table" : "Summary"} result</span>
            </div>
            <ReportVisualization chartType={draftReport.chartType} result={previewResult ?? undefined} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {customReports.length === 0 ? (
          <div className="xl:col-span-2 border border-dashed border-gray-300 bg-gray-50 p-8 text-sm text-gray-600">
            No saved reports yet.
          </div>
        ) : null}

        {orderedReports.map((report) => {
          const result = reportResults[report.id];
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
              className={`${cardSpanClass} border bg-white shadow-sm transition-opacity ${
                isDropTarget ? "border-[#E31937]" : "border-gray-200"
              } ${isDragging ? "opacity-70" : "opacity-100"}`}
            >
              <div className="flex flex-col gap-3 border-b border-gray-200 p-4 md:flex-row md:items-start md:justify-between">
                <div className="flex gap-2">
                  <GripVertical className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{report.title}</h3>
                    <p className="mt-1 text-sm text-gray-600">{describeReport(schema, report)}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Position {report.sortOrder + 1} / {report.layoutSpan === 2 ? "Full width" : "Half width"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex border border-gray-300">
                    <button
                      type="button"
                      title="Small slot"
                      aria-label="Small slot"
                      aria-pressed={report.layoutSpan === 1}
                      onClick={() => void handleReportSpanChange(report, 1)}
                      className={`inline-flex h-9 w-9 items-center justify-center ${
                        report.layoutSpan === 1 ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <Minimize2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Long slot"
                      aria-label="Long slot"
                      aria-pressed={report.layoutSpan === 2}
                      onClick={() => void handleReportSpanChange(report, 2)}
                      className={`inline-flex h-9 w-9 items-center justify-center border-l border-gray-300 ${
                        report.layoutSpan === 2 ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEditReport(report)}
                    className="inline-flex items-center gap-2 border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <PencilLine className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteReport(report.id)}
                    className="inline-flex items-center gap-2 border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </div>
              <div className="p-4">
                <ReportVisualization chartType={report.chartType} result={result} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
