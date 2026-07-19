type SafeContextValue = string | number | boolean | null | undefined;
type SafeContext = Record<string, SafeContextValue>;

const sensitiveKeyPattern =
  /(secret|token|password|cookie|authorization|email|content|html|prompt|payload|body|key)/i;

export function logError(
  event: string,
  error: unknown,
  context: SafeContext = {},
) {
  console.error(
    JSON.stringify({
      level: "error",
      event,
      ...sanitizeContext(context),
      error: safeErrorMetadata(error),
    }),
  );
}

export function logWarn(event: string, context: SafeContext = {}) {
  console.warn(
    JSON.stringify({
      level: "warn",
      event,
      ...sanitizeContext(context),
    }),
  );
}

export function logInfo(event: string, context: SafeContext = {}) {
  console.info(
    JSON.stringify({
      level: "info",
      event,
      ...sanitizeContext(context),
    }),
  );
}

export function safeErrorMetadata(error: unknown) {
  if (!error || typeof error !== "object") return { type: typeof error };

  const record = error as Record<string, unknown>;
  return {
    name: typeof record.name === "string" ? record.name.slice(0, 80) : undefined,
    code: safeCode(record.code),
    status:
      typeof record.status === "number" && Number.isFinite(record.status)
        ? record.status
        : undefined,
    digest:
      typeof record.digest === "string" ? record.digest.slice(0, 120) : undefined,
  };
}

function sanitizeContext(context: SafeContext) {
  return Object.fromEntries(
    Object.entries(context)
      .filter(([key]) => !sensitiveKeyPattern.test(key))
      .map(([key, value]) => [key, sanitizeValue(value)]),
  );
}

function sanitizeValue(value: SafeContextValue) {
  return typeof value === "string" ? value.slice(0, 200) : value;
}

function safeCode(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  return String(value).slice(0, 80);
}
