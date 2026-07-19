import assert from "node:assert/strict";
import test from "node:test";

import { safeCsvCell } from "@/lib/partners/payout-csv";

test("payout CSV neutralizes spreadsheet formulas and escapes quotes", () => {
  assert.equal(safeCsvCell("=HYPERLINK(\"bad\")"), '"\'=HYPERLINK(""bad"")"');
  assert.equal(safeCsvCell("Normal Partner"), '"Normal Partner"');
});
