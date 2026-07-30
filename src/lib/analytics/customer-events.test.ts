import assert from "node:assert/strict";
import test from "node:test";

import {
  isCustomerEventName,
  isCustomerEventSurface,
} from "@/lib/analytics/customer-events";

test("customer event validation accepts only the documented non-sensitive values", () => {
  assert.equal(isCustomerEventName("task_started"), true);
  assert.equal(isCustomerEventName("business_name:Acme"), false);
  assert.equal(isCustomerEventName(""), false);
  assert.equal(isCustomerEventSurface("business_overview"), true);
  assert.equal(isCustomerEventSurface("/dashboard/businesses/private-id"), false);
});
