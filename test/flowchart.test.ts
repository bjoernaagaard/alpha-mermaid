import { describe, expect, it } from "vitest";

import { elkLayout } from "../src/elk.ts";
import { fromElk, layoutFlowchart, toElk } from "../src/flowchart/layout.ts";
import { parseFlowchart } from "../src/flowchart/parser.ts";
import { renderSvg } from "../src/flowchart/renderer.ts";
import { ParseError } from "../src/index.ts";
import { measureLabel } from "../src/text-metrics.ts";
import fixtures from "./fixtures/flowchart.json";

describe("flowchart parser", () => {
  it("preserves definition order, latest labels and directed chains", () => {
    const graph = parseFlowchart(
      "%% comment\nflowchart lr; Z[WWWW] --> B[i] --> A[Finish]; B[Updated]; Z --> B"
    );

    expect(graph.direction).toBe("LR");
    expect([...graph.nodes.values()]).toStrictEqual([
      { geometry: "rectangle", id: "Z", label: "WWWW" },
      { geometry: "rectangle", id: "B", label: "Updated" },
      { geometry: "rectangle", id: "A", label: "Finish" },
    ]);
    expect(graph.edges).toStrictEqual(
      [
        { source: "Z", target: "B" },
        { source: "B", target: "A" },
        { source: "Z", target: "B" },
      ].map((edge) => ({
        ...edge,
        hasArrowEnd: true,
        hasArrowStart: false,
        style: "solid",
      }))
    );
  });

  it("keeps semicolons inside labels and accepts compact arrows and hyphenated IDs", () => {
    const graph = parseFlowchart("graph LR; start-id[left; right]-->end-id");
    expect([...graph.nodes.values()]).toStrictEqual([
      { geometry: "rectangle", id: "start-id", label: "left; right" },
      { geometry: "rectangle", id: "end-id", label: "end-id" },
    ]);
    expect(graph.edges).toStrictEqual([
      {
        hasArrowEnd: true,
        hasArrowStart: false,
        source: "start-id",
        style: "solid",
        target: "end-id",
      },
    ]);
  });

  it.each([
    "",
    "graph",
    "graph XX; A",
    "sequenceDiagram",
    "graph LR",
    "graph LR; A -->",
    "graph LR; A --> B junk",
    "graph LR; A[unterminated",
    "graph LR; subgraph S",
  ])("rejects incomplete or unsupported syntax: %s", (source) => {
    expect(() => parseFlowchart(source)).toThrow(ParseError);
  });
});

describe("source-calibrated text measurement", () => {
  it.each([
    ["iiii", 13.806],
    ["WWWW", 46.41],
    ["A r1-", 25.662],
    ["界😀", 31.59],
    ["e\u0301", 9.36],
  ])("measures %s without a DOM", (label, width) => {
    expect(measureLabel(label).width).toBeCloseTo(width, 10);
    expect(measureLabel(label).height).toBeCloseTo(16.9, 10);
  });
});

describe("ELK layout", () => {
  it.each(fixtures)(
    "matches baseline coordinates for $source",
    ({ source, graph }) => {
      expect(layoutFlowchart(parseFlowchart(source), {})).toStrictEqual({
        ...graph,
        edges: graph.edges.map((edge) => ({
          ...edge,
          hasArrowEnd: true,
          hasArrowStart: false,
          style: "solid",
        })),
        groups: [],
        nodes: graph.nodes.map((node) => ({ ...node, geometry: "rectangle" })),
      });
    }
  );

  it("honors distinct spacing options and zero padding", () => {
    const graph = parseFlowchart("graph LR; A[WWWW] --> B[i]");
    const options = { layerSpacing: 73, nodeSpacing: 19, padding: 0 };
    const input = toElk(graph, options);
    expect(input.layoutOptions).toMatchObject({
      "elk.layered.spacing.nodeNodeBetweenLayers": "73",
      "elk.padding": "[top=0,left=0,bottom=0,right=0]",
      "elk.spacing.nodeNode": "19",
    });
    expect(layoutFlowchart(graph, options).nodes).toStrictEqual([
      {
        geometry: "rectangle",
        height: 36.900000000000006,
        id: "A",
        label: "WWWW",
        width: 86.41,
        x: 0,
        y: 0,
      },
      {
        geometry: "rectangle",
        height: 36.900000000000006,
        id: "B",
        label: "i",
        width: 60,
        x: 159.41,
        y: 0,
      },
    ]);
  });

  it("restores timers and remains synchronous after an actual ELK failure", () => {
    const timer = Object.getOwnPropertyDescriptor(globalThis, "setTimeout");
    expect(() =>
      elkLayout({
        children: [{ height: 36, id: "A", width: 60 }],
        id: "root",
        layoutOptions: { "elk.algorithm": "missing-algorithm" },
      })
    ).toThrow("Layout algorithm 'missing-algorithm' not found");
    const graph = parseFlowchart("graph LR; A --> B");
    const first = elkLayout(toElk(graph, {}));
    expect(first.width).toBe(248);
    expect(fromElk(elkLayout(toElk(graph, {})), graph)).toStrictEqual(
      fromElk(first, graph)
    );
    expect(
      Object.getOwnPropertyDescriptor(globalThis, "setTimeout")
    ).toStrictEqual(timer);
  });

  it("rejects incomplete ELK responses rather than inventing coordinates", () => {
    expect(() =>
      fromElk(
        { children: [{ id: "A" }], id: "root" },
        parseFlowchart("graph LR; A")
      )
    ).toThrow("incomplete node");
  });
});

describe("SVG serialization", () => {
  it("serializes independent asymmetric geometry, escaping labels and retaining edge direction", () => {
    const svg = renderSvg(
      {
        edges: [
          {
            hasArrowEnd: true,
            hasArrowStart: false,
            points: [
              { x: 108, y: 41.5 },
              { x: 190, y: 41.5 },
              { x: 190, y: 94 },
            ],
            source: "left",
            style: "solid",
            target: "right",
          },
        ],
        groups: [],
        height: 149,
        nodes: [
          {
            geometry: "rectangle",
            height: 37,
            id: "left",
            label: '<script>&"',
            width: 91,
            x: 17,
            y: 23,
          },
        ],
        width: 317,
      },
      { bg: "#18181B", fg: "#FAFAFA", font: "Roboto Mono" }
    );

    expect(svg.split("\n")).toStrictEqual(
      expect.arrayContaining([
        expect.stringContaining('viewBox="0 0 317 149"'),
        expect.stringContaining('points="108,41.5 190,41.5 190,94"'),
        expect.stringContaining('x="62.5" y="41.5"'),
        expect.stringContaining("&lt;script&gt;&amp;&quot;</text>"),
        expect.stringContaining('marker-end="url(#arrowhead)"'),
        expect.stringContaining("--bg:#18181B;--fg:#FAFAFA"),
        expect.stringContaining("family=Roboto%20Mono:"),
      ])
    );
    expect(svg).not.toContain("<script>");
    expect(svg.indexOf("<polyline")).toBeLessThan(
      svg.indexOf('<g class="node"')
    );
  });
});
