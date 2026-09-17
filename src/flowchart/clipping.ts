import type { NodeGeometry, Point, PositionedNode } from "./model.ts";

interface MutablePoint {
  x: number;
  y: number;
}

const intersection = (
  coordinate: number,
  first: Point,
  second: Point,
  vertical: boolean
): MutablePoint | undefined => {
  const start = vertical ? first.x : first.y;
  const distance = (vertical ? second.x : second.y) - start;

  if (Math.abs(distance) < 0.001) {
    return undefined;
  }

  const ratio = (coordinate - start) / distance;

  if (ratio < 0 || ratio > 1) {
    return undefined;
  }

  return vertical
    ? { x: coordinate, y: first.y + ratio * (second.y - first.y) }
    : { x: first.x + ratio * (second.x - first.x), y: coordinate };
};

const geometryVertices = (node: PositionedNode): MutablePoint[] | undefined => {
  const { geometry, height, width, x, y } = node;
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  if (geometry === "diamond") {
    return [
      { x: centerX, y },
      { x: x + width, y: centerY },
      { x: centerX, y: y + height },
      { x, y: centerY },
    ];
  }

  if (
    geometry !== "trapezoid" &&
    geometry !== "trapezoid-alt" &&
    geometry !== "parallelogram" &&
    geometry !== "parallelogram-alt"
  ) {
    return undefined;
  }

  const inset = Math.min(width * 0.15, 12);

  return geometry === "trapezoid"
    ? [
        { x: x + inset, y },
        { x: x + width, y },
        { x: x + width - inset, y: y + height },
        { x, y: y + height },
      ]
    : [
        { x, y },
        { x: x + width - inset, y },
        { x: x + width, y: y + height },
        { x: x + inset, y: y + height },
      ];
};

const clipEndpoint = (
  endpoint: Point,
  adjacent: Point,
  vertices: readonly Point[],
  geometry: NodeGeometry
): MutablePoint => {
  const horizontal =
    Math.abs(endpoint.x - adjacent.x) >= Math.abs(endpoint.y - adjacent.y);

  const candidates: MutablePoint[] = [];

  for (const [index, first] of vertices.entries()) {
    const second = vertices[(index + 1) % vertices.length];

    if (!second) {
      continue;
    }

    const candidate = intersection(
      horizontal ? endpoint.y : endpoint.x,
      first,
      second,
      !horizontal
    );

    if (candidate) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    return { ...endpoint };
  }

  // Preserve the source's directional intersection choice for slanted nodes.
  if (geometry !== "diamond") {
    const axis = horizontal ? "x" : "y";
    const values = candidates.map((point) => point[axis]);

    const coordinate =
      endpoint[axis] > adjacent[axis]
        ? Math.max(...values)
        : Math.min(...values);

    return { ...endpoint, [axis]: coordinate };
  }

  let [closest] = candidates;

  if (!closest) {
    return { ...endpoint };
  }

  for (const candidate of candidates.slice(1)) {
    const closestDistance = Math.hypot(
      closest.x - endpoint.x,
      closest.y - endpoint.y
    );

    const candidateDistance = Math.hypot(
      candidate.x - endpoint.x,
      candidate.y - endpoint.y
    );

    if (candidateDistance < closestDistance) {
      closest = candidate;
    }
  }

  return closest;
};

export const clipEdgeToGeometry = (
  points: readonly Point[],
  node: PositionedNode,
  isStart: boolean
): MutablePoint[] => {
  const vertices = geometryVertices(node);

  if (points.length < 2 || !vertices) {
    return points.map(({ x, y }) => ({ x, y }));
  }

  const result = points.map(({ x, y }) => ({ x, y }));
  const endpointIndex = isStart ? 0 : result.length - 1;
  const adjacentIndex = isStart ? 1 : result.length - 2;
  const endpoint = result[endpointIndex];
  const adjacent = result[adjacentIndex];

  if (endpoint && adjacent) {
    result[endpointIndex] = clipEndpoint(
      endpoint,
      adjacent,
      vertices,
      node.geometry
    );
  }

  return result;
};
