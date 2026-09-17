import {
  escapeXml,
  renderMultilineText,
  renderMultilineTextWithBackground,
} from "../multiline-utils.ts";
import type { RenderOptions } from "../options.ts";
import { measureMultilineText } from "../text-metrics.ts";
import type {
  Point,
  PositionedEdge,
  PositionedGraph,
  PositionedGroup,
  PositionedNode,
} from "./model.ts";
import {
  ARROW_HEAD,
  FONT_SIZES,
  FONT_WEIGHTS,
  STROKE_WIDTHS,
} from "./styles.ts";

const escapeAttr = escapeXml;

const markerSuffix = (color: string): string =>
  color.replaceAll(
    /[^a-zA-Z0-9]/gu,
    (character) => character.codePointAt(0)?.toString(16) ?? ""
  );

const arrowDefs = (color = "var(--_arrow)", suffix = ""): string => {
  const { height, width } = ARROW_HEAD;
  const id = suffix ? `-${suffix}` : "";
  const escaped = escapeAttr(color);

  return `  <marker id="arrowhead${id}" markerWidth="${width}" markerHeight="${height}" refX="${width - 1}" refY="${height / 2}" orient="auto">
    <polygon points="0 0, ${width} ${height / 2}, 0 ${height}" fill="${escaped}" stroke="${escaped}" stroke-width="0.75" stroke-linejoin="round" />
  </marker>
  <marker id="arrowhead-start${id}" markerWidth="${width}" markerHeight="${height}" refX="1" refY="${height / 2}" orient="auto-start-reverse">
    <polygon points="${width} 0, 0 ${height / 2}, ${width} ${height}" fill="${escaped}" stroke="${escaped}" stroke-width="0.75" stroke-linejoin="round" />
  </marker>`;
};

const terminalDefs = (color: string, suffix = ""): string => {
  const id = suffix ? `-${suffix}` : "";

  return `  <marker id="terminal-circle${id}" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto" markerUnits="userSpaceOnUse">
    <circle cx="4" cy="4" r="3.25" fill="var(--bg)" stroke="${escapeAttr(color)}" stroke-width="1" />
  </marker>
  <marker id="terminal-cross${id}" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto" markerUnits="userSpaceOnUse">
    <path d="M1 1 L7 7 M7 1 L1 7" fill="none" stroke="${escapeAttr(color)}" stroke-width="1.5" stroke-linecap="round" />
  </marker>`;
};

const styleBlock = (font: string): string => `<style>
  @import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;500;600;700&amp;display=swap');
  text { font-family: '${escapeAttr(font)}', system-ui, sans-serif; }
  svg {
    --_text: var(--fg);
    --_text-sec: var(--muted, color-mix(in srgb, var(--fg) 60%, var(--bg)));
    --_line: var(--line, color-mix(in srgb, var(--fg) 50%, var(--bg)));
    --_arrow: var(--accent, color-mix(in srgb, var(--fg) 85%, var(--bg)));
    --_node-fill: var(--surface, color-mix(in srgb, var(--fg) 3%, var(--bg)));
    --_node-stroke: var(--border, color-mix(in srgb, var(--fg) 20%, var(--bg)));
    --_group-fill: var(--bg);
    --_group-hdr: color-mix(in srgb, var(--fg) 5%, var(--bg));
    --_inner-stroke: color-mix(in srgb, var(--fg) 12%, var(--bg));
  }
</style>`;

const renderGroup = (group: PositionedGroup): string => {
  const headerHeight = FONT_SIZES.groupHeader + 16;
  const children = group.children.map(renderGroup).join("\n");

  return `<g class="subgraph" data-id="${escapeAttr(group.id)}" data-label="${escapeAttr(group.label)}">
  <rect x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" rx="0" ry="0" fill="var(--_group-fill)" stroke="var(--_node-stroke)" stroke-width="${STROKE_WIDTHS.outerBox}" />
  <rect x="${group.x}" y="${group.y}" width="${group.width}" height="${headerHeight}" rx="0" ry="0" fill="var(--_group-hdr)" stroke="var(--_node-stroke)" stroke-width="${STROKE_WIDTHS.outerBox}" />
  ${renderMultilineText(group.label, group.x + 12, group.y + headerHeight / 2, FONT_SIZES.groupHeader, `font-size="${FONT_SIZES.groupHeader}" font-weight="${FONT_WEIGHTS.groupHeader}" fill="var(--_text-sec)"`)}${children ? `\n${children}` : ""}
</g>`;
};

