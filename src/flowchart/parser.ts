import { normalizeBrTags as normalizeLabel } from "../multiline-utils.ts";
import { ParseError } from "../parse-error.ts";
import type {
  Direction,
  Edge,
  EdgeStyle,
  EdgeTerminal,
  Graph,
  Node,
  NodeGeometry,
  StyleProperties,
  Subgraph,
} from "./model.ts";

const headerPattern =
  /^(?:graph|flowchart)\s+(?<direction>TD|TB|LR|BT|RL)\s*$/iu;

const stateHeaderPattern = /^stateDiagram(?:-v2)?\s*$/iu;

const directionPattern = /^direction\s+(?<direction>TD|TB|LR|BT|RL)\s*$/iu;

const arrowPattern =
  /^(?<start><|[ox])?(?<operator>~~~|-\.-[ox]|--[ox]|-->|-.->|==>|---|-\.-|===)(?:\|(?<label>[^|]*)\|)?/u;

const textArrowPattern =
  /^(?<start><)?(?<open>--|-\.|==)\s+(?<label>.+?)\s+(?<close>-->|---|\.->|-\.-|==>|===)/u;

const bareNodePattern = /^(?<id>[\w-]+?)(?=--(?:>|-|[ox])|-\.[->]|[^\w-]|$)/u;

const classShorthandPattern = /^:::(?<className>[\w][\w-]*)/u;

const nodePatterns: readonly {
  readonly pattern: RegExp;
  readonly geometry: NodeGeometry;
}[] = [
  {
    geometry: "doublecircle",
    pattern: /^(?<id>[\w-]+)\(\(\((?<label>.+?)\)\)\)/u,
  },
  { geometry: "stadium", pattern: /^(?<id>[\w-]+)\(\[(?<label>.+?)\]\)/u },
  { geometry: "circle", pattern: /^(?<id>[\w-]+)\(\((?<label>.+?)\)\)/u },
  { geometry: "subroutine", pattern: /^(?<id>[\w-]+)\[\[(?<label>.+?)\]\]/u },
  { geometry: "cylinder", pattern: /^(?<id>[\w-]+)\[\((?<label>.+?)\)\]/u },
  {
    geometry: "trapezoid",
    pattern: /^(?<id>[\w-]+)\[\/(?<label>[^\]]+?)\\\]/u,
  },
  {
    geometry: "trapezoid-alt",
    pattern: /^(?<id>[\w-]+)\[\\(?<label>[^\]]+?)\/\]/u,
  },
  {
    geometry: "parallelogram",
    pattern: /^(?<id>[\w-]+)\[\/(?<label>[^\]]+?)\/\]/u,
  },
  {
    geometry: "parallelogram-alt",
    pattern: /^(?<id>[\w-]+)\[\\(?<label>[^\]]+?)\\\]/u,
  },
  { geometry: "asymmetric", pattern: /^(?<id>[\w-]+)>(?<label>.+?)\]/u },
  { geometry: "hexagon", pattern: /^(?<id>[\w-]+)\{\{(?<label>.+?)\}\}/u },
  { geometry: "rectangle", pattern: /^(?<id>[\w-]+)\[(?<label>.+?)\]/u },
  { geometry: "rounded", pattern: /^(?<id>[\w-]+)\((?<label>.+?)\)/u },
  { geometry: "diamond", pattern: /^(?<id>[\w-]+)\{(?<label>.+?)\}/u },
];

const fail = (message: string): never => {
  throw new ParseError({ message });
};

const statements = (text: string): string[] => {
  const result: string[] = [];
  let current = "";
  let depth = 0;

  for (const rawLine of text.split(/\r?\n/u)) {
    if (rawLine.trimStart().startsWith("%%")) {
      continue;
    }

    for (const character of `${rawLine}\n`) {
      if ("[({".includes(character)) {
        depth += 1;
      }

      if ("])}".includes(character)) {
        depth = Math.max(0, depth - 1);
      }

      if ((character === ";" && depth === 0) || character === "\n") {
        if (current.trim()) {
          result.push(current.trim());
        }

        current = "";
      } else {
        current += character;
      }
    }
  }

  return result;
};

