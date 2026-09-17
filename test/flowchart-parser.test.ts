import { describe, expect, it } from "vitest";

import { parseFlowchart } from "../src/flowchart/parser.ts";
import { ParseError } from "../src/parse-error.ts";

describe("phase 3 flowchart parser", () => {
  it("keeps compact arrows separate from hyphenated IDs and terminal letters", () => {
    const graph = parseFlowchart("graph LR; box-->next-id; next-id --o tail");
    expect([...graph.nodes.keys()]).toStrictEqual(["box", "next-id", "tail"]);
    expect(graph.edges).toStrictEqual([
      {
        hasArrowEnd: true,
        hasArrowStart: false,
        source: "box",
        style: "solid",
        target: "next-id",
      },
      {
        hasArrowEnd: false,
        hasArrowStart: false,
        source: "next-id",
        style: "solid",
        target: "tail",
        terminalEnd: "circle",
      },
    ]);
  });

  it("parses asymmetric shapes, parallel terminal edges, labels, and styles", () => {
    const graph = parseFlowchart(`flowchart RL
      left[/Input/]:::hot & db[(Store)] o-.->|miss<br/>again| result{{Choice}}
      classDef hot fill:#f96,stroke:#222
      style db fill:#def
      linkStyle 0,1 stroke:#f00`);

    expect([...graph.nodes.values()]).toStrictEqual([
      { geometry: "parallelogram", id: "left", label: "Input" },
      { geometry: "cylinder", id: "db", label: "Store" },
      { geometry: "hexagon", id: "result", label: "Choice" },
    ]);
    expect(graph.edges).toStrictEqual([
      expect.objectContaining({
        label: "miss\nagain",
        source: "left",
        style: "dotted",
        target: "result",
        terminalStart: "circle",
      }),
      expect.objectContaining({ source: "db", target: "result" }),
    ]);
    expect(graph.classAssignments.get("left")).toBe("hot");
    expect(graph.classDefs.get("hot")).toStrictEqual({
      fill: "#f96",
      stroke: "#222",
    });
    expect({
      link: graph.linkStyles.get(1),
      node: graph.nodeStyles.get("db"),
    }).toStrictEqual({ link: { stroke: "#f00" }, node: { fill: "#def" } });
  });

  it("retains nested subgraph ownership and direction overrides", () => {
    const graph = parseFlowchart(`graph TD
      subgraph outer [Outer Layer]
        A[Declared]
        subgraph Inner Group
          direction LR
          A --> B>Flag]
        end
      end`);

    expect(graph.subgraphs[0]).toMatchObject({
      children: [
        {
          direction: "LR",
          id: "Inner_Group",
          nodeIds: ["B"],
        },
      ],
      id: "outer",
      nodeIds: ["A"],
    });
  });

  it("dispatches state diagrams with aliases, composites, and pseudostates", () => {
    const graph = parseFlowchart(`stateDiagram-v2
      direction LR
      [*] --> Waiting : boot<br>now
      state "Work queue" as Queue {
        direction TB
        queued --> running
      }
      Waiting --> Queue
      Queue --> [*]`);

    expect(graph.direction).toBe("LR");
    expect(graph.nodes.get("_start")?.geometry).toBe("state-start");
    expect(graph.nodes.get("_end")?.geometry).toBe("state-end");
    expect(graph.subgraphs[0]).toMatchObject({
      direction: "TB",
      id: "Queue",
      label: "Work queue",
      nodeIds: ["queued", "running"],
    });
    expect({
      hasCompositeNode: graph.nodes.has("Queue"),
      label: graph.edges[0]?.label,
    }).toStrictEqual({ hasCompositeNode: false, label: "boot\nnow" });
  });

  it.each([
    "",
    "graph ZZ\nA --> B",
    "graph TD\nA -->",
    "graph TD\nA --> B trailing",
    "graph TD\nend",
    "graph TD\nsubgraph open\nA",
    "graph TD\nclassDef bad fill",
    "stateDiagram-v2\nIdle => Done",
    "stateDiagram-v2\nstate Open {\nA --> B",
  ])("throws typed ParseError for malformed syntax: %s", (source) => {
    expect(() => parseFlowchart(source)).toThrow(ParseError);
  });
});
