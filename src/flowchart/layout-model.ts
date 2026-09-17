import type { PositionedNode, PositionedEdge, Point } from "./model.ts";

export const DEFAULTS = {
  componentSpacing: 28,
  font: "Inter",
  layerSpacing: 48,
  mergeEdges: true,
  nodeSpacing: 28,
  padding: 40,
  thoroughness: 3,
} as const;

export type MutablePoint = { -readonly [Key in keyof Point]: Point[Key] };

export type MutablePositionedNode = {
  -readonly [Key in keyof PositionedNode]: PositionedNode[Key];
};

export type MutablePositionedEdge = Omit<
  { -readonly [Key in keyof PositionedEdge]: PositionedEdge[Key] },
  "points"
> & { points: MutablePoint[] };