const emptyGraph = (direction: Direction): Graph => ({
  classAssignments: new Map(),
  classDefs: new Map(),
  direction,
  edges: [],
  linkStyles: new Map(),
  nodeStyles: new Map(),
  nodes: new Map(),
  subgraphs: [],
});

const asDirection = (value: string | undefined): Direction => {
  const direction = value?.toUpperCase();

  if (
    direction === "TD" ||
    direction === "TB" ||
    direction === "LR" ||
    direction === "BT" ||
    direction === "RL"
  ) {
    return direction;
  }

  return fail(`Invalid direction: ${value ?? ""}`);
};

const parseStyleProps = (source: string): StyleProperties => {
  const props: StyleProperties = {};

  for (const pair of source.replace(/;\s*$/u, "").split(",")) {
    const colon = pair.indexOf(":");
    const key = pair.slice(0, colon).trim();
    const value = pair.slice(colon + 1).trim();

    if (colon <= 0 || !key || !value) {
      return fail(`Invalid style property: ${pair.trim()}`);
    }

    props[key] = value;
  }

  return props;
};

const track = (stack: Subgraph[], id: string): void => {
  const current = stack.at(-1);

  if (current && !current.nodeIds.includes(id)) {
    current.nodeIds.push(id);
  }
};

const registerNode = (graph: Graph, stack: Subgraph[], node: Node): void => {
  graph.nodes.set(node.id, node);
  track(stack, node.id);
};

interface ConsumedNode {
  readonly id: string;
  readonly remaining: string;
}

const consumeNode = (
  text: string,
  graph: Graph,
  stack: Subgraph[]
): ConsumedNode | undefined => {
  let id: string | undefined;
  let remaining = text;

  for (const { geometry, pattern } of nodePatterns) {
    const match = text.match(pattern);

    if (match?.groups?.id && match.groups.label !== undefined) {
      const { id: matchedId } = match.groups;
      id = matchedId;
      registerNode(graph, stack, {
        geometry,
        id,
        label: normalizeLabel(match.groups.label),
      });
      remaining = text.slice(match[0].length);
      break;
    }
  }

  if (!id) {
    const match = text.match(bareNodePattern);
    id = match?.groups?.id;

    if (!id || !match) {
      return undefined;
    }

    if (!graph.nodes.has(id)) {
      registerNode(graph, stack, { geometry: "rectangle", id, label: id });
    }

    remaining = text.slice(match[0].length);
  }

  const classMatch = remaining.match(classShorthandPattern);
  const className = classMatch?.groups?.className;

  if (classMatch && className) {
    graph.classAssignments.set(id, className);
    remaining = remaining.slice(classMatch[0].length);
  }

  return { id, remaining };
};

interface ConsumedGroup {
  readonly ids: string[];
  readonly remaining: string;
}

const consumeGroup = (
  text: string,
  graph: Graph,
  stack: Subgraph[]
): ConsumedGroup | undefined => {
  const first = consumeNode(text, graph, stack);

  if (!first) {
    return undefined;
  }

  const ids = [first.id];
  let remaining = first.remaining.trim();

  while (remaining.startsWith("&")) {
    const next = consumeNode(remaining.slice(1).trim(), graph, stack);

    if (!next) {
      return fail(`Expected node after &: ${text}`);
    }

    ids.push(next.id);
    remaining = next.remaining.trim();
  }

  return { ids, remaining };
};

const arrowStyle = (operator: string): EdgeStyle => {
  if (operator === "~~~") {
    return "invisible";
  }

  if (operator.startsWith("-.")) {
    return "dotted";
  }

  if (operator.startsWith("==")) {
    return "thick";
  }

  return "solid";
};

interface ParsedArrow {
  readonly hasArrowEnd: boolean;
  readonly hasArrowStart: boolean;
  readonly label?: string;
  readonly remaining: string;
  readonly style: EdgeStyle;
  readonly terminalEnd?: EdgeTerminal;
  readonly terminalStart?: EdgeTerminal;
}

