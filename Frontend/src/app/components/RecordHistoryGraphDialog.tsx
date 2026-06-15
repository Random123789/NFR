import type { HistoryEntry } from "../data/apiClient";
import type { ELK, ElkNode } from "elkjs/lib/elk.bundled.js";
import { Loader2, Maximize2, Minimize2, Minus, Plus, RotateCcw } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { formatTimestampMinute } from "../utils/dateTime";
import { formatHistoryEntryText, sortHistoryEntries } from "../utils/historyEntries";

type GraphPoint = { x: number; y: number };
type HistoryGraphMode = "detail" | "week" | "month";
type HistoryPeriodOption = {
  key: string;
  title: string;
  entries: HistoryEntry[];
};

type HistoryGraphEntryItem = {
  kind: "entry";
  id: string;
  title: string;
  user: string;
  timestampLabel: string;
  detailText: string;
  action: string | null | undefined;
  field: string | null | undefined;
};

type HistoryGraphPeriodItem = {
  kind: "period";
  id: string;
  title: string;
  periodMode: Exclude<HistoryGraphMode, "detail">;
  updateCount: number;
  timestampLabel: string;
  detailText: string;
  action: string | null | undefined;
  entries: HistoryGraphEntryItem[];
};

type HistoryGraphItem = HistoryGraphEntryItem | HistoryGraphPeriodItem;
type HistoryGraphAccentType = "created" | "comment" | "status" | "assigned" | "update";

