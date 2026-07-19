const mojibakeReplacements: Array<[RegExp, string]> = [
  [/â€™|â€˜|Ã¢â‚¬â„¢/g, "'"],
  [/â€œ|â€|Ã¢â‚¬Å“|Ã¢â‚¬Â/g, '"'],
  [/â€“|â€”|Ã¢â‚¬â€œ|Ã¢â‚¬â€/g, "-"],
  [/â€¦|Ã¢â‚¬Â¦/g, "..."],
  [/Â /g, " "],
  [/\u00c2\u00b7/g, "\u00b7"],
  [/\u00c2\u00a0/g, " "],
  [/\u00e2\u20ac[\u0098\u0099]/g, "'"],
  [/\u00e2\u20ac[\u009c\u009d\u0153]/g, '"'],
  [/\u00e2\u20ac[\u0093\u0094\u201c]/g, "-"],
  [/\u00e2\u20ac\u00a6/g, "..."],
  [/\u00c3\u02dc<\u00c3\u0178/g, ""],
];

export function cleanReportCopy(value: unknown) {
  let text = value == null ? "" : String(value);
  const protectedUrls: string[] = [];

  text = text.replace(/\bhttps?:\/\/[^\s<>"']+/gi, (url) => {
    const token = `REPORTURLTOKEN${protectedUrls.length}END`;
    protectedUrls.push(url);
    return token;
  });

  text = text
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])(?=[.!?])/g, "")
    .replace(/([!?])\1+/g, "$1")
    .replace(/(?<!\.)\.\.(?!\.)/g, ".")
    .replace(/\.{4,}/g, "...")
    .replace(/([!?])\./g, "$1")
    .trim();

  for (const [index, url] of protectedUrls.entries()) {
    text = text.replace(`REPORTURLTOKEN${index}END`, url);
  }

  return text;
}

/** Keeps dynamic PDF text within PDFKit's built-in Helvetica character set. */
export function sanitizePdfText(value: unknown) {
  let text = cleanReportCopy(value).normalize("NFC");

  for (const [pattern, replacement] of mojibakeReplacements) {
    text = text.replace(pattern, replacement);
  }

  text = text
    .replace(/[\u00ad\u200b\u200c\u200d\u2060\ufeff]/g, "")
    .replace(/[\ufffc\ufffd]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/[\ufe0e\ufe0f\u20e3]/g, "")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\u00a0-\u00ff]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();

  return cleanReportCopy(text);
}
