import type {
  MutablePositionedEdge,
  MutablePositionedNode,
} from "./layout-model.ts";
import { DEFAULTS } from "./layout-model.ts";
import type { Direction, PositionedGroup } from "./model.ts";

interface NodeAndEdge {
  edge: MutablePositionedEdge;
  node: MutablePositionedNode;
}

const isHorizontalDirection = (direction: Direction): boolean =>
  direction === "LR" || direction === "RL";

const flowPosition = (
  node: MutablePositionedNode,
  horizontal: boolean
): number => (horizontal ? node.x : node.y);

const connectedNodePairs = (edges: MutablePositionedEdge[]): Set<string> => {
  const pairs = new Set<string>();

  for (const edge of edges) {
    pairs.add(`${edge.source}:${edge.target}`);
    pairs.add(`${edge.target}:${edge.source}`);
  }

  return pairs;
};

const clusterLayers = (
  nodes: MutablePositionedNode[],
  edges: MutablePositionedEdge[],
  horizontal: boolean
): MutablePositionedNode[][] => {
  const pairs = connectedNodePairs(edges);

  const sorted = [...nodes].toSorted(
    (left, right) =>
      flowPosition(left, horizontal) - flowPosition(right, horizontal)
  );

  const [first, ...remaining] = sorted;

  if (!first) {
    return [];
  }

  const layers: MutablePositionedNode[][] = [];
  let layer = [first];
  let previous = first;
  const threshold = DEFAULTS.layerSpacing * 0.6;

  for (const node of remaining) {
    const gap =
      flowPosition(node, horizontal) - flowPosition(previous, horizontal);

    const connected = layer.some((member) =>
      pairs.has(`${member.id}:${node.id}`)
    );

    if (gap <= threshold && !connected) {
      layer.push(node);
    } else {
      layers.push(layer);
      layer = [node];
    }

    previous = node;
  }

  layers.push(layer);

  return layers;
};

const snapLayers = (
  layers: MutablePositionedNode[][],
  horizontal: boolean
): Map<string, number> => {
  const deltas = new Map<string, number>();

  for (const layer of layers) {
    const positions = layer.map((node) => flowPosition(node, horizontal));
    const minimum = Math.min(...positions);
    const maximum = Math.max(...positions);

    if (layer.length <= 1 || maximum - minimum <= 1) {
      continue;
    }

    const target = (minimum + maximum) / 2;

    for (const node of layer) {
      const delta = target - flowPosition(node, horizontal);

      if (Math.abs(delta) <= 0.5) {
        continue;
      }

      if (horizontal) {
        node.x = target;
      } else {
        node.y = target;
      }

      deltas.set(node.id, delta);
    }
  }

  return deltas;
};

const shiftSourceEndpoint = (
  edge: MutablePositionedEdge,
  delta: number,
  horizontal: boolean
): void => {
  const [first, second] = edge.points;

  if (!(first && second)) {
    return;
  }

  if (horizontal) {
    const original = first.x;
    first.x += delta;

    if (second.x === original) {
      second.x += delta;
    }
  } else {
    const original = first.y;
    first.y += delta;

    if (second.y === original) {
      second.y += delta;
    }
  }
};

const shiftTargetEndpoint = (
  edge: MutablePositionedEdge,
  delta: number,
  horizontal: boolean
): void => {
  const last = edge.points.at(-1);
  const previous = edge.points.at(-2);

  if (!(last && previous)) {
    return;
  }

  if (horizontal) {
    const original = last.x;
    last.x += delta;

    if (previous.x === original) {
      previous.x += delta;
    }
  } else {
    const original = last.y;
    last.y += delta;

    if (previous.y === original) {
      previous.y += delta;
    }
  }
};

const adjustEdgeEndpoints = (
  edges: MutablePositionedEdge[],
  deltas: Map<string, number>,
  horizontal: boolean
): void => {
  for (const edge of edges) {
    if (edge.points.length < 2) {
      continue;
    }

    const sourceDelta = deltas.get(edge.source);

    if (sourceDelta !== undefined) {
      shiftSourceEndpoint(edge, sourceDelta, horizontal);
    }

    const targetDelta = deltas.get(edge.target);

    if (targetDelta !== undefined) {
      shiftTargetEndpoint(edge, targetDelta, horizontal);
    }
  }
};

export const alignLayerNodes = (
  nodes: MutablePositionedNode[],
  edges: MutablePositionedEdge[],
  direction: Direction
): void => {
  const horizontal = isHorizontalDirection(direction);
  const layers = clusterLayers(nodes, edges, horizontal);
  const deltas = snapLayers(layers, horizontal);
  adjustEdgeEndpoints(edges, deltas, horizontal);
};