const terminal = (value: string): EdgeTerminal | undefined => {
  if (value.endsWith("o")) {
    return "circle";
  }

  if (value.endsWith("x")) {
    return "cross";
  }

  return undefined;
};

const parseArrow = (source: string): ParsedArrow => {
  const arrow = source.match(arrowPattern);

  if (arrow?.groups?.operator) {
    const { label: rawLabel, operator, start = "" } = arrow.groups;
    const label = rawLabel?.trim();
    const terminalEnd = terminal(operator);
    const terminalStart = terminal(start);

    return {
      hasArrowEnd: operator.endsWith(">"),
      hasArrowStart: start === "<",
      ...(label ? { label: normalizeLabel(label) } : undefined),
      remaining: source.slice(arrow[0].length).trim(),
      style: arrowStyle(operator),
      ...(terminalEnd ? { terminalEnd } : undefined),
      ...(terminalStart ? { terminalStart } : undefined),
    };
  }

  const textArrow = source.match(textArrowPattern);

  if (!textArrow?.groups?.close || !textArrow.groups.open) {
    return fail(`Invalid edge syntax: ${source}`);
  }

  return {
    hasArrowEnd: textArrow.groups.close.endsWith(">"),
    hasArrowStart: textArrow.groups.start === "<",
    label: normalizeLabel(textArrow.groups.label?.trim() ?? ""),
    remaining: source.slice(textArrow[0].length).trim(),
    style: arrowStyle(textArrow.groups.open),
  };
};

const parseEdgeLine = (line: string, graph: Graph, stack: Subgraph[]): void => {
  const first = consumeGroup(line.trim(), graph, stack);

  if (!first) {
    return fail(`Invalid flowchart statement: ${line}`);
  }

  let remaining = first.remaining.trim();
  let previous = first.ids;

  while (remaining) {
    const parsed = parseArrow(remaining);
    ({ remaining } = parsed);

    const next = consumeGroup(remaining, graph, stack);

    if (!next) {
      return fail(`Expected edge target: ${line}`);
    }

    for (const source of previous) {
      for (const target of next.ids) {
        graph.edges.push({
          hasArrowEnd: parsed.hasArrowEnd,
          hasArrowStart: parsed.hasArrowStart,
          source,
          style: parsed.style,
          target,
          ...(parsed.label === undefined ? undefined : { label: parsed.label }),
          ...(parsed.terminalEnd === undefined
            ? undefined
            : { terminalEnd: parsed.terminalEnd }),
          ...(parsed.terminalStart === undefined
            ? undefined
            : { terminalStart: parsed.terminalStart }),
        });
      }
    }

    ({ ids: previous } = next);
    remaining = next.remaining.trim();
  }
};

const mergeStyles = (
  map: Map<string, StyleProperties>,
  ids: string,
  source: string
): void => {
  const props = parseStyleProps(source);

  for (const id of ids.split(",").map((value) => value.trim())) {
    map.set(id, { ...map.get(id), ...props });
  }
};

const parseLinkStyle = (graph: Graph, target: string, source: string): void => {
  const props = parseStyleProps(source);

  if (target === "default") {
    graph.linkStyles.set("default", {
      ...graph.linkStyles.get("default"),
      ...props,
    });

    return;
  }

  for (const value of target.split(",")) {
    const index = Math.trunc(Number(value.trim()));

    if (!Number.isSafeInteger(index) || index < 0) {
      return fail(`Invalid linkStyle index: ${value}`);
    }

    graph.linkStyles.set(index, { ...graph.linkStyles.get(index), ...props });
  }
};

