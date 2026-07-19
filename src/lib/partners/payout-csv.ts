export function safeCsvCell(value: unknown) {
  const raw = String(value ?? "");
  const protectedValue = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}
