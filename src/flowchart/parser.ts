import { ParseError } from "../parse-error.ts";
import type { Direction, Edge, Graph, Node } from "./model.ts";

const headerPattern = /^(?:graph|flowchart)\s+(?<direction>TD|TB|LR|BT|RL)$/iu;

const nodePattern =
  /^(?<id>[\w-]+?)(?=-->|[^\w-]|$)(?:\[(?<label>[^[\]\n]+)\])?/u;

const statements = (text: string): string[] => {
  const result: string[] = [];
  let statement = "";
  let inLabel = false;

  for (const line of text.split(/\r?\n/u)) {
    if (line.trimStart().startsWith("%%")) {
      continue;
    }

    for (const char of `${line}\n`) {
      if (char === "[") {
        inLabel = true;
      } else if (char === "]") {
        inLabel = false;
      }

      if ((char === ";" && !inLabel) || char === "\n") {
        if (statement.trim()) {
          result.push(statement.trim());
        }

        statement = "";
      } else {
        statement += char;
      }
    }
  }

  return result;
};

const directionFromHeader = (header: string): Direction => {
  const direction = header
    .match(headerPattern)
    ?.groups?.direction?.toUpperCase();

  switch (direction) {
    case "TD":
    case "TB":
    case "LR":
    case "BT":
    case "RL": {
      return direction;
    }

    default: {
      throw new ParseError({ message: `Invalid flowchart header: ${header}` });
    }
  }
};

const consumeNode = (text: string, nodes: Map<string, Node>) => {
  const match = text.match(nodePattern);
  const id = match?.groups?.id;

  if (!match || !id) {
    throw new ParseError({ message: `Expected a rectangular node: ${text}` });
  }

  const label = match.groups?.label;

  if (label !== undefined && /^(?:\(.*\)|[/\\].*[/\\])$/u.test(label)) {
    throw new ParseError({ message: `Unsupported node shape: ${match[0]}` });
  }

  if (label !== undefined || !nodes.has(id)) {
    nodes.set(id, { id, label: label ?? id });
  }

  return { id, rest: text.slice(match[0].length).trim() };
};

export const parseFlowchart = (text: string): Graph => {
  const [header = "", ...lines] = statements(text);
  const direction = directionFromHeader(header);
  const nodes = new Map<string, Node>();
  const edges: Edge[] = [];

  for (const line of lines) {
    let current = consumeNode(line, nodes);

    while (current.rest) {
      if (!current.rest.startsWith("-->")) {
        throw new ParseError({
          message: `Unsupported flowchart syntax: ${current.rest}`,
        });
      }

      const next = consumeNode(current.rest.slice(3).trim(), nodes);
      edges.push({ source: current.id, target: next.id });
      current = next;
    }
  }

  if (nodes.size === 0) {
    throw new ParseError({
      message: "Flowchart must contain at least one node",
    });
  }

  return { direction, edges, nodes };
};
