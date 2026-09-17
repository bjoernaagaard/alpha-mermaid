import type { ElkExtendedEdge, ElkNode } from "elkjs";

import { clipEdgeToGeometry } from "./clipping.ts";
import type {
  MutablePoint,
  MutablePositionedEdge,
  MutablePositionedNode,
} from "./layout-model.ts";
import { DEFAULTS } from "./layout-model.ts";
import type {
  Edge,
  Graph,
  Point,
  PositionedGraph,
  PositionedGroup,
  Subgraph,
} from "./model.ts";
import { alignLayerNodes, bundleEdgePaths } from "./routing.ts";
import { ARROW_HEAD } from "./styles.ts";

interface MarginInfo {
  leftX: number;
  rightX: number;
}

const flattenGroupBounds = (
  groups: PositionedGroup[]
): { x: number; y: number; right: number; bottom: number }[] => {
  const bounds: { x: number; y: number; right: number; bottom: number }[] = [];

  for (const g of groups) {
    bounds.push(
      {
        bottom: g.y + g.height,
        right: g.x + g.width,
        x: g.x,
        y: g.y,
      },
      ...flattenGroupBounds(g.children)
    );
  }

  return bounds;
};

const collectAllSubgraphIds = (sg: Subgraph, out: Set<string>): void => {
  out.add(sg.id);

  for (const child of sg.children) {
    collectAllSubgraphIds(child, out);
  }
};

const findSubgraph = (
  subgraphs: readonly Subgraph[],
  id: string
): Subgraph | undefined => {
  for (const sg of subgraphs) {
    if (sg.id === id) {
      return sg;
    }

    const found = findSubgraph(sg.children, id);

    if (found) {
      return found;
    }
  }

  return undefined;
};

const resolveNodeStyle = (
  nodeId: string,
  graph: Graph
): Record<string, string> | undefined => {
  let result: Record<string, string> | undefined;

  // `classDef default` applies to every node.
  const defaultClass = graph.classDefs.get("default");

  if (defaultClass) {
    result = { ...defaultClass };
  }

  // Named class styles override matching default properties.
  const className = graph.classAssignments.get(nodeId);

  if (className) {
    const classDef = graph.classDefs.get(className);

    if (classDef) {
      result = result ? { ...result, ...classDef } : { ...classDef };
    }
  }

  // Explicit style directives override class styles.
  const nodeStyle = graph.nodeStyles.get(nodeId);

  if (nodeStyle) {
    result = result ? { ...result, ...nodeStyle } : { ...nodeStyle };
  }

  return result;
};

const extractNodesAndGroups = (
  elkNode: ElkNode,
  graph: Graph,
  subgraphIds: Set<string>,
  nodes: MutablePositionedNode[],
  groups: PositionedGroup[],
  offsetX: number,
  offsetY: number
): void => {
  if (!elkNode.children) {
    return;
  }

  for (const child of elkNode.children) {
    const x = (child.x ?? 0) + offsetX;
    const y = (child.y ?? 0) + offsetY;
    const width = child.width ?? 0;
    const height = child.height ?? 0;

    if (subgraphIds.has(child.id)) {
      // This is a subgraph/group
      const childGroups: PositionedGroup[] = [];

      // Recursively process children
      extractNodesAndGroups(
        child,
        graph,
        subgraphIds,
        nodes,
        childGroups,
        x,
        y
      );

      const mermaidSg = findSubgraph(graph.subgraphs, child.id);
      groups.push({
        children: childGroups,
        height,
        id: child.id,
        label: mermaidSg?.label ?? "",
        width,
        x,
        y,
      });
    } else {
      // This is a leaf node
      const mNode = graph.nodes.get(child.id);

      if (mNode) {
        // Resolve inline styles from nodeStyles map and classDefs
        const inlineStyle = resolveNodeStyle(child.id, graph);

        const positionedNode: MutablePositionedNode = {
          geometry: mNode.geometry,
          height,
          id: child.id,
          label: mNode.label,
          width,
          x,
          y,
        };

        if (inlineStyle) {
          positionedNode.inlineStyle = inlineStyle;
        }

        nodes.push(positionedNode);
      }

      // Also check for nested children (shouldn't happen for leaf nodes, but be safe)
      if (child.children && child.children.length > 0) {
        extractNodesAndGroups(child, graph, subgraphIds, nodes, groups, x, y);
      }
    }
  }
};

