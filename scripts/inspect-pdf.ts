import { readFile } from "node:fs/promises";
import path from "node:path";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

async function main() {
  const inputPath = path.resolve(process.argv[2] ?? "");
  if (!process.argv[2]) {
    throw new Error("Usage: npm run report:inspect -- <report.pdf>");
  }
  const bytes = new Uint8Array(await readFile(inputPath));
  const pdf = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  const pages: Array<{
    page: number;
    characters: number;
    firstLines: string[];
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }> = [];
  let fullText = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items.filter(
      (item): item is (typeof content.items)[number] & {
        str: string;
        transform: number[];
        width: number;
        height: number;
      } => "str" in item && Boolean(item.str.trim()),
    );
    const text = items.map((item) => item.str).join(" ");
    fullText += `${text}\n`;
    pages.push({
      page: pageNumber,
      characters: text.length,
      firstLines: items.slice(0, 8).map((item) => item.str),
      minX: Math.min(...items.map((item) => item.transform[4])),
      maxX: Math.max(...items.map((item) => item.transform[4] + item.width)),
      minY: Math.min(...items.map((item) => item.transform[5])),
      maxY: Math.max(...items.map((item) => item.transform[5] + item.height)),
    });
  }

  const unsupported = [
    "Discord",
    "gaming audience",
    "SaaS",
    "developer community",
    "free trial",
    "software demo",
    "content cadence",
    "Future analysis can compare",
  ].filter((term) => fullText.toLowerCase().includes(term.toLowerCase()));
  const unsupportedContexts = unsupported.map((term) => {
    const index = fullText.toLowerCase().indexOf(term.toLowerCase());
    return {
      term,
      context: fullText
        .slice(Math.max(0, index - 90), index + term.length + 90)
        .replace(/\s+/g, " "),
    };
  });
  const boundaryViolations = pages.filter(
    (page) =>
      page.minX < 53 || page.maxX > 559 || page.minY < 25 || page.maxY > 750,
  );
  const sparsePages = pages.filter(
    (page) => page.page > 1 && page.characters < 220,
  );

  console.log(
    JSON.stringify(
      {
        pages: pdf.numPages,
        pageDetails: pages,
        unsupported,
        unsupportedContexts,
        boundaryViolations,
        sparsePages,
        hasReplacementCharacter:
          fullText.includes("ï¿½") || fullText.includes("\ufffd"),
        hasUnsupportedControlCharacters:
          /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(
            fullText,
          ),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
