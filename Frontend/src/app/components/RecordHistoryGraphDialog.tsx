import type { HistoryEntry } from "../data/apiClient";
import type { ELK, ElkNode } from "elkjs/lib/elk.bundled.js";
import { Loader2, Maximize2, MessageCircle, Minimize2, Minus, Plus, RotateCcw, Send, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { formatTimestampMinute } from "../utils/dateTime";
import {
  formatHistoryEntryText,
  getReplyEntriesForHistoryEntries,
  groupAdjacentHistoryUpdateEntries,
  parseQuotedReply,
  sortHistoryEntries,
  splitQuotedReplyHistoryEntries,
  type HistoryEntryUpdateGroup,
  type IndexedHistoryEntry,
} from "../utils/historyEntries";

type GraphPoint = { x: number; y: number };
type HistoryGraphMode = "detail" | "week" | "month";
type GraphReplyHandler = (entry: HistoryEntry, comment: string) => Promise<void>;
type HistoryPeriodOption = {
  key: string;
  title: string;
  entries: IndexedHistoryEntry[];
  updateCount: number;
};

type HistoryGraphReplyItem = {
  id: string;
  user: string;
  timestampLabel: string;
  detailText: string;
};

type HistoryGraphEntryItem = {
  kind: "entry";
  id: string;
  title: string;
  user: string;
  timestampLabel: string;
  detailText: string;
  detailTexts: string[];
  action: string | null | undefined;
  field: string | null | undefined;
  replyTargetEntry: HistoryEntry;
  replies: HistoryGraphReplyItem[];
};

type HistoryGraphPeriodItem = {
  kind: "period";
  id: string;
  title: string;
  periodMode: Exclude<HistoryGraphMode, "detail">;
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

type HistoryPeriodEntryRow = {
  entry: HistoryGraphEntryItem;
  descriptionLines: string[];
  rowHeight: number;
  rowY: number;
  metaY: number;
};

type GraphReplyButtonLayout = {
  id: string;
  item: HistoryGraphEntryItem;
  left: number;
  top: number;
  width: number;
  height: number;
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

type HistoryGraphModel = {
  baseEntries: IndexedHistoryEntry[];
  baseGroups: HistoryEntryUpdateGroup[];
  replyEntriesByTargetKey: Map<string, IndexedHistoryEntry[]>;
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
const PERIOD_ENTRY_LIST_TOP_GAP = 8;
const PERIOD_ENTRY_DESCRIPTION_START_Y = 31;
const PERIOD_ENTRY_DESCRIPTION_LINE_HEIGHT = 14;
const PERIOD_ENTRY_META_GAP = 8;
const PERIOD_ENTRY_META_BOTTOM_PADDING = 24;
const GRAPH_PADDING = 28;
const GRAPH_INITIAL_LEFT_INSET = 32;
const GRAPH_INITIAL_VERTICAL_INSET = 32;
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

function getGraphAccentType(item: HistoryGraphItem): HistoryGraphAccentType {
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
  const normalizedDetail = item.detailTexts.join(" ").trim().toLowerCase();
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

function getGraphAccentColor(item: HistoryGraphItem) {
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

function getWrappedGraphDetailLines(item: HistoryGraphEntryItem, maxLineLength: number) {
  return item.detailTexts.flatMap((detailText, index) => {
    const lines = wrapSvgText(detailText, maxLineLength);
    return index < item.detailTexts.length - 1 ? [...lines, ""] : lines;
  });
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

function createPeriodOptions(history: IndexedHistoryEntry[], mode: Exclude<HistoryGraphMode, "detail">) {
  const buckets = new Map<string, HistoryPeriodOption>();

  for (const indexedEntry of history) {
    const bucket = getHistoryBucket(indexedEntry.entry, mode);
    const existingBucket = buckets.get(bucket.key) ?? {
      key: bucket.key,
      title: bucket.title,
      entries: [],
      updateCount: 0,
    };
    existingBucket.entries.push(indexedEntry);
    buckets.set(bucket.key, existingBucket);
  }

  return [...buckets.values()].map((option) => ({
    ...option,
    updateCount: groupAdjacentHistoryUpdateEntries(option.entries).length,
  }));
}

function formatUpdateCount(count: number) {
  return `${count} update${count === 1 ? "" : "s"}`;
}

function formatReplyCount(count: number) {
  return `${count} ${count === 1 ? "reply" : "replies"}`;
}

function formatReplyActionLabel(count: number) {
  return count > 0 ? formatReplyCount(count) : "Reply";
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

function createHistoryGraphReplyItem(entry: HistoryEntry, index: number, idPrefix = "history-reply"): HistoryGraphReplyItem {
  const quotedReply = parseQuotedReply(entry.changes);

  return {
    id: `${idPrefix}-${index}`,
    user: entry.user || "Unknown user",
    timestampLabel: formatTimestampMinute(entry.timestamp),
    detailText: quotedReply?.replyBody || formatHistoryEntryText(entry),
  };
}

function createHistoryGraphModel(history: HistoryEntry[]): HistoryGraphModel {
  const { baseEntries, replyEntriesByTargetKey } = splitQuotedReplyHistoryEntries(history);

  return {
    baseEntries,
    baseGroups: groupAdjacentHistoryUpdateEntries(baseEntries),
    replyEntriesByTargetKey,
  };
}

function createHistoryGraphReplyItems(
  entries: HistoryEntry[],
  replyEntriesByTargetKey: Map<string, IndexedHistoryEntry[]>,
) {
  return getReplyEntriesForHistoryEntries(entries, replyEntriesByTargetKey)
    .map(({ entry, index }) => createHistoryGraphReplyItem(entry, index));
}

function createHistoryGraphEntryItem(
  entryOrEntries: HistoryEntry | HistoryEntry[],
  index: number,
  idPrefix = "history-item",
  replies: HistoryGraphReplyItem[] = [],
): HistoryGraphEntryItem {
  const entries = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];
  const entry = entries[0];
  const detailTexts = entries.map(formatHistoryEntryText);
  const isGroupedUpdate = entries.length > 1 && entries.every((groupEntry) => groupEntry.action === "Updated");

  return {
    kind: "entry",
    id: `${idPrefix}-${index}`,
    title: isGroupedUpdate ? `Updated (${entries.length} changes)` : entry.action || "Update",
    user: entry.user || "Unknown user",
    timestampLabel: formatTimestampMinute(entry.timestamp),
    detailText: detailTexts.join("\n"),
    detailTexts,
    action: entry.action,
    field: entries.map((groupEntry) => groupEntry.field).filter(Boolean).join(", ") || entry.field,
    replyTargetEntry: entry,
    replies,
  };
}

function createHistoryGraphItems(model: HistoryGraphModel): HistoryGraphItem[] {
  return model.baseGroups.map((group, groupIndex) =>
    createHistoryGraphEntryItem(
      group.entries,
      group.indices[0] ?? groupIndex,
      "history-item",
      createHistoryGraphReplyItems(group.entries, model.replyEntriesByTargetKey),
    )
  );
}

function createHistoryPeriodGraphItems(
  periods: HistoryPeriodOption[],
  mode: Exclude<HistoryGraphMode, "detail">,
  replyEntriesByTargetKey: Map<string, IndexedHistoryEntry[]>,
): HistoryGraphItem[] {
  return periods.map((period, periodIndex) => {
    const groupedEntries = groupAdjacentHistoryUpdateEntries(period.entries);
    const entries = groupedEntries.map((group, groupIndex) =>
      createHistoryGraphEntryItem(
        group.entries,
        group.indices[0] ?? groupIndex,
        `history-period-${periodIndex}-entry`,
        createHistoryGraphReplyItems(group.entries, replyEntriesByTargetKey),
      )
    );

    const periodEntries = period.entries.map(({ entry }) => entry);

    return {
      kind: "period",
      id: `history-period-${mode}-${period.key}`,
      title: period.title,
      periodMode: mode,
      timestampLabel: formatUpdateCount(entries.length),
      detailText: formatPeriodDateRange(periodEntries),
      action: entries.at(-1)?.action,
      entries,
    };
  });
}

function getDetailEntryNodeHeight(item: HistoryGraphEntryItem) {
  const descriptionLines = getWrappedGraphDetailLines(item, DETAIL_NODE_DESCRIPTION_LINE_LENGTH);
  return Math.max(
    GRAPH_NODE_HEIGHT,
    DETAIL_NODE_DESCRIPTION_START_Y + descriptionLines.length * DETAIL_NODE_DESCRIPTION_LINE_HEIGHT + 10,
  );
}

function getPeriodEntryRowHeight(item: HistoryGraphEntryItem) {
  const descriptionLines = getWrappedGraphDetailLines(item, PERIOD_ENTRY_DESCRIPTION_LINE_LENGTH);
  const metaY = PERIOD_ENTRY_DESCRIPTION_START_Y
    + descriptionLines.length * PERIOD_ENTRY_DESCRIPTION_LINE_HEIGHT
    + PERIOD_ENTRY_META_GAP;

  return metaY + PERIOD_ENTRY_META_BOTTOM_PADDING;
}

function getPeriodEntryRows(entries: HistoryGraphEntryItem[]): HistoryPeriodEntryRow[] {
  let nextRowY = PERIOD_NODE_HEADER_HEIGHT + PERIOD_ENTRY_LIST_TOP_GAP;

  return entries.map((entry) => {
    const descriptionLines = getWrappedGraphDetailLines(entry, PERIOD_ENTRY_DESCRIPTION_LINE_LENGTH);
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

function createGraphReplyButtonLayouts(layout: HistoryGraphLayout, canReply: boolean): GraphReplyButtonLayout[] {
  return layout.nodes.flatMap((node) => {
    if (node.item.kind === "entry") {
      if (!canReply && node.item.replies.length === 0) return [];

      return [{
        id: `${node.id}-replies`,
        item: node.item,
        left: GRAPH_PADDING + node.x + node.width - 100,
        top: GRAPH_PADDING + node.y + 17,
        width: 84,
        height: 23,
      }];
    }

    return getPeriodEntryRows(node.item.entries)
      .filter(({ entry }) => canReply || entry.replies.length > 0)
      .map(({ entry, rowY }) => ({
        id: `${node.id}-${entry.id}-replies`,
        item: entry,
        left: GRAPH_PADDING + node.x + node.width - 100,
        top: GRAPH_PADDING + node.y + rowY - 4,
        width: 82,
        height: 22,
      }));
  });
}

function findGraphEntryItem(items: HistoryGraphItem[], itemId: string): HistoryGraphEntryItem | null {
  for (const item of items) {
    if (item.kind === "entry") {
      if (item.id === itemId) return item;
      continue;
    }

    const periodEntry = item.entries.find((entry) => entry.id === itemId);
    if (periodEntry) return periodEntry;
  }

  return null;
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

function getFirstGraphColumnBounds(layout: HistoryGraphLayout) {
  if (layout.nodes.length === 0) return null;

  const firstColumnX = Math.min(...layout.nodes.map((node) => node.x));
  const firstColumnNodes = layout.nodes.filter((node) => Math.abs(node.x - firstColumnX) < 1);
  const top = Math.min(...firstColumnNodes.map((node) => node.y));
  const bottom = Math.max(...firstColumnNodes.map((node) => node.y + node.height));
  const right = Math.max(...firstColumnNodes.map((node) => node.x + node.width));

  return {
    x: firstColumnX,
    y: top,
    width: right - firstColumnX,
    height: bottom - top,
  };
}

function createInitialGraphViewport(layout: HistoryGraphLayout, viewportElement: HTMLElement | null): GraphViewportTransform {
  const firstColumn = getFirstGraphColumnBounds(layout);
  if (!firstColumn || !viewportElement) return INITIAL_VIEWPORT;

  const viewportRect = viewportElement.getBoundingClientRect();
  const firstColumnTop = GRAPH_PADDING + firstColumn.y;
  const firstColumnCenterY = firstColumnTop + firstColumn.height / 2;
  const availableHeight = Math.max(0, viewportRect.height - GRAPH_INITIAL_VERTICAL_INSET * 2);

  return {
    scale: 1,
    x: GRAPH_INITIAL_LEFT_INSET - (GRAPH_PADDING + firstColumn.x),
    y: firstColumn.height > availableHeight
      ? GRAPH_INITIAL_VERTICAL_INSET - firstColumnTop
      : viewportRect.height / 2 - firstColumnCenterY,
  };
}

function GraphToolbarButton({
  title,
  onClick,
  pressed,
  children,
}: {
  title: string;
  onClick: () => void;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
    >
      {children}
    </button>
  );
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
      <GraphToolbarButton
        title={isFullscreen ? "Exit full screen" : "Enter full screen"}
        onClick={onToggleFullscreen}
        pressed={isFullscreen}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </GraphToolbarButton>
      <GraphToolbarButton title="Zoom in" onClick={onZoomIn}>
        <Plus className="h-4 w-4" />
      </GraphToolbarButton>
      <GraphToolbarButton title="Zoom out" onClick={onZoomOut}>
        <Minus className="h-4 w-4" />
      </GraphToolbarButton>
      <GraphToolbarButton title="Reset view" onClick={onReset}>
        <RotateCcw className="h-4 w-4" />
      </GraphToolbarButton>
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
        <span className="text-xs text-gray-500">{selectedOptions.reduce((sum, option) => sum + option.updateCount, 0)}</span>
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
                      {formatUpdateCount(option.updateCount)}
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

function GraphSvg({
  layout,
  onShowReplies,
  canReply,
}: {
  layout: HistoryGraphLayout;
  onShowReplies: (item: HistoryGraphEntryItem) => void;
  canReply: boolean;
}) {
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
          <HistoryNode key={node.id} node={node} onShowReplies={onShowReplies} canReply={canReply} />
        ))}
      </g>
    </svg>
  );
}

function GraphReplyButtons({
  layout,
  onShowReplies,
  canReply,
}: {
  layout: HistoryGraphLayout;
  onShowReplies: (item: HistoryGraphEntryItem) => void;
  canReply: boolean;
}) {
  const buttons = createGraphReplyButtonLayouts(layout, canReply);

  if (buttons.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {buttons.map((button) => {
        const replyLabel = formatReplyActionLabel(button.item.replies.length);

        return (
          <button
            key={button.id}
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onShowReplies(button.item);
            }}
            title="Show replies"
            aria-label={`Show ${replyLabel}`}
            className="pointer-events-auto absolute rounded-full border border-gray-300 bg-gray-100 text-[10px] font-bold leading-none text-gray-700 shadow-sm transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#E31937]"
            style={{
              left: button.left,
              top: button.top,
              width: button.width,
              height: button.height,
            }}
          >
            {replyLabel}
          </button>
        );
      })}
    </div>
  );
}

function HistoryNode({
  node,
  onShowReplies,
  canReply,
}: {
  node: HistoryGraphNode;
  onShowReplies: (item: HistoryGraphEntryItem) => void;
  canReply: boolean;
}) {
  if (node.item.kind === "period") {
    return <HistoryPeriodNode node={node} onShowReplies={onShowReplies} canReply={canReply} />;
  }

  const item = node.item;
  const changeLines = getWrappedGraphDetailLines(item, DETAIL_NODE_DESCRIPTION_LINE_LENGTH);
  const showReplyAction = canReply || item.replies.length > 0;

  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      onClick={showReplyAction ? (event) => {
        event.stopPropagation();
        onShowReplies(item);
      } : undefined}
      className={showReplyAction ? "cursor-pointer" : undefined}
    >
      {showReplyAction && <title>{item.replies.length > 0 ? "Show replies" : "Reply"}</title>}
      <rect width={node.width} height={node.height} rx="10" fill="#FFFFFF" stroke="#E5E7EB" />
      <rect width={node.width} height="6" rx="3" fill={getGraphAccentColor(item)} />
      <text x="16" y="26" fill="#6B7280" fontSize="11" fontWeight="600">
        Step {node.sequence}
      </text>
      {showReplyAction && (
        <g transform={`translate(${node.width - 100} 17)`}>
          <rect width="84" height="23" rx="11.5" fill="#F3F4F6" stroke="#D1D5DB" />
          <text x="42" y="15" textAnchor="middle" fill="#374151" fontSize="10" fontWeight="700">
            {formatReplyActionLabel(item.replies.length)}
          </text>
        </g>
      )}
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

function HistoryPeriodNode({
  node,
  onShowReplies,
  canReply,
}: {
  node: HistoryGraphNode;
  onShowReplies: (item: HistoryGraphEntryItem) => void;
  canReply: boolean;
}) {
  if (node.item.kind !== "period") return null;

  const item = node.item;
  const periodLabel = item.periodMode === "week" ? "Week" : "Month";
  const rows = getPeriodEntryRows(item.entries);

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
        const showReplyAction = canReply || entry.replies.length > 0;

        return (
          <g
            key={entry.id}
            transform={`translate(16 ${rowY})`}
            onClick={showReplyAction ? (event) => {
              event.stopPropagation();
              onShowReplies(entry);
            } : undefined}
            className={showReplyAction ? "cursor-pointer" : undefined}
          >
            {showReplyAction && <title>{entry.replies.length > 0 ? "Show replies" : "Reply"}</title>}
            <circle cx="5" cy="8" r="4" fill={getGraphAccentColor(entry)} />
            <text x="18" y="8" fill="#111827" fontSize="12" fontWeight="700">
              {truncateText(entry.title, showReplyAction ? 21 : 30)}
            </text>
            {showReplyAction && (
              <g transform={`translate(${node.width - 116} -4)`}>
                <rect width="82" height="22" rx="11" fill="#F3F4F6" stroke="#D1D5DB" />
                <text x="41" y="14.5" textAnchor="middle" fill="#374151" fontSize="9.5" fontWeight="700">
                  {formatReplyActionLabel(entry.replies.length)}
                </text>
              </g>
            )}
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
              <line x1="0" y1={rowHeight - 10} x2={node.width - 32} y2={rowHeight - 10} stroke="#E5E7EB" />
            )}
          </g>
        );
      })}
    </g>
  );
}

function GraphRepliesPanel({
  item,
  onClose,
  onReply,
  isReplying,
}: {
  item: HistoryGraphEntryItem;
  onClose: () => void;
  onReply?: GraphReplyHandler;
  isReplying: boolean;
}) {
  const [replyDraft, setReplyDraft] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const trimmedReplyDraft = replyDraft.trim();
  const canSubmitReply = Boolean(onReply && trimmedReplyDraft && !isReplying);

  const handleSubmitReply = async () => {
    if (!onReply || !trimmedReplyDraft || isReplying) return;

    setReplyError(null);

    try {
      await onReply(item.replyTargetEntry, trimmedReplyDraft);
      setReplyDraft("");
    } catch {
      setReplyError("Could not add reply. Please try again.");
    }
  };

  return (
    <div
      className="absolute bottom-3 right-3 top-3 z-20 flex w-[min(22rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
              <MessageCircle className="h-4 w-4 text-gray-500" />
              Replies
            </p>
            <p className="mt-1 truncate text-xs text-gray-500">
              {item.title} by {item.user}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
            aria-label="Close replies"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 whitespace-pre-wrap break-words rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700 [overflow-wrap:anywhere]">
          {item.detailText}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
        {item.replies.length > 0 ? (
          item.replies.map((reply) => (
            <div key={reply.id} className="border-b border-gray-100 py-3 last:border-b-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                <span className="font-semibold text-gray-700">{reply.user}</span>
                <span>{reply.timestampLabel}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800 [overflow-wrap:anywhere]">
                {reply.detailText}
              </p>
            </div>
          ))
        ) : (
          <p className="py-4 text-sm text-gray-500">No replies yet.</p>
        )}
      </div>

      {onReply && (
        <div className="border-t border-gray-200 p-3">
          <textarea
            value={replyDraft}
            onChange={(event) => {
              setReplyDraft(event.target.value);
              if (replyError) setReplyError(null);
            }}
            placeholder="Write a reply..."
            rows={3}
            className="min-h-[84px] w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-[#E31937] focus:ring-2 focus:ring-[#E31937]/20"
            disabled={isReplying}
          />
          {replyError && <p className="mt-2 text-xs text-red-600">{replyError}</p>}
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => void handleSubmitReply()}
              disabled={!canSubmitReply}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-[#E31937] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#c91530] focus:outline-none focus:ring-2 focus:ring-[#E31937] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isReplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isReplying ? "Saving" : "Reply"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RecordHistoryGraphDialog({
  history,
  open,
  onOpenChange,
  onReply,
  isReplying = false,
}: {
  history: HistoryEntry[];
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  onReply?: GraphReplyHandler;
  isReplying?: boolean;
}) {
  const chronologicalHistory = useMemo(() => sortHistoryEntries(history, "asc"), [history]);
  const graphModel = useMemo(() => createHistoryGraphModel(chronologicalHistory), [chronologicalHistory]);
  const graphBaseHistory = graphModel.baseEntries;
  const [graphMode, setGraphMode] = useState<HistoryGraphMode>("detail");
  const [selectedWeekKeys, setSelectedWeekKeys] = useState<string[]>([]);
  const [selectedMonthKeys, setSelectedMonthKeys] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [replyPanelItem, setReplyPanelItem] = useState<HistoryGraphEntryItem | null>(null);
  const weekOptions = useMemo(() => createPeriodOptions(graphBaseHistory, "week"), [graphBaseHistory]);
  const monthOptions = useMemo(() => createPeriodOptions(graphBaseHistory, "month"), [graphBaseHistory]);
  const activePeriodOptions = graphMode === "week" ? weekOptions : graphMode === "month" ? monthOptions : EMPTY_PERIOD_OPTIONS;
  const selectedPeriodKeys = graphMode === "week" ? selectedWeekKeys : graphMode === "month" ? selectedMonthKeys : EMPTY_PERIOD_KEYS;
  const selectedPeriodOptions = useMemo(() => {
    const selectedKeys = new Set(selectedPeriodKeys);
    return activePeriodOptions
      .filter((option) => selectedKeys.has(option.key));
  }, [activePeriodOptions, selectedPeriodKeys]);
  const graphItems = useMemo(() => {
    if (graphMode === "detail") return createHistoryGraphItems(graphModel);
    return createHistoryPeriodGraphItems(selectedPeriodOptions, graphMode, graphModel.replyEntriesByTargetKey);
  }, [graphMode, graphModel, selectedPeriodOptions]);
  const [layout, setLayout] = useState<HistoryGraphLayout | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [viewportTransform, setViewportTransform] = useState<GraphViewportTransform>(INITIAL_VIEWPORT);
  const [isPanning, setIsPanning] = useState(false);
  const graphViewportRef = useRef<HTMLDivElement | null>(null);
  const panStartRef = useRef<GraphPanStart | null>(null);
  const shouldPreserveViewportOnNextLayoutRef = useRef(false);

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
    setReplyPanelItem((currentItem) => (
      currentItem ? findGraphEntryItem(graphItems, currentItem.id) : null
    ));
  }, [graphItems]);

  useEffect(() => {
    if (!open) return;

    let isCancelled = false;
    const shouldPreserveViewport = shouldPreserveViewportOnNextLayoutRef.current;
    if (!shouldPreserveViewport) setLayout(null);
    setLayoutError(null);
    if (!shouldPreserveViewport) setViewportTransform(INITIAL_VIEWPORT);

    void layoutHistoryGraph(graphItems)
      .then((nextLayout) => {
        if (!isCancelled) {
          setLayout(nextLayout);
          if (shouldPreserveViewport) {
            shouldPreserveViewportOnNextLayoutRef.current = false;
          } else {
            setViewportTransform(createInitialGraphViewport(nextLayout, graphViewportRef.current));
          }
        }
      })
      .catch((error) => {
        console.error("Failed to build history graph:", error);
        shouldPreserveViewportOnNextLayoutRef.current = false;
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

  const handleGraphReply: GraphReplyHandler | undefined = onReply
    ? async (entry, comment) => {
        shouldPreserveViewportOnNextLayoutRef.current = true;
        try {
          await onReply(entry, comment);
        } catch (error) {
          shouldPreserveViewportOnNextLayoutRef.current = false;
          throw error;
        }
      }
    : undefined;

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
                onReset={() => setViewportTransform(layout ? createInitialGraphViewport(layout, graphViewportRef.current) : INITIAL_VIEWPORT)}
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
                <GraphSvg layout={layout} onShowReplies={setReplyPanelItem} canReply={Boolean(handleGraphReply)} />
                <GraphReplyButtons layout={layout} onShowReplies={setReplyPanelItem} canReply={Boolean(handleGraphReply)} />
              </div>
            )}

            {replyPanelItem && (
              <GraphRepliesPanel
                item={replyPanelItem}
                onClose={() => setReplyPanelItem(null)}
                onReply={handleGraphReply}
                isReplying={isReplying}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
