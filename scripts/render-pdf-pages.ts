import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

async function main() {
  const inputPath = path.resolve(process.argv[2] ?? "");
  if (!process.argv[2] || path.extname(inputPath).toLowerCase() !== ".pdf") {
    throw new Error("Usage: npm run report:render -- <report.pdf>");
  }

  const outputDirectory = path.join(
    path.dirname(inputPath),
    path.basename(inputPath, ".pdf"),
  );
  await mkdir(outputDirectory, { recursive: true });
  const bytes = new Uint8Array(await readFile(inputPath));
  const pdf = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  const pagePaths: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.75 });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    const context = canvas.getContext("2d");
    await page.render({
      canvas: canvas as never,
      canvasContext: context as never,
      viewport,
    }).promise;
    const pagePath = path.join(
      outputDirectory,
      `page-${String(pageNumber).padStart(2, "0")}.png`,
    );
    await writeFile(pagePath, canvas.toBuffer("image/png"));
    pagePaths.push(pagePath);
  }

  const contactSheetPath = path.join(outputDirectory, "contact-sheet.png");
  await writeContactSheet(pagePaths, contactSheetPath);
  console.log(
    JSON.stringify(
      {
        inputPath,
        pages: pdf.numPages,
        outputDirectory,
        contactSheetPath,
      },
      null,
      2,
    ),
  );
}

async function writeContactSheet(pagePaths: string[], outputPath: string) {
  const columns = 4;
  const cellWidth = 300;
  const cellHeight = 410;
  const gap = 18;
  const rows = Math.ceil(pagePaths.length / columns);
  const canvas = createCanvas(
    columns * cellWidth + (columns + 1) * gap,
    rows * cellHeight + (rows + 1) * gap,
  );
  const context = canvas.getContext("2d");
  context.fillStyle = "#e9edf2";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (const [index, pagePath] of pagePaths.entries()) {
    const image = await loadImage(pagePath);
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = gap + column * (cellWidth + gap);
    const y = gap + row * (cellHeight + gap);
    const scale = Math.min(
      cellWidth / image.width,
      (cellHeight - 24) / image.height,
    );
    const width = image.width * scale;
    const height = image.height * scale;
    context.fillStyle = "#ffffff";
    context.fillRect(x, y, cellWidth, cellHeight);
    context.drawImage(
      image,
      x + (cellWidth - width) / 2,
      y + 6,
      width,
      height,
    );
    context.fillStyle = "#334155";
    context.font = "14px Arial";
    context.fillText(`Page ${index + 1}`, x + 10, y + cellHeight - 8);
  }

  await writeFile(outputPath, canvas.toBuffer("image/png"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