interface EdgeSegment {
  edgeIndex: number;
  // True for port-to-node segments (for example, "e3_internal").
  isInternal: boolean;
  points: MutablePoint[];
  labelPosition?: Point | undefined;
}

interface EdgeSegments {
  external?: EdgeSegment;
  incoming?: EdgeSegment;
  outgoing?: EdgeSegment;
}

const extractSegment = (
  elkEdge: ElkExtendedEdge,
  offsetX: number,
  offsetY: number
): EdgeSegment | undefined => {
  const isInternal = elkEdge.id.endsWith("_internal");
  const edgeId = elkEdge.id.slice(1).replace(/_internal$/u, "");
  const edgeIndex = Math.trunc(Number(edgeId));

  if (Number.isNaN(edgeIndex)) {
    return undefined;
  }

  const points: MutablePoint[] = [];
  const section = elkEdge.sections?.[0];

  if (section) {
    const { endPoint, startPoint } = section;
    points.push({ x: startPoint.x + offsetX, y: startPoint.y + offsetY });

    for (const bendPoint of section.bendPoints ?? []) {
      points.push({ x: bendPoint.x + offsetX, y: bendPoint.y + offsetY });
    }

    points.push({ x: endPoint.x + offsetX, y: endPoint.y + offsetY });
  }

  const label = elkEdge.labels?.[0];
  let labelPosition: Point | undefined;

  if (label?.x !== undefined && label.y !== undefined) {
    labelPosition = {
      x: label.x + (label.width ?? 0) / 2 + offsetX,
      y: label.y + (label.height ?? 0) / 2 + offsetY,
    };
  }

  return { edgeIndex, isInternal, labelPosition, points };
};

const storeSegment = (
  elkEdge: ElkExtendedEdge,
  segment: EdgeSegment,
  segments: Map<number, EdgeSegments>
): void => {
  const edgeSegments = segments.get(segment.edgeIndex) ?? {};
  segments.set(segment.edgeIndex, edgeSegments);

  if (!segment.isInternal) {
    edgeSegments.external = segment;

    return;
  }

  const [source = ""] = elkEdge.sources ?? [];
  const [target = ""] = elkEdge.targets ?? [];
  const sourceIsPort = source.includes("_in_") || source.includes("_out_");
  const targetIsPort = target.includes("_in_") || target.includes("_out_");

  if (sourceIsPort) {
    edgeSegments.incoming = segment;
  } else if (targetIsPort) {
    edgeSegments.outgoing = segment;
  }
};

const collectEdgeSegments = (
  elkNode: ElkNode,
  segments: Map<number, EdgeSegments>,
  offsetX: number,
  offsetY: number
): void => {
  for (const elkEdge of elkNode.edges ?? []) {
    const segment = extractSegment(elkEdge, offsetX, offsetY);

    if (segment) {
      storeSegment(elkEdge, segment, segments);
    }
  }

  for (const child of elkNode.children ?? []) {
    collectEdgeSegments(
      child,
      segments,
      offsetX + (child.x ?? 0),
      offsetY + (child.y ?? 0)
    );
  }
};

const adjacentPairs = (values: readonly Point[]): [Point, Point][] => {
  const [first, ...remaining] = values;

  if (first === undefined) {
    return [];
  }

  const pairs: [Point, Point][] = [];
  let previous = first;

  for (const current of remaining) {
    pairs.push([previous, current]);
    previous = current;
  }

  return pairs;
};

const calculatePathMidpoint = (points: Point[]): Point => {
  const [first] = points;

  if (!first) {
    throw new Error("Cannot calculate the midpoint of an empty edge path");
  }

  const pairs = adjacentPairs(points);

  if (pairs.length === 0) {
    return first;
  }

  let totalLength = 0;

  for (const [start, end] of pairs) {
    totalLength += Math.hypot(end.x - start.x, end.y - start.y);
  }

  let remaining = totalLength / 2;

  for (const [start, end] of pairs) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLength = Math.hypot(dx, dy);

    if (remaining <= segmentLength) {
      const ratio = remaining / segmentLength;

      return {
        x: start.x + ratio * dx,
        y: start.y + ratio * dy,
      };
    }

    remaining -= segmentLength;
  }

  const last = points.at(-1);

  if (!last) {
    throw new Error("Edge path lost its required endpoint");
  }

  return last;
};

