import { describe, expect, it } from "vitest";

import type {
  NodeGeometry,
  PositionedEdge,
  PositionedGraph,
  PositionedGroup,
  PositionedNode,
} from "../src/flowchart/model.ts";
import { renderSvg } from "../src/flowchart/renderer.ts";
import { RenderOptions } from "../src/options.ts";

const options = new RenderOptions({});

const node = (
  geometry: NodeGeometry,
  overrides: Partial<PositionedNode> = {}
): PositionedNode => ({
  geometry,
  height: 40,
  id: geometry,
  label: geometry,
  width: 80,
  x: 10,
  y: 20,
  ...overrides,
});

const edge = (overrides: Partial<PositionedEdge> = {}): PositionedEdge => ({
  hasArrowEnd: true,
  hasArrowStart: false,
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  source: "a",
  style: "solid",
  target: "b",
  ...overrides,
});

const graph = (overrides: Partial<PositionedGraph> = {}): PositionedGraph => ({
  edges: [],
  groups: [],
  height: 100,
  nodes: [],
  width: 200,
  ...overrides,
});

const render = (value: PositionedGraph): string => renderSvg(value, options);

const geometryCases: readonly [NodeGeometry, string][] = [
  ["rectangle", "<rect"],
  ["rounded", 'rx="6"'],
  ["diamond", '<polygon points="50,20 90,40 50,60 10,40"'],
  ["stadium", 'rx="20"'],
  ["circle", '<circle cx="50" cy="40" r="20"'],
  ["subroutine", '<line x1="18"'],
  ["doublecircle", '<circle cx="50" cy="40" r="15"'],
  ["hexagon", '<polygon points="20,20 80,20 90,40'],
  ["cylinder", '<ellipse cx="50" cy="53"'],
  ["asymmetric", '<polygon points="22,20 90,20 90,60 22,60 10,40"'],
  ["trapezoid", '<polygon points="22,20 90,20 78,60 10,60"'],
  ["trapezoid-alt", '<polygon points="10,20 78,20 90,60 22,60"'],
  ["parallelogram", '<polygon points="22,20 90,20 78,60 10,60"'],
  ["parallelogram-alt", '<polygon points="10,20 78,20 90,60 22,60"'],
  ["state-start", 'fill="var(--_text)" stroke="none"'],
  ["state-end", 'r="14" fill="var(--_text)"'],
];

describe("flowchart SVG renderer", () => {
  describe.each(geometryCases)("%s geometry", (geometry, expected) => {
    it("renders its SVG primitive", () => {
      const svg = render(graph({ nodes: [node(geometry)] }));

      expect(svg).toContain(expected);
      expect(svg).toContain(`data-shape="${geometry}"`);
    });
  });

  it("renders edge terminals, line styles, and explicit label positions", () => {
    const svg = render(
      graph({
        edges: [
          edge({
            hasArrowStart: true,
            inlineStyle: { stroke: "#f00", "stroke-width": "3px" },
            label: "yes\nno",
            labelPosition: { x: 30, y: 20 },
            style: "dotted",
            terminalEnd: "circle",
            terminalStart: "cross",
          }),
        ],
      })
    );

    expect(svg).toContain('marker-start="url(#terminal-cross-');
    expect(svg).toContain('marker-end="url(#terminal-circle-');
    expect(svg).toContain('stroke-dasharray="4 4"');
    expect(svg).toContain('<rect x="12.265" y="-2.3000000000000007"');
    expect(svg).toContain('<text x="30" y="20"');
  });

  it("applies node styles and centers formatted multiline labels", () => {
    const svg = render(
      graph({
        nodes: [
          node("rounded", {
            inlineStyle: {
              color: "#333",
              fill: "#abc",
              stroke: "#123",
              "stroke-width": "2",
            },
            label: "A\n<b>B</b>",
          }),
        ],
      })
    );

    expect(svg).toContain('fill="#abc" stroke="#123" stroke-width="2"');
    expect(svg).toContain('fill="#333"');
    expect(svg).toContain('<text x="50" y="40"');
    expect(svg).toContain('<tspan font-weight="bold">B</tspan>');
  });

  it("escapes XML in every user-controlled rendering context", () => {
    const payload = '&quot;"><script>alert(1)</script>';

    const svg = render(
      graph({
        edges: [
          edge({
            inlineStyle: { stroke: payload },
            label: payload,
            source: payload,
            target: payload,
          }),
        ],
        groups: [
          {
            children: [],
            height: 80,
            id: payload,
            label: payload,
            width: 150,
            x: 0,
            y: 0,
          },
        ],
        nodes: [node("rectangle", { id: payload, label: payload })],
      })
    );

    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain('stroke="&quot;><script');
    expect(svg).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(svg).toContain("&amp;quot;&quot;");
  });

  it("renders nested groups before state pseudostates", () => {
    const child: PositionedGroup = {
      children: [],
      height: 80,
      id: "child",
      label: "Child",
      width: 120,
      x: 20,
      y: 30,
    };

    const parent: PositionedGroup = {
      children: [child],
      height: 160,
      id: "parent",
      label: "Parent",
      width: 180,
      x: 5,
      y: 5,
    };

    const svg = render(
      graph({
        groups: [parent],
        nodes: [node("state-start"), node("state-end", { x: 100 })],
      })
    );

    expect(svg).toContain('data-id="parent"');
    expect(svg).toContain('data-id="child"');
    expect(svg.indexOf('data-id="parent"')).toBeLessThan(
      svg.indexOf('data-id="child"')
    );
    expect(svg).toContain('data-shape="state-start"');
    expect(svg).toContain('data-shape="state-end"');
  });
});
