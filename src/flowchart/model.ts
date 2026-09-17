export type Direction = "TD" | "TB" | "LR" | "BT" | "RL";

export type NodeGeometry =
  | "rectangle"
  | "rounded"
  | "diamond"
  | "stadium"
  | "circle"
  | "subroutine"
  | "doublecircle"
  | "hexagon"
  | "cylinder"
  | "asymmetric"
  | "trapezoid"
  | "trapezoid-alt"
  | "parallelogram"
  | "parallelogram-alt"
  | "state-start"
  | "state-end";

export type EdgeTerminal = "circle" | "cross";

export type EdgeStyle = "solid" | "dotted" | "thick" | "invisible";

export type StyleProperties = Record<string, string>;

export interface Node {
  readonly id: string;
  readonly label: string;
  readonly geometry: NodeGeometry;
}

export interface Edge {
  readonly source: string;
  readonly target: string;
  readonly label?: string;
  readonly style: EdgeStyle;
  readonly hasArrowStart: boolean;
  readonly hasArrowEnd: boolean;
  readonly terminalStart?: EdgeTerminal;
  readonly terminalEnd?: EdgeTerminal;
}

export interface Subgraph {
  readonly id: string;
  readonly label: string;
  readonly nodeIds: string[];
  readonly children: Subgraph[];
  direction?: Direction;
}

export interface Graph {
  direction: Direction;
  readonly nodes: Map<string, Node>;
  readonly edges: Edge[];
  readonly subgraphs: Subgraph[];
  readonly classDefs: Map<string, StyleProperties>;
  readonly classAssignments: Map<string, string>;
  readonly nodeStyles: Map<string, StyleProperties>;
  readonly linkStyles: Map<number | "default", StyleProperties>;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface PositionedNode extends Node, Point {
  readonly width: number;
  readonly height: number;
  readonly inlineStyle?: StyleProperties;
}

export interface PositionedEdge extends Edge {
  readonly points: Point[];
  readonly labelPosition?: Point;
  readonly inlineStyle?: StyleProperties;
}

export interface PositionedGroup {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly children: PositionedGroup[];
}

export interface PositionedGraph {
  readonly width: number;
  readonly height: number;
  readonly nodes: PositionedNode[];
  readonly edges: PositionedEdge[];
  readonly groups: PositionedGroup[];
}