const orthogonalizeEdgePoints = (
  points: MutablePoint[],
  margins?: MarginInfo,
  edgeIndex = 0
): MutablePoint[] => {
  const [first] = points;
  const pairs = adjacentPairs(points);

  if (!first || pairs.length === 0) {
    return points;
  }

  // Check if any segment needs orthogonalization
  let needsWork = false;

  for (const [start, end] of pairs) {
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);

    if (dx > 1 && dy > 1) {
      needsWork = true;
      break;
    }
  }

  if (!needsWork) {
    return points;
  }

  const EDGE_SPACING = 12;
  const result: MutablePoint[] = [first];

  for (const [, current] of pairs) {
    const previous = result.at(-1);

    if (!previous) {
      throw new Error("Orthogonal edge path lost its previous endpoint");
    }

    const dx = Math.abs(current.x - previous.x);
    const dy = Math.abs(current.y - previous.y);

    if (dx > 1 && dy > 1) {
      if (margins) {
        // Margin routing: exit horizontally → travel vertically along margin → enter horizontally
        // Alternate left/right margins and offset for parallel edge spacing
        const useRight = edgeIndex % 2 === 0;
        const offset = Math.floor(edgeIndex / 2) * EDGE_SPACING;

        const marginX = useRight
          ? margins.rightX + offset
          : margins.leftX - offset;

        result.push(
          { x: marginX, y: previous.y },
          { x: marginX, y: current.y }
        );
      } else {
        // Fallback: Z-path through vertical midpoint
        const midY = (previous.y + current.y) / 2;
        result.push({ x: previous.x, y: midY }, { x: current.x, y: midY });
      }
    }

    result.push(current);
  }

  return result;
};

const resolveEdgeStyle = (
  edgeIndex: number,
  graph: Graph
): Record<string, string> | undefined => {
  let result: Record<string, string> | undefined;

  const defaultStyle = graph.linkStyles.get("default");

  if (defaultStyle) {
    result = { ...defaultStyle };
  }

  const indexStyle = graph.linkStyles.get(edgeIndex);

  if (indexStyle) {
    result = result ? { ...result, ...indexStyle } : { ...indexStyle };
  }

  return result;
};

const appendSegmentPoints = (
  destination: MutablePoint[],
  segment: EdgeSegment | undefined
): void => {
  if (!segment || segment.points.length === 0) {
    return;
  }

  destination.push(
    ...(destination.length === 0 ? segment.points : segment.points.slice(1))
  );
};

const joinSegmentPoints = (segments: EdgeSegments): MutablePoint[] => {
  const points: MutablePoint[] = [];

  // Preserve source-to-target order across hierarchy boundaries.
  appendSegmentPoints(points, segments.outgoing);
  appendSegmentPoints(points, segments.external);
  appendSegmentPoints(points, segments.incoming);

  return points;
};

const createPositionedEdge = (
  originalEdge: Edge,
  points: MutablePoint[],
  labelPosition: Point | undefined,
  inlineStyle: Record<string, string> | undefined
): MutablePositionedEdge => {
  const edge: MutablePositionedEdge = {
    hasArrowEnd: originalEdge.hasArrowEnd,
    hasArrowStart: originalEdge.hasArrowStart,
    points,
    source: originalEdge.source,
    style: originalEdge.style,
    target: originalEdge.target,
  };

  if (originalEdge.label) {
    edge.label = originalEdge.label;
  }

  if (originalEdge.terminalStart) {
    edge.terminalStart = originalEdge.terminalStart;
  }

  if (originalEdge.terminalEnd) {
    edge.terminalEnd = originalEdge.terminalEnd;
  }

  if (labelPosition) {
    edge.labelPosition = labelPosition;
  }

  if (inlineStyle) {
    edge.inlineStyle = inlineStyle;
  }

  return edge;
};

