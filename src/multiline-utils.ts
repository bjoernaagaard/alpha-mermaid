import { LINE_HEIGHT_RATIO } from "./text-metrics.ts";

export const normalizeBrTags = (label: string): string => {
  const unquoted =
    label.startsWith('"') && label.endsWith('"') ? label.slice(1, -1) : label;

  return unquoted
    .replaceAll(/<br\s*\/?>/giu, "\n")
    .replaceAll("\\n", "\n")
    .replaceAll(/<\/?(?:sub|sup|small|mark)\s*>/giu, "")
    .replaceAll(/\*\*(?<content>.+?)\*\*/gu, "<b>$<content></b>")
    .replaceAll(
      /(?<!\*)\*(?<content>[^\s*](?:[^*]*[^\s*])?)\*(?!\*)/gu,
      "<i>$<content></i>"
    )
    .replaceAll(/~~(?<content>.+?)~~/gu, "<s>$<content></s>");
};

export const stripFormattingTags = (text: string): string =>
  text.replaceAll(/<\/?(?:b|strong|i|em|u|s|del)\s*>/giu, "");

export const escapeXml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

interface Segment {
  readonly text: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strike: boolean;
}

const tags =
  /<(?<closing>\/)?(?:(?<bold>b|strong)|(?<italic>i|em)|(?<underline>u)|(?<strike>s|del))\s*>/giu;

const lineContent = (line: string): string => {
  const segments: Segment[] = [];
  let bold = false;
  let italic = false;
  let underline = false;
  let strike = false;
  let offset = 0;
  tags.lastIndex = 0;

  for (let match = tags.exec(line); match; match = tags.exec(line)) {
    if (match.index > offset) {
      segments.push({
        bold,
        italic,
        strike,
        text: line.slice(offset, match.index),
        underline,
      });
    }

    offset = match.index + match[0].length;
    const value = !match.groups?.closing;

    if (match.groups?.bold) {
      bold = value;
    } else if (match.groups?.italic) {
      italic = value;
    } else if (match.groups?.underline) {
      underline = value;
    } else if (match.groups?.strike) {
      strike = value;
    }
  }

  if (offset < line.length) {
    segments.push({
      bold,
      italic,
      strike,
      text: line.slice(offset),
      underline,
    });
  }

  if (segments.length === 0) {
    return escapeXml(line);
  }

  return segments
    .map((segment) => {
      const attrs: string[] = [];

      if (segment.bold) {
        attrs.push('font-weight="bold"');
      }

      if (segment.italic) {
        attrs.push('font-style="italic"');
      }

      const decoration = [
        segment.underline ? "underline" : "",
        segment.strike ? "line-through" : "",
      ].filter(Boolean);

      if (decoration.length > 0) {
        attrs.push(`text-decoration="${decoration.join(" ")}"`);
      }

      const content = escapeXml(segment.text);

      return attrs.length > 0
        ? `<tspan ${attrs.join(" ")}>${content}</tspan>`
        : content;
    })
    .join("");
};

export const renderMultilineText = (
  text: string,
  x: number,
  y: number,
  fontSize: number,
  attrs: string,
  baselineShift = 0.35
): string => {
  const lines = text.split("\n");

  if (lines.length === 1) {
    return `<text x="${x}" y="${y}" ${attrs} dy="${fontSize * baselineShift}">${lineContent(text)}</text>`;
  }

  const lineHeight = fontSize * LINE_HEIGHT_RATIO;

  return `<text x="${x}" y="${y}" ${attrs}>${lines
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? -((lines.length - 1) / 2) * lineHeight + fontSize * baselineShift : lineHeight}">${lineContent(line)}</tspan>`
    )
    .join("")}</text>`;
};

export const renderMultilineTextWithBackground = (
  text: string,
  x: number,
  y: number,
  textWidth: number,
  textHeight: number,
  fontSize: number,
  padding: number,
  textAttrs: string,
  backgroundAttrs: string
): string => {
  const width = textWidth + padding * 2;
  const height = textHeight + padding * 2;

  return `<rect x="${x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}" ${backgroundAttrs} />\n${renderMultilineText(text, x, y, fontSize, textAttrs)}`;
};