const edgeMarkers = (edge: PositionedEdge, suffix: string): string => {
  if (edge.style === "invisible") {
    return "";
  }

  let start = "";

  if (edge.terminalStart) {
    start = ` marker-start="url(#terminal-${edge.terminalStart}${suffix})"`;
  } else if (edge.hasArrowStart) {
    start = ` marker-start="url(#arrowhead-start${suffix})"`;
  }

  let end = "";

  if (edge.terminalEnd) {
    end = ` marker-end="url(#terminal-${edge.terminalEnd}${suffix})"`;
  } else if (edge.hasArrowEnd) {
    end = ` marker-end="url(#arrowhead${suffix})"`;
  }

  return `${end}${start}`;
};

const renderEdge = (edge: PositionedEdge): string => {
  if (edge.points.length < 2) {
    return "";
  }

  const { style } = edge;
  const invisible = style === "invisible";

  const stroke = invisible
    ? "none"
    : escapeAttr(edge.inlineStyle?.stroke ?? "var(--_line)");

  const width = escapeAttr(
    edge.inlineStyle?.["stroke-width"] ??
      String(
        style === "thick"
          ? STROKE_WIDTHS.connector * 2
          : STROKE_WIDTHS.connector
      )
  );

  const suffix = edge.inlineStyle?.stroke
    ? `-${markerSuffix(edge.inlineStyle.stroke)}`
    : "";

  const markers = edgeMarkers(edge, suffix);

  const label = edge.label ? ` data-label="${escapeAttr(edge.label)}"` : "";
  const terminals = `${edge.terminalStart ? ` data-terminal-start="${edge.terminalStart}"` : ""}${edge.terminalEnd ? ` data-terminal-end="${edge.terminalEnd}"` : ""}`;

  return `<polyline class="edge" data-from="${escapeAttr(edge.source)}" data-to="${escapeAttr(edge.target)}" data-style="${style}" data-arrow-start="${edge.hasArrowStart}" data-arrow-end="${edge.hasArrowEnd}"${terminals}${label} points="${edge.points.map(({ x, y }) => `${x},${y}`).join(" ")}" fill="none" stroke="${stroke}" stroke-width="${width}"${style === "dotted" ? ' stroke-dasharray="4 4"' : ""}${markers} />`;
};

const distance = (a: Point, b: Point): number =>
  Math.hypot(b.x - a.x, b.y - a.y);

const pointPair = (
  points: readonly Point[],
  index: number
): readonly [Point, Point] | undefined => {
  const start = points[index - 1];
  const end = points[index];

  return start && end ? [start, end] : undefined;
};

const edgeMidpoint = (points: readonly Point[]): Point => {
  if (points.length < 2) {
    return points[0] ?? { x: 0, y: 0 };
  }

  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    const pair = pointPair(points, index);

    if (pair) {
      total += distance(...pair);
    }
  }

  let remaining = total / 2;

  for (let index = 1; index < points.length; index += 1) {
    const pair = pointPair(points, index);

    if (!pair) {
      continue;
    }

    const [start, end] = pair;
    const length = distance(start, end);

    if (remaining <= length) {
      const ratio = length === 0 ? 0 : remaining / length;

      return {
        x: start.x + ratio * (end.x - start.x),
        y: start.y + ratio * (end.y - start.y),
      };
    }

    remaining -= length;
  }

  return points.at(-1) ?? { x: 0, y: 0 };
};

