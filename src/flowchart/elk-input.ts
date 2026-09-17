import type { ElkNode, ElkExtendedEdge, LayoutOptions } from "elkjs";

import type { RenderOptions } from "../options.ts";
import { measureMultilineText } from "../text-metrics.ts";
import { DEFAULTS } from "./layout-model.ts";
import type { Graph, Subgraph, Edge } from "./model.ts";
import { FONT_SIZES, FONT_WEIGHTS, NODE_PADDING } from "./styles.ts";

const directionToElk = (dir: Graph["direction"]): string => {
  switch (dir) {
    case "LR": {
      return "RIGHT";
    }

    case "RL": {
      return "LEFT";
    }

    case "BT": {
      return "UP";
    }

    default: {
      return "DOWN";
    }
  }
};

const estimateNodeSize = (label: string, geometry: string) => {
  const metrics = measureMultilineText(
    label,
    FONT_SIZES.nodeLabel,
    FONT_WEIGHTS.nodeLabel
  );

  let width = metrics.width + NODE_PADDING.horizontal * 2;
  let height = metrics.height + NODE_PADDING.vertical * 2;

  if (geometry === "diamond") {
    const side = Math.max(width, height) + NODE_PADDING.diamondExtra;
    width = side;
    height = side;
  }

  if (geometry === "circle" || geometry === "doublecircle") {
    const diameter = Math.ceil(Math.hypot(width, height)) + 8;
    width = geometry === "doublecircle" ? diameter + 12 : diameter;
    height = width;
  }

  if (geometry === "hexagon") {
    width += NODE_PADDING.horizontal;
  }

  if (
    geometry === "trapezoid" ||
    geometry === "trapezoid-alt" ||
    geometry === "parallelogram" ||
    geometry === "parallelogram-alt"
  ) {
    width += NODE_PADDING.horizontal;
  }

  if (geometry === "asymmetric") {
    width += 12;
  }

  if (geometry === "cylinder") {
    height += 14;
  }

  if (geometry === "state-start" || geometry === "state-end") {
    return { height: 28, width: 28 };
  }

  width = Math.max(width, 60);
  height = Math.max(height, 36);

  return { height, width };
};

interface ElkGraphNode extends ElkNode {
  children: ElkNode[];
  edges: ElkExtendedEdge[];
}

interface IndexedEdge {
  readonly index: number;
  readonly edge: Edge;
}

type CrossHierarchyEdge = IndexedEdge & {
  readonly sourceSubgraph: string | undefined;
  readonly targetSubgraph: string | undefined;
};

interface ClassifiedEdges {
  readonly edgesBySubgraph: Map<string | null, IndexedEdge[]>;
  readonly crossHierarchyEdges: CrossHierarchyEdge[];
}

interface SubgraphPort {
  readonly portId: string;
  readonly edgeIndex: number;
  readonly direction: "incoming" | "outgoing";
  readonly internalNodeId: string;
}

const collectSubgraphNodeIds = (
  sg: Subgraph,
  nodeIds: Set<string>,
  subgraphIds: Set<string>
): void => {
  for (const id of sg.nodeIds) {
    nodeIds.add(id);
  }

  for (const child of sg.children) {
    subgraphIds.add(child.id);
    collectSubgraphNodeIds(child, nodeIds, subgraphIds);
  }
};

const buildNodeToSubgraphMap = (
  subgraphs: readonly Subgraph[]
): Map<string, string> => {
  const map = new Map<string, string>();

  const traverse = (sg: Subgraph): void => {
    // Map all direct child nodes to this subgraph
    for (const nodeId of sg.nodeIds) {
      map.set(nodeId, sg.id);
    }

    // Recursively process nested subgraphs (they override parent mapping)
    for (const child of sg.children) {
      traverse(child);
    }
  };

  for (const sg of subgraphs) {
    traverse(sg);
  }

  return map;
};

const appendToMap = <Key, Value>(
  map: Map<Key, Value[]>,
  key: Key,
  value: Value
): void => {
  const values = map.get(key);

  if (values) {
    values.push(value);
  } else {
    map.set(key, [value]);
  }
};

const classifyEdges = (
  edges: readonly Edge[],
  nodeToSubgraph: ReadonlyMap<string, string>
): ClassifiedEdges => {
  const edgesBySubgraph = new Map<string | null, IndexedEdge[]>([[null, []]]);
  const crossHierarchyEdges: CrossHierarchyEdge[] = [];

  for (const [index, edge] of edges.entries()) {
    const sourceSubgraph = nodeToSubgraph.get(edge.source);
    const targetSubgraph = nodeToSubgraph.get(edge.target);
    const indexedEdge = { edge, index };

    if (sourceSubgraph && sourceSubgraph === targetSubgraph) {
      appendToMap(edgesBySubgraph, sourceSubgraph, indexedEdge);
    } else if (!sourceSubgraph && !targetSubgraph) {
      appendToMap(edgesBySubgraph, null, indexedEdge);
    } else {
      crossHierarchyEdges.push({
        ...indexedEdge,
        sourceSubgraph,
        targetSubgraph,
      });
    }
  }

  return { crossHierarchyEdges, edgesBySubgraph };
};

