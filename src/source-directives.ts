import { escapeXml } from "./multiline-utils.ts";
import { ParseError } from "./parse-error.ts";

const objectEnd = (text: string, start: number): number => {
  let depth = 0;
  let quoted = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        quoted = false;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return index + 1;
      }
    }
  }

  throw new ParseError({ message: "Unterminated init directive JSON object" });
};

export const scanDirectives = (source: string) => {
  const configs: string[] = [];
  let cursor = 0;
  let text = "";

  while (cursor < source.length) {
    const rest = source.slice(cursor);
    const match = /%%\s*\{\s*(?:init|initialize)\s*:\s*/iu.exec(rest);

    if (!match) {
      text += rest;
      break;
    }

    const start = cursor + match.index;
    const jsonStart = start + match[0].length;

    if (source[jsonStart] !== "{") {
      throw new ParseError({
        message: "Invalid init directive: expected a JSON object after init:",
      });
    }

    const end = objectEnd(source, jsonStart);
    const closing = /^\s*\}\s*%%/u.exec(source.slice(end));

    if (!closing) {
      throw new ParseError({
        message: "Invalid init directive: expected a closing }%%",
      });
    }

    configs.push(source.slice(jsonStart, end));
    text += source.slice(cursor, start);
    cursor = end + closing[0].length;
  }

  return { configs, text };
};

export const extractAccessibility = (source: string) => {
  let title: string | undefined;
  let description: string | undefined;
  const lines: string[] = [];

  for (const line of source.split("\n")) {
    const match = /^\s*(?<kind>accTitle|accDescr)\s*:\s*(?<text>.*)$/iu.exec(
      line
    );

    if (!match) {
      lines.push(line);
    } else if (match.groups?.kind?.toLowerCase() === "acctitle") {
      title = match.groups.text?.trim();
    } else {
      description = match.groups?.text?.trim();
    }
  }

  const tags = [
    title === undefined ? "" : `<title>${escapeXml(title)}</title>`,
    description === undefined ? "" : `<desc>${escapeXml(description)}</desc>`,
  ]
    .filter(Boolean)
    .join("\n");

  return { tags, text: lines.join("\n") };
};

export const errorPlaceholder = (message: string): string =>
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 48" width="640" height="48" role="img">' +
  `<text x="16" y="30" fill="#b42318" font-family="system-ui, sans-serif">${escapeXml(message)}</text></svg>`;