const renderEdgeLabel = (edge: PositionedEdge): string => {
  const label = edge.label ?? "";
  const center = edge.labelPosition ?? edgeMidpoint(edge.points);

  const metrics = measureMultilineText(
    label,
    FONT_SIZES.edgeLabel,
    FONT_WEIGHTS.edgeLabel
  );

  const content = renderMultilineTextWithBackground(
    label,
    center.x,
    center.y,
    metrics.width,
    metrics.height,
    FONT_SIZES.edgeLabel,
    8,
    `text-anchor="middle" font-size="${FONT_SIZES.edgeLabel}" font-weight="${FONT_WEIGHTS.edgeLabel}" fill="var(--_text-sec)"`,
    'rx="2" ry="2" fill="var(--bg)" stroke="var(--_inner-stroke)" stroke-width="1"'
  );

  return `<g class="edge-label" data-from="${escapeAttr(edge.source)}" data-to="${escapeAttr(edge.target)}" data-label="${escapeAttr(label)}">
  ${content.replaceAll("\n", "\n  ")}
</g>`;
};

const polygon = (
  points: readonly Point[],
  fill: string,
  stroke: string,
  sw: string
): string =>
  `<polygon points="${points.map(({ x, y }) => `${x},${y}`).join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;

interface GeometryPaint {
  readonly fill: string;
  readonly stroke: string;
  readonly width: string;
}

const geometryPaint = (node: PositionedNode): GeometryPaint => ({
  fill: escapeAttr(node.inlineStyle?.fill ?? "var(--_node-fill)"),
  stroke: escapeAttr(node.inlineStyle?.stroke ?? "var(--_node-stroke)"),
  width: escapeAttr(
    node.inlineStyle?.["stroke-width"] ?? String(STROKE_WIDTHS.innerBox)
  ),
});

const renderNodeGeometry = (node: PositionedNode): string => {
  const { x, y, width: w, height: h } = node;
  const { fill, stroke, width: sw } = geometryPaint(node);
  const cx = x + w / 2;
  const cy = y + h / 2;

  switch (node.geometry) {
    case "rounded": {
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" ry="6" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
    }

    case "stadium": {
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" ry="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
    }

    case "circle": {
      return `<circle cx="${cx}" cy="${cy}" r="${Math.min(w, h) / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
    }

    case "diamond": {
      return polygon(
        [
          { x: cx, y },
          { x: x + w, y: cy },
          { x: cx, y: y + h },
          { x, y: cy },
        ],
        fill,
        stroke,
        sw
      );
    }

    case "hexagon": {
      const inset = h / 4;

      return polygon(
        [
          { x: x + inset, y },
          { x: x + w - inset, y },
          { x: x + w, y: cy },
          { x: x + w - inset, y: y + h },
          { x: x + inset, y: y + h },
          { x, y: cy },
        ],
        fill,
        stroke,
        sw
      );
    }

    case "asymmetric": {
      return polygon(
        [
          { x: x + 12, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x: x + 12, y: y + h },
          { x, y: cy },
        ],
        fill,
        stroke,
        sw
      );
    }

    case "trapezoid":
    case "parallelogram": {
      const inset = Math.min(w * 0.15, 12);

      return polygon(
        [
          { x: x + inset, y },
          { x: x + w, y },
          { x: x + w - inset, y: y + h },
          { x, y: y + h },
        ],
        fill,
        stroke,
        sw
      );
    }

    case "trapezoid-alt":
    case "parallelogram-alt": {
      const inset = Math.min(w * 0.15, 12);

      return polygon(
        [
          { x, y },
          { x: x + w - inset, y },
          { x: x + w, y: y + h },
          { x: x + inset, y: y + h },
        ],
        fill,
        stroke,
        sw
      );
    }

    case "subroutine": {
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0" ry="0" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />\n<line x1="${x + 8}" y1="${y}" x2="${x + 8}" y2="${y + h}" stroke="${stroke}" stroke-width="${sw}" />\n<line x1="${x + w - 8}" y1="${y}" x2="${x + w - 8}" y2="${y + h}" stroke="${stroke}" stroke-width="${sw}" />`;
    }

    case "doublecircle": {
      const r = Math.min(w, h) / 2;

      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />\n<circle cx="${cx}" cy="${cy}" r="${r - 5}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
    }

    case "cylinder": {
      const ry = 7;

      return `<rect x="${x}" y="${y + ry}" width="${w}" height="${h - 2 * ry}" fill="${fill}" stroke="none" />\n<line x1="${x}" y1="${y + ry}" x2="${x}" y2="${y + h - ry}" stroke="${stroke}" stroke-width="${sw}" />\n<line x1="${x + w}" y1="${y + ry}" x2="${x + w}" y2="${y + h - ry}" stroke="${stroke}" stroke-width="${sw}" />\n<ellipse cx="${cx}" cy="${y + h - ry}" rx="${w / 2}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />\n<ellipse cx="${cx}" cy="${y + ry}" rx="${w / 2}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
    }

    case "state-start": {
      return `<circle cx="${cx}" cy="${cy}" r="${Math.min(w, h) / 2 - 2}" fill="var(--_text)" stroke="none" />`;
    }

    case "state-end": {
      const r = Math.min(w, h) / 2 - 2;

      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--_text)" stroke-width="${STROKE_WIDTHS.innerBox * 2}" />\n<circle cx="${cx}" cy="${cy}" r="${r - 4}" fill="var(--_text)" stroke="none" />`;
    }

    default: {
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0" ry="0" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
    }
  }
};

