import "server-only";

export function getAuthAppOrigin() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");

  if (!configured) {
    throw new Error("NEXT_PUBLIC_APP_URL is required for authentication emails.");
  }

  const url = new URL(configured);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("The application URL must use HTTP or HTTPS.");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("The production application URL must use HTTPS.");
  }

  return url.origin;
}
