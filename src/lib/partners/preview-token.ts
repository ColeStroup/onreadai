import { createHash } from "node:crypto";

export function hashPreviewToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