const applyStyle = (line: string, graph: Graph): boolean => {
  const classDef = line.match(/^classDef\s+(?<names>[\w,-]+)\s+(?<props>.+)$/u);

  if (classDef?.groups) {
    mergeStyles(
      graph.classDefs,
      classDef.groups.names ?? "",
      classDef.groups.props ?? ""
    );

    return true;
  }

  const assignment = line.match(
    /^class\s+(?<ids>[\w,-]+)\s+(?<className>\w+)$/u
  );

  if (assignment?.groups?.className) {
    for (const id of (assignment.groups.ids ?? "").split(",")) {
      graph.classAssignments.set(id.trim(), assignment.groups.className);
    }

    return true;
  }

  const nodeStyle = line.match(/^style\s+(?<ids>[\w,-]+)\s+(?<props>.+)$/u);

  if (nodeStyle?.groups) {
    mergeStyles(
      graph.nodeStyles,
      nodeStyle.groups.ids ?? "",
      nodeStyle.groups.props ?? ""
    );

    return true;
  }

  const linkStyle = line.match(
    /^linkStyle\s+(?<target>default|[\d,\s]+)\s+(?<props>.+)$/u
  );

  if (linkStyle?.groups) {
    parseLinkStyle(
      graph,
      (linkStyle.groups.target ?? "").trim(),
      linkStyle.groups.props ?? ""
    );

    return true;
  }

  return false;
};

const openSubgraph = (definition: string): Subgraph => {
  const bracket = definition.match(/^(?<id>[\w-]+)\s*\[(?<label>.+)\]$/u);
  const label = normalizeLabel(bracket?.groups?.label ?? definition);

  const id =
    bracket?.groups?.id ??
    definition.replaceAll(/\s+/gu, "_").replaceAll(/[^\w]/gu, "");

  if (!id) {
    return fail(`Invalid subgraph: ${definition}`);
  }

  return { children: [], id, label, nodeIds: [] };
};

const closeSubgraph = (graph: Graph, stack: Subgraph[]): void => {
  const completed = stack.pop();

  if (!completed) {
    return fail("Unexpected subgraph end");
  }

  const parent = stack.at(-1);
  (parent?.children ?? graph.subgraphs).push(completed);
};

const parseFlowchartDiagram = (lines: string[]): Graph => {
  const header = lines[0] ?? "";
  const headerMatch = header.match(headerPattern);

  if (!headerMatch) {
    return fail(`Invalid mermaid header: ${header}`);
  }

  const graph = emptyGraph(asDirection(headerMatch.groups?.direction));
  const stack: Subgraph[] = [];

  for (const line of lines.slice(1)) {
    if (applyStyle(line, graph)) {
      continue;
    }

    const direction = line.match(directionPattern);

    if (direction) {
      const current = stack.at(-1);

      if (!current) {
        return fail("direction is only valid inside a flowchart subgraph");
      }

      current.direction = asDirection(direction.groups?.direction);
      continue;
    }

    const subgraph = line.match(/^subgraph\s+(?<definition>.+)$/u);

    if (subgraph?.groups?.definition) {
      stack.push(openSubgraph(subgraph.groups.definition.trim()));
      continue;
    }

    if (line === "end") {
      closeSubgraph(graph, stack);
      continue;
    }

    parseEdgeLine(line, graph, stack);
  }

  if (stack.length > 0) {
    return fail(`Unclosed subgraph: ${stack.at(-1)?.id ?? ""}`);
  }

  if (graph.nodes.size === 0) {
    return fail("Flowchart must contain at least one node");
  }

  return graph;
};

const registerStateNode = (
  graph: Graph,
  stack: Subgraph[],
  node: Node
): void => {
  if (!graph.nodes.has(node.id)) {
    graph.nodes.set(node.id, node);
  }

  track(stack, node.id);
};

const ensureStateNode = (graph: Graph, stack: Subgraph[], id: string): void => {
  registerStateNode(
    graph,
    stack,
    graph.nodes.get(id) ?? { geometry: "rounded", id, label: id }
  );
};

