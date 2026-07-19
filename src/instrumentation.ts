import type { Instrumentation } from "next";

import { logError } from "@/lib/observability/log";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateEnvironment } = await import("@/lib/config/environment");
  validateEnvironment();
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  logError("next_request_failed", error, {
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
    router: context.routerKind,
  });
};