const findGroupsContainingPoint = (
  x: number,
  y: number,
  groups: PositionedGroup[]
): PositionedGroup[] => {
  const result: PositionedGroup[] = [];

  for (const group of groups) {
    const contains =
      x >= group.x &&
      x <= group.x + group.width &&
      y >= group.y &&
      y <= group.y + group.height;

    if (contains) {
      result.push(group, ...findGroupsContainingPoint(x, y, group.children));
    }
  }

  return result;
};

const outsideGroupBoundary = (
  group: PositionedGroup,
  direction: Direction
): number => {
  const gap = 12;

  if (direction === "LR") {
    return group.x - gap;
  }

  if (direction === "RL") {
    return group.x + group.width + gap;
  }

  if (direction === "BT") {
    return group.y + group.height + gap;
  }

  return group.y - gap;
};

const adjustJunctionForGroups = (
  junctionMain: number,
  referenceX: number,
  referenceY: number,
  groups: PositionedGroup[],
  direction: Direction
): number => {
  const referenceGroups = new Set(
    findGroupsContainingPoint(referenceX, referenceY, groups).map(
      (group) => group.id
    )
  );

  const horizontal = isHorizontalDirection(direction);
  const probeX = horizontal ? junctionMain : referenceX;
  const probeY = horizontal ? referenceY : junctionMain;

  const crossingGroup = findGroupsContainingPoint(probeX, probeY, groups).find(
    (group) => !referenceGroups.has(group.id)
  );

  return crossingGroup
    ? outsideGroupBoundary(crossingGroup, direction)
    : junctionMain;
};

const groupEdges = (
  edges: MutablePositionedEdge[],
  key: "source" | "target",
  excluded?: Set<MutablePositionedEdge>
): Map<string, MutablePositionedEdge[]> => {
  const groups = new Map<string, MutablePositionedEdge[]>();

  for (const edge of edges) {
    if (edge.source === edge.target || excluded?.has(edge)) {
      continue;
    }

    const id = edge[key];
    const group = groups.get(id);

    if (group) {
      group.push(edge);
    } else {
      groups.set(id, [edge]);
    }
  }

  return groups;
};

const hasCompatibleStyle = (edges: MutablePositionedEdge[]): boolean => {
  const [first] = edges;

  return Boolean(
    first &&
    edges.length >= 2 &&
    !edges.some((edge) => edge.label || edge.style !== first.style)
  );
};

const isForward = (
  source: MutablePositionedNode,
  target: MutablePositionedNode,
  direction: Direction
): boolean => {
  if (direction === "LR") {
    return target.x > source.x + source.width;
  }

  if (direction === "RL") {
    return target.x + target.width < source.x;
  }

  if (direction === "BT") {
    return target.y + target.height < source.y;
  }

  return target.y > source.y + source.height;
};

const resolveNodes = (
  edges: MutablePositionedEdge[],
  nodeMap: Map<string, MutablePositionedNode>,
  endpoint: "source" | "target"
): NodeAndEdge[] => {
  const resolved: NodeAndEdge[] = [];

  for (const edge of edges) {
    const node = nodeMap.get(edge[endpoint]);

    if (node) {
      resolved.push({ edge, node });
    }
  }

  return resolved;
};

const routeHorizontalFanOut = (
  source: MutablePositionedNode,
  targets: NodeAndEdge[],
  groups: PositionedGroup[],
  direction: Direction,
  processed: Set<MutablePositionedEdge>
): void => {
  const leftToRight = direction === "LR";
  const exitX = leftToRight ? source.x + source.width : source.x;
  const exitY = source.y + source.height / 2;

  const targetBoundaries = targets.map(({ node }) =>
    leftToRight ? node.x : node.x + node.width
  );

  const nearest = leftToRight
    ? Math.min(...targetBoundaries)
    : Math.max(...targetBoundaries);

  const initialJunction = exitX + (nearest - exitX) / 2;

  const junctionX = adjustJunctionForGroups(
    initialJunction,
    source.x + source.width / 2,
    exitY,
    groups,
    direction
  );

  for (const { edge, node } of targets) {
    const entryX = leftToRight ? node.x : node.x + node.width;
    const entryY = node.y + node.height / 2;
    edge.points = [
      { x: exitX, y: exitY },
      { x: junctionX, y: exitY },
      { x: junctionX, y: entryY },
      { x: entryX, y: entryY },
    ];
    processed.add(edge);
  }
};

const routeVerticalFanOut = (
  source: MutablePositionedNode,
  targets: NodeAndEdge[],
  groups: PositionedGroup[],
  direction: Direction,
  processed: Set<MutablePositionedEdge>
): void => {
  const bottomToTop = direction === "BT";
  const exitX = source.x + source.width / 2;
  const exitY = bottomToTop ? source.y : source.y + source.height;

  const targetBoundaries = targets.map(({ node }) =>
    bottomToTop ? node.y + node.height : node.y
  );

  const nearest = bottomToTop
    ? Math.max(...targetBoundaries)
    : Math.min(...targetBoundaries);

  const initialJunction = exitY + (nearest - exitY) / 2;

  const junctionY = adjustJunctionForGroups(
    initialJunction,
    exitX,
    source.y + source.height / 2,
    groups,
    direction
  );

  for (const { edge, node } of targets) {
    const entryX = node.x + node.width / 2;
    const entryY = bottomToTop ? node.y + node.height : node.y;
    edge.points = [
      { x: exitX, y: exitY },
      { x: exitX, y: junctionY },
      { x: entryX, y: junctionY },
      { x: entryX, y: entryY },
    ];
    processed.add(edge);
  }
};