const applyStateStructure = (
  line: string,
  graph: Graph,
  stack: Subgraph[],
  compositeIds: Set<string>
): boolean => {
  const direction = line.match(directionPattern);

  if (direction) {
    const value = asDirection(direction.groups?.direction);
    const current = stack.at(-1);

    if (current) {
      current.direction = value;
    } else {
      graph.direction = value;
    }

    return true;
  }

  const composite = line.match(
    /^state\s+(?:"(?<label>[^"]+)"\s+as\s+)?(?<id>[\w\p{L}]+)\s*\{$/u
  );

  if (composite?.groups?.id) {
    const { id } = composite.groups;
    stack.push({
      children: [],
      id,
      label: normalizeLabel(composite.groups.label ?? id),
      nodeIds: [],
    });
    compositeIds.add(id);
    graph.nodes.delete(id);

    return true;
  }

  if (line === "}") {
    closeSubgraph(graph, stack);

    return true;
  }

  return false;
};

const applyStateLabel = (
  line: string,
  graph: Graph,
  stack: Subgraph[]
): boolean => {
  const alias = line.match(
    /^state\s+"(?<label>[^"]+)"\s+as\s+(?<id>[\w\p{L}]+)\s*$/u
  );

  if (alias?.groups?.id) {
    registerStateNode(graph, stack, {
      geometry: "rounded",
      id: alias.groups.id,
      label: normalizeLabel(alias.groups.label ?? ""),
    });

    return true;
  }

  const description = line.match(/^(?<id>[\w\p{L}-]+)\s*:\s*(?<label>.+)$/u);

  if (description?.groups?.id) {
    registerStateNode(graph, stack, {
      geometry: "rounded",
      id: description.groups.id,
      label: normalizeLabel(description.groups.label?.trim() ?? ""),
    });

    return true;
  }

  return false;
};

const registerStateMarker = (
  graph: Graph,
  stack: Subgraph[],
  kind: "start" | "end",
  count: number
): string => {
  const id = `_${kind}${count > 1 ? count : ""}`;
  registerStateNode(graph, stack, { geometry: `state-${kind}`, id, label: "" });

  return id;
};

const parseStateDiagram = (lines: string[]): Graph => {
  const graph = emptyGraph("TD");
  const stack: Subgraph[] = [];
  const compositeIds = new Set<string>();
  let startCount = 0;
  let endCount = 0;

  for (const line of lines.slice(1)) {
    if (
      applyStyle(line, graph) ||
      applyStateStructure(line, graph, stack, compositeIds) ||
      applyStateLabel(line, graph, stack)
    ) {
      continue;
    }

    const transition = line.match(
      /^(?<source>\[\*\]|[\w\p{L}-]+)\s*-->\s*(?<target>\[\*\]|[\w\p{L}-]+)(?:\s*:\s*(?<label>.+))?$/u
    );

    if (transition?.groups?.source && transition.groups.target) {
      let { source, target } = transition.groups;

      if (source === "[*]") {
        startCount += 1;
        source = registerStateMarker(graph, stack, "start", startCount);
      } else if (!compositeIds.has(source)) {
        ensureStateNode(graph, stack, source);
      }

      if (target === "[*]") {
        endCount += 1;
        target = registerStateMarker(graph, stack, "end", endCount);
      } else if (!compositeIds.has(target)) {
        ensureStateNode(graph, stack, target);
      }

      const label = transition.groups.label?.trim();

      const edge: Edge = {
        hasArrowEnd: true,
        hasArrowStart: false,
        source,
        style: "solid",
        target,
      };

      graph.edges.push(
        label ? { ...edge, label: normalizeLabel(label) } : edge
      );
      continue;
    }

    return fail(`Invalid state diagram statement: ${line}`);
  }

  if (stack.length > 0) {
    return fail(`Unclosed composite state: ${stack.at(-1)?.id ?? ""}`);
  }

  if (graph.nodes.size === 0 && graph.subgraphs.length === 0) {
    return fail("State diagram must contain at least one state");
  }

  return graph;
};

export const parseFlowchart = (text: string): Graph => {
  const lines = statements(text);
  const [header] = lines;

  if (!header) {
    return fail("Empty mermaid diagram");
  }

  return stateHeaderPattern.test(header)
    ? parseStateDiagram(lines)
    : parseFlowchartDiagram(lines);
};
