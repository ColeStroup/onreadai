import "server-only";

import { sanitizePdfText } from "@/lib/pdf/text-sanitize";

export type PdfContentBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

export type PdfPageUsage = {
  pageIndex: number;
  firstY: number | null;
  lastY: number;
  drawCount: number;
  textCharacters: number;
};

export type PdfLayoutDiagnostics = {
  pages: PdfPageUsage[];
  contentBounds: PdfContentBounds;
};

type TextOptions = {
  x?: number;
  width?: number;
  font?: "Helvetica" | "Helvetica-Bold";
  fontSize?: number;
  color?: string;
  lineGap?: number;
  align?: "left" | "center" | "right";
  link?: string;
  underline?: boolean;
  after?: number;
  continuationTitle?: string;
};

type CardOptions = {
  title: string;
  eyebrow?: string;
  meta?: string;
  body?: string;
  evidence?: string;
  fill?: string;
  border?: string;
  accent?: string;
  continuationTitle?: string;
  compact?: boolean;
};

type TableColumn = {
  key: string;
  label: string;
  width: number;
  align?: "left" | "center" | "right";
};

const defaultColors = {
  ink: "#17202a",
  muted: "#5f6875",
  border: "#d8dee7",
  accent: "#0f766e",
  soft: "#f5f7fa",
  white: "#ffffff",
};

