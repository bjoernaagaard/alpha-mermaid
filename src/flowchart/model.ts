export type Direction = "TD" | "TB" | "LR" | "BT" | "RL";

export interface Node {
  readonly id: string;
  readonly label: string;
}

export interface Edge {
  readonly source: string;
  readonly target: string;
}

export interface Graph {
  readonly direction: Direction;
  readonly nodes: ReadonlyMap<string, Node>;
  readonly edges: readonly Edge[];
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface PositionedNode extends Node, Point {
  readonly width: number;
  readonly height: number;
}

export interface PositionedEdge extends Edge {
  readonly points: readonly Point[];
}

export interface PositionedGraph {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly PositionedNode[];
  readonly edges: readonly PositionedEdge[];
}