const extractEdgesRecursively = (
  elkNode: ElkNode,
  graph: Graph,
  edges: MutablePositionedEdge[],
  margins?: MarginInfo
): void => {
  // First pass: collect all edge segments
  const segments = new Map<number, EdgeSegments>();

  collectEdgeSegments(elkNode, segments, 0, 0);

  // Track margin-routed edge count for spacing offsets
  let marginEdgeIndex = 0;

  // Second pass: combine segments and create positioned edges
  for (const [edgeIndex, seg] of segments) {
    const originalEdge = graph.edges[edgeIndex];

    if (!originalEdge) {
      continue;
    }

    const allPoints = joinSegmentPoints(seg);

    // Label position: use ELK's inline label position (on-edge with collision avoidance)
    // Fall back to midpoint for hierarchical edges or when ELK position unavailable
    let labelPosition: Point | undefined;

    if (originalEdge.label && allPoints.length >= 2) {
      const elkLabelPos = seg.external?.labelPosition;
      labelPosition = elkLabelPos ?? calculatePathMidpoint(allPoints);
    }

    // Ensure all edge segments are orthogonal (horizontal or vertical only).
    // In SEPARATE hierarchy mode, ELK may produce diagonal segments for
    // cross-hierarchy edges where it only returns start/end points without
    // proper orthogonal bend points.
    // When margins are available, route through the diagram margins instead
    // of Z-paths through the middle (which cross through subgraphs).
    const orthogonalPoints = orthogonalizeEdgePoints(
      allPoints,
      margins,
      marginEdgeIndex
    );

    if (orthogonalPoints !== allPoints) {
      marginEdgeIndex += 1;
    }

    // Recalculate label position for margin-routed edges
    if (
      originalEdge.label &&
      orthogonalPoints !== allPoints &&
      orthogonalPoints.length >= 2
    ) {
      labelPosition = calculatePathMidpoint(orthogonalPoints);
    }

    const inlineStyle = resolveEdgeStyle(edgeIndex, graph);
    edges.push(
      createPositionedEdge(
        originalEdge,
        orthogonalPoints,
        labelPosition,
        inlineStyle
      )
    );
  }
};

export const elkToPositioned = (
  elkResult: ElkNode,
  graph: Graph,
  mergeEdges = false
): PositionedGraph => {
  const nodes: MutablePositionedNode[] = [];
  const edges: MutablePositionedEdge[] = [];
  const groups: PositionedGroup[] = [];

  // Build set of subgraph IDs for distinguishing compound nodes from leaf nodes
  const subgraphIds = new Set<string>();

  for (const sg of graph.subgraphs) {
    collectAllSubgraphIds(sg, subgraphIds);
  }

  // Extract nodes and groups recursively
  extractNodesAndGroups(elkResult, graph, subgraphIds, nodes, groups, 0, 0);

  // Compute margin positions for cross-hierarchy edge routing.
  // Margins sit outside all group bounding boxes so edges don't cross through subgraphs.
  const allBounds = flattenGroupBounds(groups);

  const margins: MarginInfo | undefined =
    allBounds.length > 0
      ? {
          leftX: Math.min(...allBounds.map((b) => b.x)) - 20,
          rightX: Math.max(...allBounds.map((b) => b.right)) + 20,
        }
      : undefined;

  // Extract edges recursively from all levels (root and subgraphs)
  // Edges are distributed to subgraphs for direction override to work,
  // so we need to collect them from all children with proper offsets
  extractEdgesRecursively(elkResult, graph, edges, margins);

  // Snap same-layer nodes to the same position along the flow axis.
  // ELK's orthogonal routing staggers nodes within a layer to create room for
  // edge bends, but this looks bad. We fix it by aligning layers, then let
  // edge bundling and clipping recalculate edge paths from corrected positions.
  alignLayerNodes(nodes, edges, graph.direction);

  // Bundle fan-out/fan-in edge paths into shared trunks when mergeEdges is enabled
  if (mergeEdges) {
    bundleEdgePaths(edges, nodes, groups, graph.direction);
  }

  // Apply geometry-aware edge clipping for non-rectangular shapes.
  // ELK treats all nodes as rectangles, so we need to clip edge endpoints
  // to the actual geometry boundaries (e.g., diamond vertices).
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (sourceNode) {
      edge.points = clipEdgeToGeometry(edge.points, sourceNode, true);
    }

    if (targetNode) {
      edge.points = clipEdgeToGeometry(edge.points, targetNode, false);
    }
  }

  // Calculate final bounds including all edge points
  // ELK should include edges in its dimensions, but we verify and expand if needed
  let width = elkResult.width ?? 800;
  let height = elkResult.height ?? 600;
  const arrowMargin = ARROW_HEAD.width;
  const { padding } = DEFAULTS;

  for (const edge of edges) {
    for (const p of edge.points) {
      width = Math.max(width, p.x + arrowMargin + padding);
      height = Math.max(height, p.y + arrowMargin + padding);
    }

    if (edge.labelPosition) {
      width = Math.max(width, edge.labelPosition.x + 60 + padding);
      height = Math.max(height, edge.labelPosition.y + 20 + padding);
    }
  }

  return {
    edges,
    groups,
    height,
    nodes,
    width,
  };
};
