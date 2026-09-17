const narrow = new Set("iltfjI1!|.,:;'");

const wide = new Set("wm@%");

const punctuation = new Set('()[]{}/\\-"`');

const emoji = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/u;

const combining =
  /[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/u;

const fullwidth =
  /[\u1100-\u115F\u2E80-\u2EFF\u2F00-\u2FDF\u3000-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFF60\uFFE0-\uFFE6\u{20000}-\u{10FFFF}]/u;

const characterWidth = (char: string): number => {
  if (combining.test(char)) {
    return 0;
  }

  if (fullwidth.test(char) || emoji.test(char)) {
    return 2;
  }

  if (char === " ") {
    return 0.3;
  }

  if (char === "W" || char === "M") {
    return 1.5;
  }

  if (wide.has(char)) {
    return 1.2;
  }

  if (narrow.has(char)) {
    return 0.4;
  }

  if (punctuation.has(char)) {
    return 0.5;
  }

  if (char === "r") {
    return 0.8;
  }

  if (char >= "A" && char <= "Z") {
    return 1.2;
  }

  return 1;
};

export const measureTextWidth = (
  text: string,
  fontSize: number,
  fontWeight: number
): number => {
  let ratio = 0.54;

  if (fontWeight >= 600) {
    ratio = 0.6;
  } else if (fontWeight >= 500) {
    ratio = 0.57;
  }

  let width = 0;

  for (const char of text) {
    width += characterWidth(char);
  }

  return width * fontSize * ratio + fontSize * 0.15;
};

export const LINE_HEIGHT_RATIO = 1.3;

export interface MultilineMetrics {
  readonly width: number;
  readonly height: number;
  readonly lines: readonly string[];
  readonly lineHeight: number;
}

export const measureMultilineText = (
  text: string,
  fontSize: number,
  fontWeight: number
): MultilineMetrics => {
  const lines = text.split("\n");

  const widths = lines.map((line) =>
    measureTextWidth(
      line.replaceAll(/<\/?(?:b|strong|i|em|u|s|del)\s*>/giu, ""),
      fontSize,
      fontWeight
    )
  );

  const lineHeight = fontSize * LINE_HEIGHT_RATIO;

  return {
    height: lines.length * lineHeight,
    lineHeight,
    lines,
    width: Math.max(0, ...widths),
  };
};

export const measureLabel = (label: string) => {
  const { height, width } = measureMultilineText(label, 13, 500);

  return { height, width };
};
