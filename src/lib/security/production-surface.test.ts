import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("development billing mutation and raw audit debug route are absent", () => {
  assert.equal(
    existsSync(join(root, "src/app/dashboard/billing/actions.ts")),
    false,
  );
  assert.equal(
    existsSync(
      join(
        root,
        "src/app/dashboard/businesses/[businessId]/audits/[auditId]/debug/page.tsx",
      ),
    ),
    false,
  );

  const billingPage = readFileSync(
    join(root, "src/app/dashboard/billing/page.tsx"),
    "utf8",
  );
  assert.doesNotMatch(billingPage, /Dev-only Plan Switcher|updateDevelopmentPlan/);
});

test("production discovery and chat do not ship fabricated fallback modules", () => {
  assert.equal(
    existsSync(join(root, "src/lib/discovery/mock-discovery.ts")),
    false,
  );
  assert.equal(
    existsSync(join(root, "src/lib/discovery/mock-competitor-discovery.ts")),
    false,
  );
  assert.equal(
    existsSync(join(root, "src/lib/chat/mock-consultant.ts")),
    false,
  );
});
