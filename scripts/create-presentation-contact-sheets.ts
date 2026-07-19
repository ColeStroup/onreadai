import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createCanvas, loadImage } from "@napi-rs/canvas";

const projects = ["desktop-1366", "desktop-1920", "mobile-portrait"];

async function main() {
  const outputs = [];
  for (const project of projects) {
    const directory = path.resolve(".artifacts", "presentation", project);
    const entries = (await readdir(directory))
      .filter((entry) => /^slide-\d+\.png$/i.test(entry))
      .sort();
    if (entries.length === 0) {
      throw new Error(`No slide captures found for ${project}.`);
    }
    const images = await Promise.all(
      entries.map((entry) => loadImage(path.join(directory, entry))),
    );
    const portrait = images[0].height > images[0].width;
    const columns = portrait ? 4 : 3;
    const cellWidth = portrait ? 210 : 420;
    const imageHeight = Math.round(
      cellWidth * (images[0].height / images[0].width),
    );
    const labelHeight = 30;
    const gap = 16;
    const cellHeight = imageHeight + labelHeight;
    const rows = Math.ceil(images.length / columns);
    const canvas = createCanvas(
      columns * cellWidth + (columns + 1) * gap,
      rows * cellHeight + (rows + 1) * gap,
    );
    const context = canvas.getContext("2d");
    context.fillStyle = "#e9edf2";
    context.fillRect(0, 0, canvas.width, canvas.height);

    images.forEach((image, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = gap + column * (cellWidth + gap);
      const y = gap + row * (cellHeight + gap);
      context.fillStyle = "#ffffff";
      context.fillRect(x, y, cellWidth, cellHeight);
      context.drawImage(image, x, y, cellWidth, imageHeight);
      context.fillStyle = "#334155";
      context.font = "14px Arial";
      context.fillText(`Slide ${index + 1}`, x + 10, y + imageHeight + 20);
    });

    const outputPath = path.join(directory, "contact-sheet.png");
    await mkdir(directory, { recursive: true });
    await writeFile(outputPath, canvas.toBuffer("image/png"));
    outputs.push({ project, slides: images.length, outputPath });
  }

  console.log(JSON.stringify(outputs, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