const addEdgeLabel = (elkEdge: ElkExtendedEdge, edge: Edge): void => {
  if (!edge.label) {
    return;
  }

  const metrics = measureMultilineText(
    edge.label,
    FONT_SIZES.edgeLabel,
    FONT_WEIGHTS.edgeLabel
  );

  elkEdge.labels = [
    {
      height: metrics.height + 6,
      layoutOptions: {
        "elk.edgeLabels.inline": "true",
        "elk.edgeLabels.placement": "CENTER",
      },
      text: edge.label,
      width: metrics.width + 8,
    },
  ];
};

const subgraphToElk = (
  sg: Subgraph,
  graph: Graph,
  opts: Required<
    Pick<
      RenderOptions,
      "font" | "padding" | "nodeSpacing" | "layerSpacing" | "componentSpacing"
    >
  >,
  edgesBySubgraph: Map<string | null, { index: number; edge: Edge }[]>,
  subgraphPorts: Map<string, SubgraphPort[]>
): ElkGraphNode => {
  const layoutOptions: LayoutOptions = {
    "elk.algorithm": "layered",
    "elk.contentAlignment": "H_CENTER V_CENTER",
    "elk.edgeRouting": "ORTHOGONAL",
    "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
    "elk.layered.spacing.edgeEdgeBetweenLayers": "12",
    "elk.layered.spacing.edgeNodeBetweenLayers": "12",
    "elk.layered.spacing.nodeNodeBetweenLayers": String(opts.layerSpacing),
    // Top = headerHeight(28) + gap(16) to match bottom padding
    "elk.padding": "[top=44,left=16,bottom=16,right=16]",
    "elk.spacing.componentComponent": String(opts.componentSpacing),
    "elk.spacing.edgeEdge": "12",
    "elk.spacing.nodeNode": String(opts.nodeSpacing),
  };

  // Apply direction override if specified
  if (sg.direction) {
    layoutOptions["elk.direction"] = directionToElk(sg.direction);
  }

  const elkNode: ElkGraphNode = {
    children: [],
    edges: [],
    id: sg.id,
    layoutOptions,
  };

  if (sg.label) {
    elkNode.labels = [{ text: sg.label }];
  }

  // Add hierarchical ports for cross-hierarchy edges (when using SEPARATE)
  const ports = subgraphPorts.get(sg.id) ?? [];

  if (ports.length > 0) {
    elkNode.ports = ports.map((p) => ({
      id: p.portId,
      // Port side is determined by ELK based on edge direction
    }));
  }

  // Add direct child nodes
  for (const nodeId of sg.nodeIds) {
    const node = graph.nodes.get(nodeId);

    if (node) {
      const size = estimateNodeSize(node.label, node.geometry);
      elkNode.children.push({
        height: size.height,
        id: nodeId,
        labels: [{ text: node.label }],
        width: size.width,
      });
    }
  }

  // Add nested subgraphs recursively
  for (const child of sg.children) {
    elkNode.children.push(
      subgraphToElk(child, graph, opts, edgesBySubgraph, subgraphPorts)
    );
  }

  // Add internal edges (edges where both endpoints are in this subgraph)
  const internalEdges = edgesBySubgraph.get(sg.id) ?? [];

  for (const { index, edge } of internalEdges) {
    const elkEdge: ElkExtendedEdge = {
      id: `e${index}`,
      sources: [edge.source],
      targets: [edge.target],
    };

    addEdgeLabel(elkEdge, edge);
    elkNode.edges.push(elkEdge);
  }

  // Add internal edge segments for hierarchical ports (port → node or node → port)
  // These connect the boundary ports to actual internal nodes
  for (const port of ports) {
    const internalEdgeId = `e${port.edgeIndex}_internal`;

    const elkEdge: ElkExtendedEdge =
      port.direction === "incoming"
        ? {
            id: internalEdgeId,
            sources: [port.portId],
            targets: [port.internalNodeId],
          }
        : {
            id: internalEdgeId,
            sources: [port.internalNodeId],
            targets: [port.portId],
          };

    elkNode.edges.push(elkEdge);
  }

  return elkNode;
};

