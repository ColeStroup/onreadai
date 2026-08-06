import assert from "node:assert/strict";
import test from "node:test";

import { scopeAuditFindingIdentities } from "@/lib/audits/audit-finding-identity";

test("reusable finding keys receive different database IDs in different audits", () => {
  const finding = { id: "aif_reusable-finding", title: "Shared finding" };
  const first = scopeAuditFindingIdentities("audit-one", [finding]);
  const second = scopeAuditFindingIdentities("audit-two", [finding]);

  assert.notEqual(first[0]?.id, finding.id);
  assert.notEqual(first[0]?.id, second[0]?.id);
  assert.match(first[0]?.id ?? "", /^af_[a-f0-9]{24}$/);
});

test("finding database IDs remain deterministic when the same audit is retried", () => {
  const findings = [
    { id: "aif_first", title: "First" },
    { id: "aif_second", title: "Second" },
  ];

  assert.deepEqual(
    scopeAuditFindingIdentities("audit-retry", findings),
    scopeAuditFindingIdentities("audit-retry", findings),
  );
});

test("duplicate source finding keys cannot collide within one audit", () => {
  const scoped = scopeAuditFindingIdentities("audit-duplicate", [
    { id: "aif_duplicate", title: "First occurrence" },
    { id: "aif_duplicate", title: "Second occurrence" },
  ]);

  assert.equal(new Set(scoped.map((finding) => finding.id)).size, 2);
});