type HistoryGraphNode = {
  id: string;
  item: HistoryGraphItem;
  sequence: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type HistoryGraphEdge = {
  id: string;
  points: GraphPoint[];
};

type HistoryGraphLayout = {
  width: number;
  height: number;
  nodes: HistoryGraphNode[];
  edges: HistoryGraphEdge[];
};

type GraphViewportTransform = {
  x: number;
  y: number;
  scale: number;
};

type GraphPanStart = GraphViewportTransform & {
  pointerId: number;
  clientX: number;
  clientY: number;
};

const GRAPH_NODE_WIDTH = 260;
const GRAPH_NODE_HEIGHT = 146;
const PERIOD_NODE_WIDTH = 320;
const PERIOD_NODE_MIN_HEIGHT = 156;
const PERIOD_NODE_HEADER_HEIGHT = 88;
const DETAIL_NODE_DESCRIPTION_LINE_LENGTH = 31;
const DETAIL_NODE_DESCRIPTION_START_Y = 108;
const DETAIL_NODE_DESCRIPTION_LINE_HEIGHT = 14;
const PERIOD_ENTRY_DESCRIPTION_LINE_LENGTH = 39;
const PERIOD_ENTRY_DESCRIPTION_START_Y = 27;
const PERIOD_ENTRY_DESCRIPTION_LINE_HEIGHT = 13;
const PERIOD_ENTRY_META_GAP = 5;
const PERIOD_ENTRY_META_BOTTOM_PADDING = 14;
const GRAPH_PADDING = 28;
const MIN_GRAPH_SCALE = 0.35;
const MAX_GRAPH_SCALE = 2.5;
const INITIAL_VIEWPORT: GraphViewportTransform = { x: 0, y: 0, scale: 1 };
const GRAPH_MODES: Array<{ value: HistoryGraphMode; label: string }> = [
  { value: "detail", label: "Detail" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];
const GRAPH_ACCENT_COLORS: Record<HistoryGraphAccentType, string> = {
  created: "#E31937",
  comment: "#16A34A",
  status: "#F59E0B",
  assigned: "#7C3AED",
  update: "#2563EB",
};
const GRAPH_LEGEND_ITEMS: Array<{ label: string; type: HistoryGraphAccentType }> = [
  { label: "Created", type: "created" },
  { label: "Comment", type: "comment" },
  { label: "Escalation Status", type: "status" },
  { label: "Assigned To", type: "assigned" },
  { label: "Other Update", type: "update" },
];
const EMPTY_PERIOD_OPTIONS: HistoryPeriodOption[] = [];
const EMPTY_PERIOD_KEYS: string[] = [];

let elkInstancePromise: Promise<ELK> | null = null;

function getElkInstance() {
  if (!elkInstancePromise) {
    elkInstancePromise = import("elkjs/lib/elk.bundled.js").then((module) => new module.default());
  }

  return elkInstancePromise;
}

function getGraphAccentType(item: HistoryGraphItem | HistoryGraphEntryItem): HistoryGraphAccentType {
  if (item.kind === "period") {
    const entryTypes = item.entries.map(getGraphAccentType);
    if (entryTypes.includes("status")) return "status";
    if (entryTypes.includes("assigned")) return "assigned";
    if (entryTypes.includes("created")) return "created";
    if (entryTypes.includes("comment")) return "comment";
    return "update";
  }

  const normalizedAction = (item.action ?? "").trim().toLowerCase();
  const normalizedField = (item.field ?? "").trim().toLowerCase();
  const normalizedDetail = item.detailText.trim().toLowerCase();
  const isUpdateLike = normalizedAction === "updated" || Boolean(normalizedField);

  if (
    isUpdateLike &&
    (normalizedField === "status" ||
      normalizedField === "escalation status" ||
      normalizedDetail.includes("status changed") ||
      normalizedDetail.includes("escalation status changed"))
  ) {
    return "status";
  }

  if (
    isUpdateLike &&
    (normalizedField === "assigned to" ||
      normalizedField === "assignedto" ||
      normalizedDetail.includes("assigned to changed"))
  ) {
    return "assigned";
  }

  if (normalizedAction === "created") return "created";
  if (normalizedAction === "comment") return "comment";
  return "update";
}

function getGraphAccentColor(item: HistoryGraphItem | HistoryGraphEntryItem) {
  return GRAPH_ACCENT_COLORS[getGraphAccentType(item)];
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function wrapSvgText(value: string, maxLineLength: number) {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return ["No changes recorded"];

  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > maxLineLength && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) lines.push(currentLine);

  return lines;
}

function formatGraphDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function toDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getWeekStart(date: Date) {
  const weekStart = new Date(date);
  const daysSinceMonday = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - daysSinceMonday);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

function getHistoryBucket(entry: HistoryEntry, mode: Exclude<HistoryGraphMode, "detail">) {
  const parsed = new Date(entry.timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return {
      key: "unknown-date",
      title: "Unknown date",
    };
  }

  if (mode === "month") {
    return {
      key: `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`,
      title: parsed.toLocaleString("en-US", { month: "long", year: "numeric" }),
    };
  }

  const weekStart = getWeekStart(parsed);
  return {
    key: toDateKey(weekStart),
    title: `Week of ${formatGraphDate(weekStart)}`,
  };
}

function createPeriodOptions(history: HistoryEntry[], mode: Exclude<HistoryGraphMode, "detail">) {
  const buckets = new Map<string, HistoryPeriodOption>();

  for (const entry of history) {
    const bucket = getHistoryBucket(entry, mode);
    const existingBucket = buckets.get(bucket.key) ?? { key: bucket.key, title: bucket.title, entries: [] };
    existingBucket.entries.push(entry);
    buckets.set(bucket.key, existingBucket);
  }

  return [...buckets.values()];
}

function formatUpdateCount(count: number) {
  return `${count} update${count === 1 ? "" : "s"}`;
}

function formatPeriodDateRange(entries: HistoryEntry[]) {
  const dates = entries
    .map((entry) => new Date(entry.timestamp))
    .filter((date) => !Number.isNaN(date.getTime()));

  if (dates.length === 0) return "No dated updates";

  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  if (toDateKey(firstDate) === toDateKey(lastDate)) return formatGraphDate(firstDate);
  return `${formatGraphDate(firstDate)} - ${formatGraphDate(lastDate)}`;
}

function createHistoryGraphEntryItem(entry: HistoryEntry, index: number, idPrefix = "history-item"): HistoryGraphEntryItem {
  return {
    kind: "entry",
    id: `${idPrefix}-${index}`,
    title: entry.action || "Update",
    user: entry.user || "Unknown user",
    timestampLabel: formatTimestampMinute(entry.timestamp),
    detailText: formatHistoryEntryText(entry),
    action: entry.action,
    field: entry.field,
  };
}

function createHistoryGraphItems(history: HistoryEntry[]): HistoryGraphItem[] {
  return history.map((entry, index) => createHistoryGraphEntryItem(entry, index));
}

function createHistoryPeriodGraphItems(
  periods: HistoryPeriodOption[],
  mode: Exclude<HistoryGraphMode, "detail">,
): HistoryGraphItem[] {
  return periods.map((period, periodIndex) => {
    const entries = period.entries.map((entry, entryIndex) =>
      createHistoryGraphEntryItem(entry, entryIndex, `history-period-${periodIndex}-entry`)
    );

    return {
      kind: "period",
      id: `history-period-${mode}-${period.key}`,
      title: period.title,
      periodMode: mode,
      updateCount: entries.length,
      timestampLabel: formatUpdateCount(entries.length),
      detailText: formatPeriodDateRange(period.entries),
      action: entries.at(-1)?.action,
      entries,
    };
  });
}

function getDetailEntryNodeHeight(item: HistoryGraphEntryItem) {
  const descriptionLines = wrapSvgText(item.detailText, DETAIL_NODE_DESCRIPTION_LINE_LENGTH);
  return Math.max(
    GRAPH_NODE_HEIGHT,
    DETAIL_NODE_DESCRIPTION_START_Y + descriptionLines.length * DETAIL_NODE_DESCRIPTION_LINE_HEIGHT + 10,
  );
}

function getPeriodEntryRowHeight(item: HistoryGraphEntryItem) {
  const descriptionLines = wrapSvgText(item.detailText, PERIOD_ENTRY_DESCRIPTION_LINE_LENGTH);
  const metaY = PERIOD_ENTRY_DESCRIPTION_START_Y
    + descriptionLines.length * PERIOD_ENTRY_DESCRIPTION_LINE_HEIGHT
    + PERIOD_ENTRY_META_GAP;

  return metaY + PERIOD_ENTRY_META_BOTTOM_PADDING;
}

function getHistoryGraphItemDimensions(item: HistoryGraphItem) {
  if (item.kind === "period") {
    const entriesHeight = item.entries.reduce((height, entry) => height + getPeriodEntryRowHeight(entry), 0);

    return {
      width: PERIOD_NODE_WIDTH,
      height: Math.max(PERIOD_NODE_MIN_HEIGHT, PERIOD_NODE_HEADER_HEIGHT + entriesHeight + 12),
    };
  }

  return {
    width: GRAPH_NODE_WIDTH,
    height: getDetailEntryNodeHeight(item),
  };
}

function createHistoryGraph(items: HistoryGraphItem[]): ElkNode {
  return {
    id: "history-graph",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "56",
      "elk.layered.spacing.nodeNodeBetweenLayers": "76",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: items.map((item, index) => {
      const { width, height } = getHistoryGraphItemDimensions(item);
      return {
        id: `history-node-${index}`,
        width,
        height,
      };
    }),
    edges: items.slice(1).map((_, index) => ({
      id: `history-edge-${index}`,
      sources: [`history-node-${index}`],
      targets: [`history-node-${index + 1}`],
    })),
  };
}

async function layoutHistoryGraph(items: HistoryGraphItem[]) {
  const elk = await getElkInstance();
  const layout = await elk.layout(createHistoryGraph(items));
  const itemsByNodeId = new Map(items.map((item, index) => [`history-node-${index}`, item]));
  const sequencesByNodeId = new Map(items.map((_, index) => [`history-node-${index}`, index + 1]));
  const dimensionsByNodeId = new Map(items.map((item, index) => [`history-node-${index}`, getHistoryGraphItemDimensions(item)]));

  const nodes = (layout.children ?? []).map((node, index) => ({
    id: node.id,
    item: itemsByNodeId.get(node.id) ?? items[index],
    sequence: sequencesByNodeId.get(node.id) ?? index + 1,
    x: node.x ?? 0,
    y: node.y ?? 0,
    width: node.width ?? dimensionsByNodeId.get(node.id)?.width ?? GRAPH_NODE_WIDTH,
    height: node.height ?? dimensionsByNodeId.get(node.id)?.height ?? GRAPH_NODE_HEIGHT,
  }));

  const edges = (layout.edges ?? [])
    .map((edge) => {
      const section = edge.sections?.[0];
      return {
        id: edge.id,
        points: section ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint] : [],
      };
    })
    .filter((edge) => edge.points.length >= 2);

  const contentWidth = Math.max(layout.width ?? 0, ...nodes.map((node) => node.x + node.width), GRAPH_NODE_WIDTH);
  const contentHeight = Math.max(layout.height ?? 0, ...nodes.map((node) => node.y + node.height), GRAPH_NODE_HEIGHT);

  return {
    width: contentWidth + GRAPH_PADDING * 2,
    height: contentHeight + GRAPH_PADDING * 2,
    nodes,
    edges,
  };
}

function pointsToPath(points: GraphPoint[]) {
  const [firstPoint, ...restPoints] = points;
  if (!firstPoint) return "";
  return `M ${firstPoint.x} ${firstPoint.y} ${restPoints.map((point) => `L ${point.x} ${point.y}`).join(" ")}`;
}

function clampGraphScale(value: number) {
  return Math.min(MAX_GRAPH_SCALE, Math.max(MIN_GRAPH_SCALE, value));
}

function zoomTransformAtPoint(current: GraphViewportTransform, nextScale: number, point: GraphPoint) {
  const scale = clampGraphScale(nextScale);
  const graphX = (point.x - current.x) / current.scale;
  const graphY = (point.y - current.y) / current.scale;

  return {
    scale,
    x: point.x - graphX * scale,
    y: point.y - graphY * scale,
  };
}

function getCenterPoint(element: HTMLElement | null) {
  if (!element) return { x: 0, y: 0 };

  const rect = element.getBoundingClientRect();
  return {
    x: rect.width / 2,
    y: rect.height / 2,
  };
}

function GraphToolbar({
  scale,
  isFullscreen,
  onToggleFullscreen,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  scale: number;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  return (
    <div
      className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-gray-200 bg-white/95 p-1 shadow-sm"
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={onToggleFullscreen}
        title={isFullscreen ? "Exit full screen" : "Enter full screen"}
        aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
        aria-pressed={isFullscreen}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        title="Zoom in"
        aria-label="Zoom in"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        title="Zoom out"
        aria-label="Zoom out"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onReset}
        title="Reset view"
        aria-label="Reset view"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
      <span className="min-w-12 px-2 text-center text-xs font-medium text-gray-500">
        {Math.round(scale * 100)}%
      </span>
    </div>
  );
}

function GraphModeToggle({
  mode,
  onModeChange,
}: {
  mode: HistoryGraphMode;
  onModeChange: (nextMode: HistoryGraphMode) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
      {GRAPH_MODES.map((option) => {
        const isActive = option.value === mode;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onModeChange(option.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#E31937] ${
              isActive ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:bg-white/70"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function GraphLegend() {
  return (
    <div className="flex max-w-full flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
      {GRAPH_LEGEND_ITEMS.map((item) => (
        <span key={item.type} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: GRAPH_ACCENT_COLORS[item.type] }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function PeriodSelect({
  mode,
  options,
  values,
  onChange,
}: {
  mode: Exclude<HistoryGraphMode, "detail">;
  options: HistoryPeriodOption[];
  values: string[];
  onChange: (nextValues: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOptions = options.filter((option) => values.includes(option.key));
  const label = selectedOptions.length === 0
    ? `Select ${mode === "week" ? "weeks" : "months"}`
    : selectedOptions.length === 1
      ? selectedOptions[0].title
      : `${selectedOptions.length} ${mode === "week" ? "weeks" : "months"}`;

  const toggleOption = (optionKey: string) => {
    if (values.includes(optionKey)) {
      onChange(values.length > 1 ? values.filter((value) => value !== optionKey) : values);
      return;
    }

    onChange([...values, optionKey]);
  };

  return (
    <div className="relative min-w-0 text-xs font-medium text-gray-600">
      <span className="mb-1 block">{mode === "week" ? "Weeks" : "Months"}</span>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-9 w-full min-w-56 items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-2 text-left text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
      >
        <span className="truncate">{label}</span>
        <span className="text-xs text-gray-500">{selectedOptions.reduce((sum, option) => sum + option.entries.length, 0)}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => onChange(options.map((option) => option.key))}
              className="flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              All
            </button>
            <button
              type="button"
              onClick={() => onChange(options.at(-1)?.key ? [options.at(-1)!.key] : [])}
              className="flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Latest
            </button>
          </div>

          <div className="max-h-64 space-y-1 overflow-auto pr-1">
            {options.map((option) => {
              const checked = values.includes(option.key);
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => toggleOption(option.key)}
                  className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-gray-50 ${
                    checked ? "bg-red-50" : ""
                  }`}
                >
                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    checked ? "border-[#E31937] bg-[#E31937]" : "border-gray-300 bg-white"
                  }`}>
                    {checked && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">{option.title}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {option.entries.length} update{option.entries.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function GraphSvg({ layout }: { layout: HistoryGraphLayout }) {
  return (
    <svg
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className="block"
      role="img"
      aria-label="Chronological record history graph"
    >
      <defs>
        <marker id="history-graph-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L9,3 z" fill="#9CA3AF" />
        </marker>
      </defs>
      <g transform={`translate(${GRAPH_PADDING} ${GRAPH_PADDING})`}>
        {layout.edges.map((edge) => (
          <path
            key={edge.id}
            d={pointsToPath(edge.points)}
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="2"
            markerEnd="url(#history-graph-arrow)"
          />
        ))}

        {layout.nodes.map((node) => (
          <HistoryNode key={node.id} node={node} />
        ))}
      </g>
    </svg>
  );
}

function HistoryNode({ node }: { node: HistoryGraphNode }) {
  if (node.item.kind === "period") return <HistoryPeriodNode node={node} />;

  const item = node.item;
  const changeLines = wrapSvgText(item.detailText, DETAIL_NODE_DESCRIPTION_LINE_LENGTH);

  return (
    <g transform={`translate(${node.x} ${node.y})`}>
      <rect width={node.width} height={node.height} rx="10" fill="#FFFFFF" stroke="#E5E7EB" />
      <rect width={node.width} height="6" rx="3" fill={getGraphAccentColor(item)} />
      <text x="16" y="26" fill="#6B7280" fontSize="11" fontWeight="600">
        Step {node.sequence}
      </text>
      <text x="16" y="47" fill="#111827" fontSize="14" fontWeight="700">
        {truncateText(item.title, 24)}
      </text>
      <text x="16" y="68" fill="#4B5563" fontSize="12">
        {truncateText(item.user, 30)}
      </text>
      <text x="16" y="87" fill="#6B7280" fontSize="11">
        {truncateText(item.timestampLabel, 32)}
      </text>
      {changeLines.map((line, lineIndex) => (
        <text
          key={`${node.id}-line-${lineIndex}`}
          x="16"
          y={DETAIL_NODE_DESCRIPTION_START_Y + lineIndex * DETAIL_NODE_DESCRIPTION_LINE_HEIGHT}
          fill="#374151"
          fontSize="11"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function HistoryPeriodNode({ node }: { node: HistoryGraphNode }) {
  if (node.item.kind !== "period") return null;

  const item = node.item;
  const periodLabel = item.periodMode === "week" ? "Week" : "Month";
  let nextRowY = PERIOD_NODE_HEADER_HEIGHT;
  const rows = item.entries.map((entry) => {
    const descriptionLines = wrapSvgText(entry.detailText, PERIOD_ENTRY_DESCRIPTION_LINE_LENGTH);
    const rowHeight = getPeriodEntryRowHeight(entry);
    const row = {
      entry,
      descriptionLines,
      rowHeight,
      rowY: nextRowY,
      metaY: PERIOD_ENTRY_DESCRIPTION_START_Y
        + descriptionLines.length * PERIOD_ENTRY_DESCRIPTION_LINE_HEIGHT
        + PERIOD_ENTRY_META_GAP,
    };
    nextRowY += rowHeight;
    return row;
  });

  return (
    <g transform={`translate(${node.x} ${node.y})`}>
      <rect width={node.width} height={node.height} rx="10" fill="#FFFFFF" stroke="#E5E7EB" />
      <rect width={node.width} height="6" rx="3" fill={getGraphAccentColor(item)} />
      <text x="16" y="27" fill="#6B7280" fontSize="11" fontWeight="600">
        {periodLabel} {node.sequence}
      </text>
      <text x="16" y="50" fill="#111827" fontSize="14" fontWeight="700">
        {truncateText(item.title, 31)}
      </text>
      <text x="16" y="70" fill="#6B7280" fontSize="11">
        {truncateText(`${item.timestampLabel} - ${item.detailText}`, 40)}
      </text>
      <line x1="16" y1="84" x2={node.width - 16} y2="84" stroke="#E5E7EB" />

      {rows.map(({ entry, descriptionLines, rowHeight, rowY, metaY }, entryIndex) => {
        return (
          <g key={entry.id} transform={`translate(16 ${rowY})`}>
            <circle cx="5" cy="8" r="4" fill={getGraphAccentColor(entry)} />
            <text x="18" y="8" fill="#111827" fontSize="12" fontWeight="700">
              {truncateText(entry.title, 30)}
            </text>
            {descriptionLines.map((line, lineIndex) => (
              <text
                key={`${entry.id}-description-${lineIndex}`}
                x="18"
                y={PERIOD_ENTRY_DESCRIPTION_START_Y + lineIndex * PERIOD_ENTRY_DESCRIPTION_LINE_HEIGHT}
                fill="#374151"
                fontSize="11"
              >
                {line}
              </text>
            ))}
            <text x="18" y={metaY} fill="#6B7280" fontSize="10">
              {truncateText(`${entry.timestampLabel} - ${entry.user}`, 45)}
            </text>
            {entryIndex < rows.length - 1 && (
              <line x1="0" y1={rowHeight - 4} x2={node.width - 32} y2={rowHeight - 4} stroke="#F3F4F6" />
            )}
          </g>
        );
      })}
    </g>
  );
}

export function RecordHistoryGraphDialog({
  history,
  open,
  onOpenChange,
}: {
  history: HistoryEntry[];
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
}) {
  const chronologicalHistory = useMemo(() => sortHistoryEntries(history, "asc"), [history]);
  const [graphMode, setGraphMode] = useState<HistoryGraphMode>("detail");
  const [selectedWeekKeys, setSelectedWeekKeys] = useState<string[]>([]);
  const [selectedMonthKeys, setSelectedMonthKeys] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const weekOptions = useMemo(() => createPeriodOptions(chronologicalHistory, "week"), [chronologicalHistory]);
  const monthOptions = useMemo(() => createPeriodOptions(chronologicalHistory, "month"), [chronologicalHistory]);
  const activePeriodOptions = graphMode === "week" ? weekOptions : graphMode === "month" ? monthOptions : EMPTY_PERIOD_OPTIONS;
  const selectedPeriodKeys = graphMode === "week" ? selectedWeekKeys : graphMode === "month" ? selectedMonthKeys : EMPTY_PERIOD_KEYS;
  const selectedPeriodOptions = useMemo(() => {
    const selectedKeys = new Set(selectedPeriodKeys);
    return activePeriodOptions
      .filter((option) => selectedKeys.has(option.key));
  }, [activePeriodOptions, selectedPeriodKeys]);
  const graphItems = useMemo(() => {
    if (graphMode === "detail") return createHistoryGraphItems(chronologicalHistory);
    return createHistoryPeriodGraphItems(selectedPeriodOptions, graphMode);
  }, [chronologicalHistory, graphMode, selectedPeriodOptions]);
  const [layout, setLayout] = useState<HistoryGraphLayout | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [viewportTransform, setViewportTransform] = useState<GraphViewportTransform>(INITIAL_VIEWPORT);
  const [isPanning, setIsPanning] = useState(false);
  const graphViewportRef = useRef<HTMLDivElement | null>(null);
  const panStartRef = useRef<GraphPanStart | null>(null);

  useEffect(() => {
    setSelectedWeekKeys((currentKeys) =>
      currentKeys.some((key) => weekOptions.some((option) => option.key === key))
        ? currentKeys.filter((key) => weekOptions.some((option) => option.key === key))
        : weekOptions.map((option) => option.key)
    );
  }, [weekOptions]);

  useEffect(() => {
    setSelectedMonthKeys((currentKeys) =>
      currentKeys.some((key) => monthOptions.some((option) => option.key === key))
        ? currentKeys.filter((key) => monthOptions.some((option) => option.key === key))
        : monthOptions.map((option) => option.key)
    );
  }, [monthOptions]);

  useEffect(() => {
    if (!open) setIsFullscreen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let isCancelled = false;
    setLayout(null);
    setLayoutError(null);
    setViewportTransform(INITIAL_VIEWPORT);

    void layoutHistoryGraph(graphItems)
      .then((nextLayout) => {
        if (!isCancelled) setLayout(nextLayout);
      })
      .catch((error) => {
        console.error("Failed to build history graph:", error);
        if (!isCancelled) setLayoutError("Unable to build the graph for this history.");
      });

    return () => {
      isCancelled = true;
    };
  }, [graphItems, open]);

  const zoomBy = (factor: number) => {
    const centerPoint = getCenterPoint(graphViewportRef.current);
    setViewportTransform((current) => zoomTransformAtPoint(current, current.scale * factor, centerPoint));
  };

  const handleGraphWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    setViewportTransform((current) => zoomTransformAtPoint(current, current.scale * (event.deltaY > 0 ? 0.88 : 1.12), pointer));
  };

  const handleGraphPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    panStartRef.current = {
      ...viewportTransform,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    setIsPanning(true);
  };

  const handleGraphPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const panStart = panStartRef.current;
    if (!panStart || panStart.pointerId !== event.pointerId) return;

    setViewportTransform((current) => ({
      ...current,
      x: panStart.x + event.clientX - panStart.clientX,
      y: panStart.y + event.clientY - panStart.clientY,
    }));
  };

  const stopGraphPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panStartRef.current?.pointerId !== event.pointerId) return;
    panStartRef.current = null;
    setIsPanning(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 ${
          isFullscreen
            ? "h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-h-[calc(100dvh-1rem)] max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-1rem)]"
            : "max-h-[88vh] max-w-[calc(100vw-2rem)] sm:max-w-[min(76rem,calc(100vw-2rem))]"
        }`}
      >
        <DialogHeader className="border-b border-gray-200 px-6 py-5">
          <div className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <DialogTitle>History Graph</DialogTitle>
              <DialogDescription>
                Chronological update flow from creation through the latest recorded change.
              </DialogDescription>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <GraphModeToggle mode={graphMode} onModeChange={setGraphMode} />
              <GraphLegend />
              {graphMode !== "detail" && activePeriodOptions.length > 0 && (
                <PeriodSelect
                  mode={graphMode}
                  options={activePeriodOptions}
                  values={selectedPeriodKeys}
                  onChange={graphMode === "week" ? setSelectedWeekKeys : setSelectedMonthKeys}
                />
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 overflow-hidden px-6 pb-6 pt-4">
          <div
            ref={graphViewportRef}
            onWheel={handleGraphWheel}
            onPointerDown={handleGraphPointerDown}
            onPointerMove={handleGraphPointerMove}
            onPointerUp={stopGraphPan}
            onPointerCancel={stopGraphPan}
            className={`relative min-h-0 w-full touch-none select-none overflow-hidden rounded-lg border border-gray-200 bg-gray-50 ${
              isFullscreen ? "h-full flex-1" : "h-[min(66vh,42rem)]"
            } ${
              isPanning ? "cursor-grabbing" : "cursor-grab"
            }`}
          >
            {layout && (
              <GraphToolbar
                scale={viewportTransform.scale}
                isFullscreen={isFullscreen}
                onToggleFullscreen={() => setIsFullscreen((current) => !current)}
                onZoomIn={() => zoomBy(1.18)}
                onZoomOut={() => zoomBy(0.84)}
                onReset={() => setViewportTransform(INITIAL_VIEWPORT)}
              />
            )}

            {!layout && !layoutError && (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Laying out history graph
              </div>
            )}

            {layoutError && (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-500">
                {layoutError}
              </div>
            )}

            {layout && (
              <div
                className="absolute left-0 top-0"
                style={{
                  width: layout.width,
                  height: layout.height,
                  transform: `translate(${viewportTransform.x}px, ${viewportTransform.y}px) scale(${viewportTransform.scale})`,
                  transformOrigin: "0 0",
                }}
              >
                <GraphSvg layout={layout} />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