const renderNode = (node: PositionedNode): string => {
  const { geometry } = node;

  const label =
    (geometry === "state-start" || geometry === "state-end") && !node.label
      ? ""
      : renderMultilineText(
          node.label,
          node.x + node.width / 2,
          node.y + node.height / 2,
          FONT_SIZES.nodeLabel,
          `text-anchor="middle" font-size="${FONT_SIZES.nodeLabel}" font-weight="${FONT_WEIGHTS.nodeLabel}" fill="${escapeAttr(node.inlineStyle?.color ?? "var(--_text)")}"`
        );

  return `<g class="node" data-id="${escapeAttr(node.id)}" data-label="${escapeAttr(node.label)}" data-shape="${geometry}">
  ${renderNodeGeometry(node).replaceAll("\n", "\n  ")}${label ? `\n  ${label.replaceAll("\n", "\n  ")}` : ""}
</g>`;
};

export const renderSvg = (
  graph: PositionedGraph,
  options: RenderOptions
): string => {
  const font = options.font ?? "Inter";

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${graph.width} ${graph.height}" width="${graph.width}" height="${graph.height}" style="--bg:${options.bg ?? "#FFFFFF"};--fg:${options.fg ?? "#27272A"};background:var(--bg)">`,
    styleBlock(font),
    "<defs>",
    arrowDefs(),
  ];

  const terminals = graph.edges.some(
    (edge) => edge.terminalStart || edge.terminalEnd
  );

  if (terminals) {
    parts.push(terminalDefs("var(--_arrow)"));
  }

  const colors = new Set(
    graph.edges
      .map((edge) => edge.inlineStyle?.stroke)
      .filter((color): color is string => color !== undefined)
  );

  for (const color of colors) {
    const suffix = markerSuffix(color);
    parts.push(arrowDefs(color, suffix));

    if (terminals) {
      parts.push(terminalDefs(color, suffix));
    }
  }

  parts.push("</defs>");

  for (const group of graph.groups) {
    parts.push(renderGroup(group));
  }

  for (const edge of graph.edges) {
    parts.push(renderEdge(edge));
  }

  for (const edge of graph.edges) {
    if (edge.label) {
      parts.push(renderEdgeLabel(edge));
    }
  }

  for (const node of graph.nodes) {
    parts.push(renderNode(node));
  }

  parts.push("</svg>");

  return parts.join("\n");
};