export function getContentBounds(doc: PDFKit.PDFDocument): PdfContentBounds {
  const left = 54;
  const right = doc.page.width - 54;
  const top = 54;
  const bottom = doc.page.height - 54;

  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export function measureWrappedText(
  doc: PDFKit.PDFDocument,
  text: unknown,
  options: {
    width: number;
    font?: "Helvetica" | "Helvetica-Bold";
    fontSize?: number;
    lineGap?: number;
  },
) {
  const value = sanitizePdfText(text);
  if (!value) return 0;
  doc
    .font(options.font ?? "Helvetica")
    .fontSize(options.fontSize ?? 10);
  return Math.ceil(
    doc.heightOfString(value, {
      width: options.width,
      lineGap: options.lineGap ?? 2.5,
    }),
  );
}

export class PdfFlow {
  readonly bounds: PdfContentBounds;
  readonly diagnostics: PdfLayoutDiagnostics;
  private cursorY: number;
  private pageIndex = 0;

  constructor(
    readonly doc: PDFKit.PDFDocument,
    options?: { startY?: number },
  ) {
    this.bounds = getContentBounds(doc);
    this.cursorY = options?.startY ?? this.bounds.top;
    this.diagnostics = {
      pages: [this.newPageUsage(0)],
      contentBounds: this.bounds,
    };
  }

  get y() {
    return this.cursorY;
  }

  set y(value: number) {
    this.cursorY = value;
  }

  get remainingHeight() {
    return this.bounds.bottom - this.cursorY;
  }

  addPage(continuationTitle?: string) {
    this.doc.addPage();
    this.pageIndex += 1;
    this.cursorY = this.bounds.top;
    this.diagnostics.pages.push(this.newPageUsage(this.pageIndex));

    if (continuationTitle) {
      this.drawContinuationHeader(continuationTitle);
    }
  }

  ensureSpace(requiredHeight: number, continuationTitle?: string) {
    const safeHeight = Math.min(requiredHeight, this.bounds.height);
    if (this.cursorY + safeHeight > this.bounds.bottom) {
      this.addPage(continuationTitle);
    }
    return this.cursorY;
  }

  spacer(height: number) {
    if (height <= 0) return this.cursorY;
    this.ensureSpace(height);
    this.cursorY += height;
    return this.cursorY;
  }

  sectionHeading(title: string, options?: { minContentHeight?: number }) {
    const clean = sanitizePdfText(title);
    const headingHeight = measureWrappedText(this.doc, clean, {
      width: this.bounds.width,
      font: "Helvetica-Bold",
      fontSize: 17,
      lineGap: 1,
    });
    const topSpacing = this.cursorY > this.bounds.top + 4 ? 18 : 0;
    this.ensureSpace(
      topSpacing + headingHeight + 22 + (options?.minContentHeight ?? 34),
    );
    this.cursorY += topSpacing;
    const y = this.cursorY;
    this.doc
      .fillColor(defaultColors.accent)
      .font("Helvetica-Bold")
      .fontSize(17)
      .text(clean, this.bounds.left, y, {
        width: this.bounds.width,
        lineGap: 1,
      });
    this.touch(y, headingHeight, clean.length);
    this.cursorY = y + headingHeight + 8;
    this.doc
      .moveTo(this.bounds.left, this.cursorY)
      .lineTo(this.bounds.right, this.cursorY)
      .strokeColor(defaultColors.border)
      .lineWidth(0.8)
      .stroke();
    this.touch(this.cursorY, 1, 0);
    this.cursorY += 10;
    return this.cursorY;
  }

  subsectionHeading(
    title: string,
    continuationTitle?: string,
    minContentHeight = 72,
  ) {
    const clean = sanitizePdfText(title);
    const height = measureWrappedText(this.doc, clean, {
      width: this.bounds.width,
      font: "Helvetica-Bold",
      fontSize: 11.5,
      lineGap: 1,
    });
    this.ensureSpace(height + minContentHeight, continuationTitle);
    const y = this.cursorY;
    this.doc
      .fillColor(defaultColors.ink)
      .font("Helvetica-Bold")
      .fontSize(11.5)
      .text(clean, this.bounds.left, y, { width: this.bounds.width });
    this.touch(y, height, clean.length);
    this.cursorY = y + height + 8;
    return this.cursorY;
  }

  drawWrappedText(text: unknown, options: TextOptions = {}) {
    const clean = sanitizePdfText(text);
    if (!clean) return this.cursorY;

    const x = options.x ?? this.bounds.left;
    const width = Math.min(
      options.width ?? this.bounds.width,
      this.bounds.right - x,
    );
    const font = options.font ?? "Helvetica";
    const fontSize = options.fontSize ?? 10;
    const lineGap = options.lineGap ?? 3;
    let remaining = clean;

    while (remaining) {
      const available = Math.max(24, this.bounds.bottom - this.cursorY);
      const fullHeight = measureWrappedText(this.doc, remaining, {
        width,
        font,
        fontSize,
        lineGap,
      });

      if (fullHeight > available && this.cursorY > this.bounds.top + 1) {
        const firstChunk = splitTextToHeight(
          this.doc,
          remaining,
          width,
          available,
          { font, fontSize, lineGap },
        );

        if (!firstChunk.head) {
          this.addPage(options.continuationTitle);
          continue;
        }

        this.drawTextChunk(firstChunk.head, {
          x,
          width,
          font,
          fontSize,
          lineGap,
          color: options.color,
          align: options.align,
          link: options.link,
          underline: options.underline,
        });
        remaining = firstChunk.tail;

        if (remaining) this.addPage(options.continuationTitle);
        continue;
      }

      this.ensureSpace(fullHeight, options.continuationTitle);
      this.drawTextChunk(remaining, {
        x,
        width,
        font,
        fontSize,
        lineGap,
        color: options.color,
        align: options.align,
        link: options.link,
        underline: options.underline,
      });
      remaining = "";
    }

    this.cursorY += options.after ?? 8;
    return this.cursorY;
  }

  paragraph(text: unknown, continuationTitle?: string) {
    return this.drawWrappedText(text, {
      fontSize: 10.25,
      color: defaultColors.ink,
      lineGap: 3.2,
      after: 10,
      continuationTitle,
    });
  }

  note(text: unknown, continuationTitle?: string) {
    const clean = sanitizePdfText(text);
    if (!clean) return this.cursorY;
    const padding = 12;
    const width = this.bounds.width - padding * 2;
    const textHeight = measureWrappedText(this.doc, clean, {
      width,
      fontSize: 9,
      lineGap: 2.5,
    });
    const height = Math.max(42, textHeight + padding * 2);
    this.ensureSpace(height + 10, continuationTitle);
    const y = this.cursorY;
    this.doc
      .roundedRect(this.bounds.left, y, this.bounds.width, height, 6)
      .fillAndStroke("#fff8e8", defaultColors.border);
    this.doc
      .fillColor(defaultColors.ink)
      .font("Helvetica")
      .fontSize(9)
      .text(clean, this.bounds.left + padding, y + padding, {
        width,
        lineGap: 2.5,
      });
    this.touch(y, height, clean.length);
    this.cursorY = y + height + 10;
    return this.cursorY;
  }

  keyValueRows(
    rows: ReadonlyArray<readonly [unknown, unknown]>,
    options?: {
      fill?: string;
      labelWidth?: number;
      continuationTitle?: string;
      compact?: boolean;
      keepTogether?: boolean;
    },
  ) {
    const paddingX = 12;
    const paddingY = options?.compact ? 6 : 8;
    const labelWidth = options?.labelWidth ?? 188;
    const valueWidth = this.bounds.width - labelWidth - paddingX * 2;
    const measured = rows.map(([label, value]) => {
      const cleanLabel = sanitizePdfText(label);
      const cleanValue = sanitizePdfText(value);
      const labelHeight = measureWrappedText(this.doc, cleanLabel, {
        width: labelWidth,
        font: "Helvetica-Bold",
        fontSize: 8.75,
        lineGap: 1.5,
      });
      const valueHeight = measureWrappedText(this.doc, cleanValue, {
        width: valueWidth,
        fontSize: 8.9,
        lineGap: 2,
      });
      return {
        label: cleanLabel,
        value: cleanValue,
        height: Math.max(
          options?.compact ? 24 : 27,
          labelHeight + paddingY * 2,
          valueHeight + paddingY * 2,
        ),
      };
    });
    const totalHeight = measured.reduce((sum, row) => sum + row.height, 0);

    if (options?.keepTogether && totalHeight <= this.bounds.height * 0.78) {
      this.ensureSpace(totalHeight + 10, options?.continuationTitle);
    }

    for (const row of measured) {
      if (row.height > this.bounds.height * 0.75) {
        this.subsectionHeading(row.label, options?.continuationTitle);
        this.drawWrappedText(row.value, {
          width: this.bounds.width,
          fontSize: 8.9,
          lineGap: 2,
          continuationTitle: options?.continuationTitle,
        });
        continue;
      }

      this.ensureSpace(row.height, options?.continuationTitle);
      const y = this.cursorY;
      this.doc
        .rect(this.bounds.left, y, this.bounds.width, row.height)
        .fillAndStroke(options?.fill ?? defaultColors.white, defaultColors.border);
      this.doc
        .fillColor(defaultColors.muted)
        .font("Helvetica-Bold")
        .fontSize(8.75)
        .text(row.label, this.bounds.left + paddingX, y + paddingY, {
          width: labelWidth,
          lineGap: 1.5,
        });
      this.doc
        .fillColor(defaultColors.ink)
        .font("Helvetica")
        .fontSize(8.9)
        .text(
          row.value,
          this.bounds.left + paddingX + labelWidth,
          y + paddingY,
          { width: valueWidth, lineGap: 2 },
        );
      this.touch(y, row.height, row.label.length + row.value.length);
      this.cursorY = y + row.height;
    }

    this.cursorY += 10;
    return this.cursorY;
  }

  bulletList(items: unknown[], continuationTitle?: string) {
    for (const item of items) {
      const clean = sanitizePdfText(item);
      if (!clean) continue;
      const textWidth = this.bounds.width - 24;
      const height = measureWrappedText(this.doc, clean, {
        width: textWidth,
        fontSize: 9.6,
        lineGap: 2.8,
      });
      this.ensureSpace(height + 10, continuationTitle);
      const y = this.cursorY;
      this.doc
        .fillColor(defaultColors.accent)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text("-", this.bounds.left + 2, y, { width: 12 });
      this.doc
        .fillColor(defaultColors.ink)
        .font("Helvetica")
        .fontSize(9.6)
        .text(clean, this.bounds.left + 20, y, {
          width: textWidth,
          lineGap: 2.8,
        });
      this.touch(y, height, clean.length + 1);
      this.cursorY = y + height + 7;
    }
    this.cursorY += 3;
    return this.cursorY;
  }

  card(options: CardOptions) {
    const padding = options.compact ? 10 : 13;
    const contentWidth = this.bounds.width - padding * 2;
    const eyebrow = sanitizePdfText(options.eyebrow);
    const title = sanitizePdfText(options.title);
    const meta = sanitizePdfText(options.meta);
    const body = sanitizePdfText(options.body);
    const evidence = sanitizePdfText(options.evidence);
    const eyebrowHeight = eyebrow
      ? measureWrappedText(this.doc, eyebrow, {
          width: contentWidth,
          font: "Helvetica-Bold",
          fontSize: options.compact ? 7.8 : 8.25,
        }) + 6
      : 0;
    const titleHeight = measureWrappedText(this.doc, title, {
      width: contentWidth,
      font: "Helvetica-Bold",
      fontSize: options.compact ? 10.25 : 11.25,
      lineGap: 1.5,
    });
    const metaHeight = meta
      ? measureWrappedText(this.doc, meta, {
          width: contentWidth,
          fontSize: options.compact ? 8 : 8.25,
          lineGap: 1.5,
        }) + 7
      : 0;
    const bodyHeight = body
      ? measureWrappedText(this.doc, body, {
          width: contentWidth,
          fontSize: options.compact ? 8.75 : 9.25,
          lineGap: 2.5,
        }) + 8
      : 0;
    const evidenceHeight = evidence
      ? measureWrappedText(this.doc, evidence, {
          width: contentWidth,
          fontSize: options.compact ? 8 : 8.4,
          lineGap: 2,
        })
      : 0;
    const height =
      padding * 2 +
      eyebrowHeight +
      titleHeight +
      metaHeight +
      bodyHeight +
      evidenceHeight;

    if (height > this.bounds.height * 0.82) {
      this.subsectionHeading(title, options.continuationTitle);
      if (meta) {
        this.drawWrappedText(meta, {
          fontSize: 8.25,
          color: defaultColors.muted,
          after: 6,
          continuationTitle: options.continuationTitle,
        });
      }
      if (body) this.paragraph(body, options.continuationTitle);
      if (evidence) {
        this.drawWrappedText(`Evidence: ${evidence}`, {
          fontSize: 8.4,
          color: defaultColors.muted,
          continuationTitle: options.continuationTitle,
        });
      }
      return this.cursorY;
    }

    this.ensureSpace(height + 12, options.continuationTitle);
    const y = this.cursorY;
    this.doc
      .roundedRect(this.bounds.left, y, this.bounds.width, height, 7)
      .fillAndStroke(options.fill ?? defaultColors.white, options.border ?? defaultColors.border);
    let textY = y + padding;

    if (eyebrow) {
      this.doc
        .fillColor(options.accent ?? defaultColors.accent)
        .font("Helvetica-Bold")
        .fontSize(options.compact ? 7.8 : 8.25)
        .text(eyebrow.toUpperCase(), this.bounds.left + padding, textY, {
          width: contentWidth,
        });
      textY += eyebrowHeight;
    }

    this.doc
      .fillColor(defaultColors.ink)
      .font("Helvetica-Bold")
      .fontSize(options.compact ? 10.25 : 11.25)
      .text(title, this.bounds.left + padding, textY, {
        width: contentWidth,
        lineGap: 1.5,
      });
    textY += titleHeight + 5;

    if (meta) {
      this.doc
        .fillColor(defaultColors.muted)
        .font("Helvetica")
        .fontSize(options.compact ? 8 : 8.25)
        .text(meta, this.bounds.left + padding, textY, {
          width: contentWidth,
          lineGap: 1.5,
        });
      textY += metaHeight;
    }

    if (body) {
      this.doc
        .fillColor(defaultColors.ink)
        .font("Helvetica")
        .fontSize(options.compact ? 8.75 : 9.25)
        .text(body, this.bounds.left + padding, textY, {
          width: contentWidth,
          lineGap: 2.5,
        });
      textY += bodyHeight;
    }

    if (evidence) {
      this.doc
        .fillColor(defaultColors.muted)
        .font("Helvetica")
        .fontSize(options.compact ? 8 : 8.4)
        .text(`Evidence: ${evidence}`, this.bounds.left + padding, textY, {
          width: contentWidth,
          lineGap: 2,
        });
    }

    this.touch(
      y,
      height,
      eyebrow.length + title.length + meta.length + body.length + evidence.length,
    );
    this.cursorY = y + height + 12;
    return this.cursorY;
  }

  table({
    columns,
    rows,
    continuationTitle,
  }: {
    columns: TableColumn[];
    rows: Array<Record<string, unknown>>;
    continuationTitle: string;
  }) {
    const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
    if (Math.abs(totalWidth - this.bounds.width) > 1) {
      throw new Error("PDF table columns must equal the content width.");
    }
    const headerHeight = 28;
    const drawHeader = () => {
      this.ensureSpace(headerHeight + 34, continuationTitle);
      const y = this.cursorY;
      let x = this.bounds.left;
      for (const column of columns) {
        this.doc
          .rect(x, y, column.width, headerHeight)
          .fillAndStroke("#eaf3f2", defaultColors.border);
        this.doc
          .fillColor(defaultColors.ink)
          .font("Helvetica-Bold")
          .fontSize(7.8)
          .text(sanitizePdfText(column.label), x + 6, y + 9, {
            width: column.width - 12,
            align: column.align,
          });
        x += column.width;
      }
      this.touch(y, headerHeight, columns.reduce((sum, col) => sum + col.label.length, 0));
      this.cursorY += headerHeight;
    };

    drawHeader();
    for (const row of rows) {
      const values = columns.map((column) =>
        sanitizePdfText(row[column.key]),
      );
      const rowHeight = Math.max(
        30,
        ...values.map((value, index) =>
          measureWrappedText(this.doc, shortDisplayText(value, 420), {
            width: columns[index].width - 12,
            fontSize: 7.6,
            lineGap: 1.5,
          }) + 14,
        ),
      );

      if (this.cursorY + rowHeight > this.bounds.bottom) {
        this.addPage(continuationTitle);
        drawHeader();
      }
      const y = this.cursorY;
      let x = this.bounds.left;
      for (const [index, column] of columns.entries()) {
        this.doc
          .rect(x, y, column.width, rowHeight)
          .fillAndStroke(defaultColors.white, defaultColors.border);
        this.doc
          .fillColor(defaultColors.ink)
          .font("Helvetica")
          .fontSize(7.6)
          .text(shortDisplayText(values[index], 420), x + 6, y + 7, {
            width: column.width - 12,
            lineGap: 1.5,
            align: column.align,
          });
        x += column.width;
      }
      this.touch(y, rowHeight, values.join("").length);
      this.cursorY += rowHeight;
    }
    this.cursorY += 10;
    return this.cursorY;
  }

  drawContinuationHeader(title: string) {
    const clean = sanitizePdfText(`${title} - continued`);
    const y = this.cursorY;
    this.doc
      .fillColor(defaultColors.muted)
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text(clean, this.bounds.left, y, { width: this.bounds.width });
    this.touch(y, 12, clean.length);
    this.cursorY = y + 22;
    return this.cursorY;
  }

  addPageFooters(reportName: string) {
    const range = this.doc.bufferedPageRange();
    const cleanReportName = sanitizePdfText(reportName);
    const footerName =
      cleanReportName.length > 48
        ? `${cleanReportName.slice(0, 45).trim()}...`
        : cleanReportName;
    for (let index = range.start; index < range.start + range.count; index += 1) {
      this.doc.switchToPage(index);
      const label = sanitizePdfText(
        `${footerName} | ${index + 1} of ${range.count}`,
      );
      this.doc
        .fillColor("#7a8491")
        .font("Helvetica")
        .fontSize(7.5)
        .text(label, this.bounds.left, this.doc.page.height - 34, {
          width: this.bounds.width,
          align: "center",
          lineBreak: false,
        });
    }
  }

  private drawTextChunk(
    text: string,
    options: Required<
      Pick<TextOptions, "x" | "width" | "font" | "fontSize" | "lineGap">
    > &
      Pick<
        TextOptions,
        "color" | "align" | "link" | "underline"
      >,
  ) {
    const height = measureWrappedText(this.doc, text, {
      width: options.width,
      font: options.font,
      fontSize: options.fontSize,
      lineGap: options.lineGap,
    });
    const y = this.cursorY;
    this.doc
      .fillColor(options.color ?? defaultColors.ink)
      .font(options.font)
      .fontSize(options.fontSize)
      .text(text, options.x, y, {
        width: options.width,
        lineGap: options.lineGap,
        align: options.align,
        link: options.link,
        underline: options.underline,
      });
    this.touch(y, height, text.length);
    this.cursorY = y + height;
  }

  private touch(y: number, height: number, textCharacters: number) {
    const usage = this.diagnostics.pages[this.pageIndex];
    usage.firstY = usage.firstY === null ? y : Math.min(usage.firstY, y);
    usage.lastY = Math.max(usage.lastY, y + height);
    usage.drawCount += 1;
    usage.textCharacters += textCharacters;
  }

  private newPageUsage(pageIndex: number): PdfPageUsage {
    return {
      pageIndex,
      firstY: null,
      lastY: 0,
      drawCount: 0,
      textCharacters: 0,
    };
  }
}

export function drawWrappedText(
  flow: PdfFlow,
  text: unknown,
  options?: TextOptions,
) {
  return flow.drawWrappedText(text, options);
}

export function drawSectionHeading(
  flow: PdfFlow,
  title: string,
  options?: { minContentHeight?: number },
) {
  return flow.sectionHeading(title, options);
}

export function drawKeyValueRows(
  flow: PdfFlow,
  rows: ReadonlyArray<readonly [unknown, unknown]>,
  options?: Parameters<PdfFlow["keyValueRows"]>[1],
) {
  return flow.keyValueRows(rows, options);
}

export function drawCard(flow: PdfFlow, options: CardOptions) {
  return flow.card(options);
}

export function drawBulletList(
  flow: PdfFlow,
  items: unknown[],
  continuationTitle?: string,
) {
  return flow.bulletList(items, continuationTitle);
}

export function drawTable(
  flow: PdfFlow,
  options: Parameters<PdfFlow["table"]>[0],
) {
  return flow.table(options);
}

export function drawContinuationHeader(flow: PdfFlow, title: string) {
  return flow.drawContinuationHeader(title);
}

function splitTextToHeight(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  maxHeight: number,
  options: {
    font: "Helvetica" | "Helvetica-Bold";
    fontSize: number;
    lineGap: number;
  },
) {
  const words = text.split(/\s+/);
  let low = 1;
  let high = words.length;
  let fit = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = words.slice(0, middle).join(" ");
    const height = measureWrappedText(doc, candidate, {
      width,
      ...options,
    });
    if (height <= maxHeight) {
      fit = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return {
    head: words.slice(0, fit).join(" "),
    tail: words.slice(fit).join(" "),
  };
}

function shortDisplayText(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 3)}...`;
}
