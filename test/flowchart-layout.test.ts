import { describe, expect, it } from "vitest";

import { fromElk, layoutFlowchart, toElk } from "../src/flowchart/layout.ts";
import { parseFlowchart } from "../src/flowchart/parser.ts";

const byId = <Value extends { readonly id: string }>(
  values: readonly Value[],
  id: string
): Value => {
  const value = values.find((candidate) => candidate.id === id);

  if (!value) {
    throw new Error(`missing ${id}`);
  }

  return value;
};

describe("flowchart layout", () => {
  it("lays out nested and disconnected groups without overlapping their bounds", () => {
    const graph = parseFlowchart(`flowchart TD
      subgraph outer [Outer]
        A[wide label]
        subgraph inner [Inner]
          B[tiny]
          C[another asymmetric label]
          B --> C
        end
      end
      subgraph detached [Detached]
        D[alone]
      end`);

    const result = layoutFlowchart(graph, {});
    const outer = byId(result.groups, "outer");
    const inner = byId(outer.children, "inner");
    const detached = byId(result.groups, "detached");

    expect(inner.x).toBeGreaterThanOrEqual(outer.x);
    expect(inner.y).toBeGreaterThanOrEqual(outer.y);
    expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
    expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
    expect(
      detached.x >= outer.x + outer.width ||
        outer.x >= detached.x + detached.width
    ).toBeTruthy();
  });

  it("honors an asymmetric direction override inside a vertical graph", () => {
    const graph = parseFlowchart(`flowchart TD
      subgraph row [Row]
        direction LR
        short[A] --> long[A much longer label]
      end`);

    const result = layoutFlowchart(graph, {});
    const short = byId(result.nodes, "short");
    const long = byId(result.nodes, "long");

    expect(long.x).toBeGreaterThan(short.x + short.width);
    expect(Math.abs(long.y - short.y)).toBeLessThan(1);
  });

  it("retains every routed edge crossing a direction-override boundary", () => {
    const graph = parseFlowchart(`flowchart LR
      A --> B
      subgraph S
        direction TB
        B --> C
      end
      C --> D`);

    const result = layoutFlowchart(graph, {});

    expect(
      result.edges.map(({ source, target }) => `${source}->${target}`)
    ).toStrictEqual(["A->B", "B->C", "C->D"]);
    expect(result.edges).toHaveLength(graph.edges.length);
    expect(result.edges.every((edge) => edge.points.length >= 2)).toBeTruthy();
  });

  it("builds source-compatible hierarchical ports and edge segments", () => {
    const graph = parseFlowchart(`flowchart LR
      A --> B
      subgraph outer
        direction TB
        B --> C
        subgraph inner
          C --> D
        end
      end
      D --> E`);

    const elk = toElk(graph, {});
    const outer = elk.children?.find(({ id }) => id === "outer");
    const inner = outer?.children?.find(({ id }) => id === "inner");

    expect(outer?.ports?.map(({ id }) => id)).toStrictEqual([
      "outer_in_1",
      "outer_out_2",
    ]);
    expect(inner?.ports?.map(({ id }) => id)).toStrictEqual([
      "inner_in_2",
      "inner_out_3",
    ]);
    expect([
      outer?.edges?.map(({ id }) => id),
      inner?.edges?.map(({ id }) => id),
    ]).toStrictEqual([
      ["e1_internal", "e2_internal"],
      ["e2_internal", "e3_internal"],
    ]);
    expect(
      elk.edges?.map(({ id, sources, targets }) => ({ id, sources, targets }))
    ).toStrictEqual([
      { id: "e0", sources: ["A"], targets: ["B"] },
      { id: "e1", sources: ["B"], targets: ["outer_in_1"] },
      { id: "e2", sources: ["outer_out_2"], targets: ["inner_in_2"] },
      { id: "e3", sources: ["inner_out_3"], targets: ["E"] },
    ]);

    const result = layoutFlowchart(graph, {});
    expect({
      count: result.edges.length,
      routed: result.edges.every((edge) => edge.points.length >= 2),
    }).toStrictEqual({ count: 4, routed: true });
  });

  it("clips edge endpoints to non-rectangular node geometry", () => {
    const result = layoutFlowchart(
      parseFlowchart(
        "flowchart LR; decision{uneven decision} --> output[/result/]"
      ),
      {}
    );

    const decision = byId(result.nodes, "decision");
    const output = byId(result.nodes, "output");
    const [edge] = result.edges;
    const start = edge?.points[0];
    const end = edge?.points.at(-1);

    if (!start || !end) {
      throw new Error("missing routed edge endpoints");
    }

    expect(
      start.x > decision.x && start.x <= decision.x + decision.width
    ).toBeTruthy();
    expect(end.x >= output.x && end.x < output.x + output.width).toBeTruthy();
  });

  it("uses fixed state marker sizes and independent text sizes", () => {
    const result = layoutFlowchart(
      parseFlowchart(`stateDiagram-v2
        [*] --> Working
        Working --> [*]`),
      {}
    );

    const markers = result.nodes.filter((node) =>
      node.geometry.startsWith("state-")
    );

    const working = byId(result.nodes, "Working");

    expect(markers).toHaveLength(2);
    expect(
      markers.map(({ height, width }) => ({ height, width }))
    ).toStrictEqual([
      { height: 28, width: 28 },
      { height: 28, width: 28 },
    ]);
    expect(working.width).toBeGreaterThan(28);
  });

  it("rejects incomplete nested ELK nodes", () => {
    const graph = parseFlowchart("flowchart LR; A");
    expect(() =>
      fromElk(
        { children: [{ height: 20, id: "A", width: 40 }], id: "root" },
        graph
      )
    ).toThrow("incomplete node");
  });

  it("forwards component spacing independently", () => {
    const graph = parseFlowchart("flowchart LR; A; B");
    expect(toElk(graph, { componentSpacing: 67 }).layoutOptions).toMatchObject({
      "elk.spacing.componentComponent": "67",
    });
  });
});