export const mermaidToElk = (
  graph: Graph,
  opts: Required<
    Pick<
      RenderOptions,
      "font" | "padding" | "nodeSpacing" | "layerSpacing" | "componentSpacing"
    >
  >
): ElkGraphNode => {
  // Collect all node IDs that belong to subgraphs
  const subgraphNodeIds = new Set<string>();
  const subgraphIds = new Set<string>();

  for (const sg of graph.subgraphs) {
    subgraphIds.add(sg.id);
    collectSubgraphNodeIds(sg, subgraphNodeIds, subgraphIds);
  }

  // Build node-to-subgraph mapping for edge distribution
  const nodeToSubgraph = buildNodeToSubgraphMap(graph.subgraphs);

  // Classify edges into three categories:
  // 1. Internal edges (both endpoints in same subgraph)
  // 2. Root-level edges (neither endpoint in a subgraph)
  // 3. Cross-hierarchy edges (endpoints in different levels)
  const { crossHierarchyEdges, edgesBySubgraph } = classifyEdges(
    graph.edges,
    nodeToSubgraph
  );

  // Determine if we need SEPARATE hierarchy handling
  // We use SEPARATE when any subgraph has a direction override
  const hasDirectionOverride = graph.subgraphs.some(
    (sg) => sg.direction !== undefined
  );

  // Build the root ELK graph
  const elkGraph: ElkGraphNode = {
    children: [],
    edges: [],
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.contentAlignment": "H_CENTER V_CENTER",
      "elk.direction": directionToElk(graph.direction),
      "elk.edgeRouting": "ORTHOGONAL",
      // SEPARATE enables subgraph direction overrides; INCLUDE_CHILDREN gives simpler routing otherwise.
      "elk.hierarchyHandling": hasDirectionOverride
        ? "SEPARATE"
        : "INCLUDE_CHILDREN",
      "elk.layered.compaction.postCompaction.strategy":
        "LEFT_RIGHT_CONSTRAINT_LOCKING",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.highDegreeNodes.threshold": "8",
      "elk.layered.highDegreeNodes.treatment": "true",
      "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "12",
      "elk.layered.spacing.edgeNodeBetweenLayers": "12",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(opts.layerSpacing),
      "elk.layered.thoroughness": String(DEFAULTS.thoroughness),
      "elk.layered.wrapping.strategy": "OFF",
      "elk.padding": `[top=${opts.padding},left=${opts.padding},bottom=${opts.padding},right=${opts.padding}]`,
      "elk.spacing.componentComponent": String(opts.componentSpacing),
      "elk.spacing.edgeEdge": "12",
      "elk.spacing.nodeNode": String(opts.nodeSpacing),
    },
  };

  // Track hierarchical ports per subgraph for cross-hierarchy edges
  const subgraphPorts = new Map<string, SubgraphPort[]>();

  // Process cross-hierarchy edges to create port entries
  if (hasDirectionOverride) {
    for (const {
      index,
      edge,
      sourceSubgraph,
      targetSubgraph,
    } of crossHierarchyEdges) {
      // Handle outgoing edges from subgraph
      if (sourceSubgraph) {
        const portId = `${sourceSubgraph}_out_${index}`;

        appendToMap(subgraphPorts, sourceSubgraph, {
          direction: "outgoing",
          edgeIndex: index,
          internalNodeId: edge.source,
          portId,
        });
      }

      // Handle incoming edges to subgraph
      if (targetSubgraph) {
        const portId = `${targetSubgraph}_in_${index}`;

        appendToMap(subgraphPorts, targetSubgraph, {
          direction: "incoming",
          edgeIndex: index,
          internalNodeId: edge.target,
          portId,
        });
      }
    }
  }

  // Add top-level nodes (those not in any subgraph)
  for (const [id, node] of graph.nodes) {
    if (!subgraphNodeIds.has(id) && !subgraphIds.has(id)) {
      const size = estimateNodeSize(node.label, node.geometry);
      elkGraph.children.push({
        height: size.height,
        id,
        labels: [{ text: node.label }],
        width: size.width,
      });
    }
  }

  // Add subgraphs as compound nodes with children and their internal edges
  for (const sg of graph.subgraphs) {
    elkGraph.children.push(
      subgraphToElk(sg, graph, opts, edgesBySubgraph, subgraphPorts)
    );
  }

  // Add root-level edges
  for (const { index, edge } of edgesBySubgraph.get(null) ?? []) {
    const elkEdge: ElkExtendedEdge = {
      id: `e${index}`,
      sources: [edge.source],
      targets: [edge.target],
    };

    addEdgeLabel(elkEdge, edge);
    elkGraph.edges.push(elkEdge);
  }

  // Add cross-hierarchy edges (using ports when SEPARATE, direct when INCLUDE_CHILDREN)
  for (const {
    index,
    edge,
    sourceSubgraph,
    targetSubgraph,
  } of crossHierarchyEdges) {
    const elkEdge: ElkExtendedEdge = {
      id: `e${index}`,
      sources:
        hasDirectionOverride && sourceSubgraph
          ? [`${sourceSubgraph}_out_${index}`]
          : [edge.source],
      targets:
        hasDirectionOverride && targetSubgraph
          ? [`${targetSubgraph}_in_${index}`]
          : [edge.target],
    };

    addEdgeLabel(elkEdge, edge);
    elkGraph.edges.push(elkEdge);
  }

  return elkGraph;
};