const bundleFanOut = (
  edges: MutablePositionedEdge[],
  nodeMap: Map<string, MutablePositionedNode>,
  groups: PositionedGroup[],
  direction: Direction,
  processed: Set<MutablePositionedEdge>
): void => {
  for (const [sourceId, edgeGroup] of groupEdges(edges, "source")) {
    const source = nodeMap.get(sourceId);

    if (!(source && hasCompatibleStyle(edgeGroup))) {
      continue;
    }

    const targets = resolveNodes(edgeGroup, nodeMap, "target").filter(
      ({ node }) => isForward(source, node, direction)
    );

    if (targets.length < 2) {
      continue;
    }

    if (isHorizontalDirection(direction)) {
      routeHorizontalFanOut(source, targets, groups, direction, processed);
    } else {
      routeVerticalFanOut(source, targets, groups, direction, processed);
    }
  }
};

const routeHorizontalFanIn = (
  target: MutablePositionedNode,
  sources: NodeAndEdge[],
  groups: PositionedGroup[],
  direction: Direction
): void => {
  const leftToRight = direction === "LR";
  const entryX = leftToRight ? target.x : target.x + target.width;
  const entryY = target.y + target.height / 2;

  const sourceBoundaries = sources.map(({ node }) =>
    leftToRight ? node.x + node.width : node.x
  );

  const farthest = leftToRight
    ? Math.max(...sourceBoundaries)
    : Math.min(...sourceBoundaries);

  const initialJunction = farthest + (entryX - farthest) / 2;

  const junctionX = adjustJunctionForGroups(
    initialJunction,
    target.x + target.width / 2,
    entryY,
    groups,
    direction
  );

  for (const { edge, node } of sources) {
    const exitX = leftToRight ? node.x + node.width : node.x;
    const exitY = node.y + node.height / 2;
    edge.points = [
      { x: exitX, y: exitY },
      { x: junctionX, y: exitY },
      { x: junctionX, y: entryY },
      { x: entryX, y: entryY },
    ];
  }
};

const routeVerticalFanIn = (
  target: MutablePositionedNode,
  sources: NodeAndEdge[],
  groups: PositionedGroup[],
  direction: Direction
): void => {
  const bottomToTop = direction === "BT";
  const entryX = target.x + target.width / 2;
  const entryY = bottomToTop ? target.y + target.height : target.y;

  const sourceBoundaries = sources.map(({ node }) =>
    bottomToTop ? node.y : node.y + node.height
  );

  const farthest = bottomToTop
    ? Math.min(...sourceBoundaries)
    : Math.max(...sourceBoundaries);

  const initialJunction = farthest + (entryY - farthest) / 2;

  const junctionY = adjustJunctionForGroups(
    initialJunction,
    entryX,
    target.y + target.height / 2,
    groups,
    direction
  );

  for (const { edge, node } of sources) {
    const exitX = node.x + node.width / 2;
    const exitY = bottomToTop ? node.y : node.y + node.height;
    edge.points = [
      { x: exitX, y: exitY },
      { x: exitX, y: junctionY },
      { x: entryX, y: junctionY },
      { x: entryX, y: entryY },
    ];
  }
};

const bundleFanIn = (
  edges: MutablePositionedEdge[],
  nodeMap: Map<string, MutablePositionedNode>,
  groups: PositionedGroup[],
  direction: Direction,
  processed: Set<MutablePositionedEdge>
): void => {
  for (const [targetId, edgeGroup] of groupEdges(edges, "target", processed)) {
    const target = nodeMap.get(targetId);

    if (!(target && hasCompatibleStyle(edgeGroup))) {
      continue;
    }

    const sources = resolveNodes(edgeGroup, nodeMap, "source").filter(
      ({ node }) => isForward(node, target, direction)
    );

    if (sources.length < 2) {
      continue;
    }

    if (isHorizontalDirection(direction)) {
      routeHorizontalFanIn(target, sources, groups, direction);
    } else {
      routeVerticalFanIn(target, sources, groups, direction);
    }
  }
};

export const bundleEdgePaths = (
  edges: MutablePositionedEdge[],
  nodes: MutablePositionedNode[],
  groups: PositionedGroup[],
  direction: Direction
): void => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const processed = new Set<MutablePositionedEdge>();
  bundleFanOut(edges, nodeMap, groups, direction, processed);
  bundleFanIn(edges, nodeMap, groups, direction, processed);
};
