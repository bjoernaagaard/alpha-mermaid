import type { ElkNode } from "elkjs";

import { elkLayout } from "../elk.ts";
import type { RenderOptions } from "../options.ts";
import { measureLabel } from "../text-metrics.ts";
import type { Graph, PositionedGraph } from "./model.ts";

const directions = {
  BT: "UP",
  LR: "RIGHT",
  RL: "LEFT",
  TB: "DOWN",
  TD: "DOWN",
};

export const toElk = (graph: Graph, options: RenderOptions): ElkNode => {
  const padding = options.padding ?? 40;

  return {
    children: [...graph.nodes.values()].map((node) => {
      const metrics = measureLabel(node.label);

      return {
        height: Math.max(36, metrics.height + 20),
        id: node.id,
        labels: [{ text: node.label }],
        width: Math.max(60, metrics.width + 40),
      };
    }),
    edges: graph.edges.map((edge, index) => ({
      id: `e${index}`,
      sources: [edge.source],
      targets: [edge.target],
    })),
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.contentAlignment": "H_CENTER V_CENTER",
      "elk.direction": directions[graph.direction],
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.layered.compaction.postCompaction.strategy":
        "LEFT_RIGHT_CONSTRAINT_LOCKING",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.highDegreeNodes.threshold": "8",
      "elk.layered.highDegreeNodes.treatment": "true",
      "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "12",
      "elk.layered.spacing.edgeNodeBetweenLayers": "12",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(
        options.layerSpacing ?? 48
      ),
      "elk.layered.thoroughness": "3",
      "elk.layered.wrapping.strategy": "OFF",
      "elk.padding": `[top=${padding},left=${padding},bottom=${padding},right=${padding}]`,
      "elk.spacing.edgeEdge": "12",
      "elk.spacing.nodeNode": String(options.nodeSpacing ?? 28),
    },
  };
};

export const fromElk = (result: ElkNode, graph: Graph): PositionedGraph => {
  const nodes = (result.children ?? []).map((node) => {
    const original = graph.nodes.get(node.id);

    if (
      !original ||
      node.x === undefined ||
      node.y === undefined ||
      node.width === undefined ||
      node.height === undefined
    ) {
      throw new Error(`ELK returned an incomplete node: ${node.id}`);
    }

    return {
      ...original,
      height: node.height,
      width: node.width,
      x: node.x,
      y: node.y,
    };
  });

  const edges = (result.edges ?? []).map((edge, index) => {
    const original = graph.edges[index];
    const section = edge.sections?.[0];

    if (!original || !section) {
      throw new Error(`ELK returned an incomplete edge: ${edge.id}`);
    }

    return {
      ...original,
      points: [
        section.startPoint,
        ...(section.bendPoints ?? []),
        section.endPoint,
      ],
    };
  });

  if (result.width === undefined || result.height === undefined) {
    throw new Error("ELK returned no graph dimensions");
  }

  let { width, height } = result;

  for (const edge of edges) {
    for (const point of edge.points) {
      width = Math.max(width, point.x + 48);
      height = Math.max(height, point.y + 48);
    }
  }

  return { edges, height, nodes, width };
};

export const layoutFlowchart = (
  graph: Graph,
  options: RenderOptions
): PositionedGraph => fromElk(elkLayout(toElk(graph, options)), graph);
