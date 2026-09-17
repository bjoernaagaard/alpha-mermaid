import type { RenderOptions } from "../options.ts";
import type { PositionedGraph } from "./model.ts";

const escapeXml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const renderSvg = (
  graph: PositionedGraph,
  options: RenderOptions
): string => {
  const font = options.font ?? "Inter";

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${graph.width} ${graph.height}" width="${graph.width}" height="${graph.height}" style="--bg:${options.bg ?? "#FFFFFF"};--fg:${options.fg ?? "#27272A"};background:var(--bg)">`,
    "<style>",
    `  @import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;500;600;700&amp;display=swap');`,
    `  text { font-family: '${font}', system-ui, sans-serif; }`,
    "  svg {",
    "    --_text: var(--fg);",
    "    --_line: var(--line, color-mix(in srgb, var(--fg) 50%, var(--bg)));",
    "    --_arrow: var(--accent, color-mix(in srgb, var(--fg) 85%, var(--bg)));",
    "    --_node-fill: var(--surface, color-mix(in srgb, var(--fg) 3%, var(--bg)));",
    "    --_node-stroke: var(--border, color-mix(in srgb, var(--fg) 20%, var(--bg)));",
    "  }",
    "</style>",
    "<defs>",
    '  <marker id="arrowhead" markerWidth="8" markerHeight="5" refX="7" refY="2.5" orient="auto">',
    '    <polygon points="0 0, 8 2.5, 0 5" fill="var(--_arrow)" stroke="var(--_arrow)" stroke-width="0.75" stroke-linejoin="round" />',
    "  </marker>",
    "</defs>",
  ];

  for (const edge of graph.edges) {
    const points = edge.points
      .map((point) => `${point.x},${point.y}`)
      .join(" ");

    parts.push(
      `<polyline class="edge" data-from="${escapeXml(edge.source)}" data-to="${escapeXml(edge.target)}" data-style="solid" data-arrow-start="false" data-arrow-end="true" points="${points}" fill="none" stroke="var(--_line)" stroke-width="1" marker-end="url(#arrowhead)" />`
    );
  }

  for (const node of graph.nodes) {
    parts.push(
      `<g class="node" data-id="${escapeXml(node.id)}" data-label="${escapeXml(node.label)}" data-shape="rectangle">`,
      `  <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="0" ry="0" fill="var(--_node-fill)" stroke="var(--_node-stroke)" stroke-width="0.75" />`,
      `  <text x="${node.x + node.width / 2}" y="${node.y + node.height / 2}" text-anchor="middle" font-size="13" font-weight="500" fill="var(--_text)" dy="${13 * 0.35}">${escapeXml(node.label)}</text>`,
      "</g>"
    );
  }

  parts.push("</svg>");

  return parts.join("\n");
};
