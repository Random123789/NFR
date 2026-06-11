import type { HistoryEntry } from "../data/apiClient";
import type { ELK, ElkNode } from "elkjs/lib/elk.bundled.js";
import { Loader2, Minus, Move, Plus, RotateCcw } from "lucide-react";
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

type HistoryGraphNode = {
  id: string;
  entry: HistoryEntry;
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
const GRAPH_PADDING = 28;
const MIN_GRAPH_SCALE = 0.35;
const MAX_GRAPH_SCALE = 2.5;
const INITIAL_VIEWPORT: GraphViewportTransform = { x: 0, y: 0, scale: 1 };

let elkInstancePromise: Promise<ELK> | null = null;

function getElkInstance() {
  if (!elkInstancePromise) {
    elkInstancePromise = import("elkjs/lib/elk.bundled.js").then((module) => new module.default());
  }

  return elkInstancePromise;
}

function getGraphAccentColor(action: string | null | undefined) {
  if (action === "Created") return "#E31937";
  if (action === "Comment") return "#16A34A";
  return "#2563EB";
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function wrapSvgText(value: string, maxLineLength: number, maxLines: number) {
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

    if (lines.length === maxLines) break;
  }

  if (lines.length < maxLines && currentLine) lines.push(currentLine);

  const consumedText = lines.join(" ");
  const originalText = words.join(" ");
  if (lines.length === maxLines && consumedText.length < originalText.length) {
    lines[maxLines - 1] = truncateText(lines[maxLines - 1], Math.max(4, maxLineLength - 3));
  }

  return lines.slice(0, maxLines);
}

function createHistoryGraph(history: HistoryEntry[]): ElkNode {
  return {
    id: "history-graph",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "56",
      "elk.layered.spacing.nodeNodeBetweenLayers": "76",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: history.map((_, index) => ({
      id: `history-node-${index}`,
      width: GRAPH_NODE_WIDTH,
      height: GRAPH_NODE_HEIGHT,
    })),
    edges: history.slice(1).map((_, index) => ({
      id: `history-edge-${index}`,
      sources: [`history-node-${index}`],
      targets: [`history-node-${index + 1}`],
    })),
  };
}

async function layoutHistoryGraph(history: HistoryEntry[]) {
  const elk = await getElkInstance();
  const layout = await elk.layout(createHistoryGraph(history));
  const entriesByNodeId = new Map(history.map((entry, index) => [`history-node-${index}`, entry]));
  const sequencesByNodeId = new Map(history.map((_, index) => [`history-node-${index}`, index + 1]));

  const nodes = (layout.children ?? []).map((node, index) => ({
    id: node.id,
    entry: entriesByNodeId.get(node.id) ?? history[index],
    sequence: sequencesByNodeId.get(node.id) ?? index + 1,
    x: node.x ?? 0,
    y: node.y ?? 0,
    width: node.width ?? GRAPH_NODE_WIDTH,
    height: node.height ?? GRAPH_NODE_HEIGHT,
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
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  scale: number;
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
      <Move className="mx-2 h-4 w-4 text-gray-500" aria-hidden="true" />
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
  const changeLines = wrapSvgText(formatHistoryEntryText(node.entry), 31, 3);

  return (
    <g transform={`translate(${node.x} ${node.y})`}>
      <rect width={node.width} height={node.height} rx="10" fill="#FFFFFF" stroke="#E5E7EB" />
      <rect width={node.width} height="6" rx="3" fill={getGraphAccentColor(node.entry.action)} />
      <text x="16" y="26" fill="#6B7280" fontSize="11" fontWeight="600">
        Step {node.sequence}
      </text>
      <text x="16" y="47" fill="#111827" fontSize="14" fontWeight="700">
        {truncateText(node.entry.action || "Update", 24)}
      </text>
      <text x="16" y="68" fill="#4B5563" fontSize="12">
        {truncateText(node.entry.user || "Unknown user", 30)}
      </text>
      <text x="16" y="87" fill="#6B7280" fontSize="11">
        {formatTimestampMinute(node.entry.timestamp)}
      </text>
      {changeLines.map((line, lineIndex) => (
        <text key={`${node.id}-line-${lineIndex}`} x="16" y={108 + lineIndex * 14} fill="#374151" fontSize="11">
          {line}
        </text>
      ))}
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
  const [layout, setLayout] = useState<HistoryGraphLayout | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [viewportTransform, setViewportTransform] = useState<GraphViewportTransform>(INITIAL_VIEWPORT);
  const [isPanning, setIsPanning] = useState(false);
  const graphViewportRef = useRef<HTMLDivElement | null>(null);
  const panStartRef = useRef<GraphPanStart | null>(null);

  useEffect(() => {
    if (!open) return;

    let isCancelled = false;
    setLayout(null);
    setLayoutError(null);
    setViewportTransform(INITIAL_VIEWPORT);

    void layoutHistoryGraph(chronologicalHistory)
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
  }, [chronologicalHistory, open]);

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
      <DialogContent className="max-h-[88vh] max-w-[calc(100vw-2rem)] gap-4 overflow-hidden p-0 sm:max-w-[min(76rem,calc(100vw-2rem))]">
        <DialogHeader className="border-b border-gray-200 px-6 py-5">
          <DialogTitle>History Graph</DialogTitle>
          <DialogDescription>
            Chronological update flow from creation through the latest recorded change.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6">
          <div
            ref={graphViewportRef}
            onWheel={handleGraphWheel}
            onPointerDown={handleGraphPointerDown}
            onPointerMove={handleGraphPointerMove}
            onPointerUp={stopGraphPan}
            onPointerCancel={stopGraphPan}
            className={`relative h-[min(66vh,42rem)] touch-none select-none overflow-hidden rounded-lg border border-gray-200 bg-gray-50 ${
              isPanning ? "cursor-grabbing" : "cursor-grab"
            }`}
          >
            {layout && (
              <GraphToolbar
                scale={viewportTransform.scale}
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
