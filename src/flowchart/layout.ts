import type { ElkNode } from "elkjs";

import { elkLayout } from "../elk.ts";
import type { RenderOptions } from "../options.ts";
import { mermaidToElk } from "./elk-input.ts";
import { elkToPositioned } from "./elk-output.ts";
import { DEFAULTS } from "./layout-model.ts";
import type { Graph, PositionedGraph } from "./model.ts";

export const layoutFlowchart = (
  graph: Graph,
  options: RenderOptions = {}
): PositionedGraph => {
  const opts = { ...DEFAULTS, ...options };
  const elkGraph = mermaidToElk(graph, opts);
  const result = elkLayout(elkGraph);

  return elkToPositioned(result, graph, DEFAULTS.mergeEdges);
};

export const toElk = (graph: Graph, options: RenderOptions = {}): ElkNode => {
  const opts = { ...DEFAULTS, ...options };

  return mermaidToElk(graph, opts);
};

const validateElkResult = (node: ElkNode): void => {
  for (const child of node.children ?? []) {
    if (
      child.x === undefined ||
      child.y === undefined ||
      child.width === undefined ||
      child.height === undefined
    ) {
      throw new Error(`ELK returned an incomplete node: ${child.id}`);
    }

    validateElkResult(child);
  }
};

export const fromElk = (result: ElkNode, graph: Graph): PositionedGraph => {
  validateElkResult(result);

  if (result.width === undefined || result.height === undefined) {
    throw new Error("ELK returned no graph dimensions");
  }

  return elkToPositioned(result, graph, DEFAULTS.mergeEdges);
};
