import assert from "node:assert/strict";
import test from "node:test";

import { ConsultantPipelineError } from "@/lib/ai/consultant-errors";
import { mapConsultantFailure } from "@/lib/chat/consultant-error-mapping";

test("only transient provider failures use the generic temporary-failure message", () => {
  const transient = mapConsultantFailure(
    new ConsultantPipelineError({
      code: "PROVIDER_TRANSIENT",
      stage: "PROVIDER_REQUEST",
      message: "temporary",
      transient: true,
    }),
  );
  const context = mapConsultantFailure(
    new ConsultantPipelineError({
      code: "CONTEXT_FAILURE",
      stage: "COMPETITOR_CONTEXT_BUILD",
      message: "context",
    }),
  );
  const persistence = mapConsultantFailure(
    new ConsultantPipelineError({
      code: "MESSAGE_PERSISTENCE_FAILURE",
      stage: "MESSAGE_PERSISTENCE",
      message: "persistence",
    }),
  );

  assert.equal(transient.errorCode, "PROVIDER_UNAVAILABLE");
  assert.match(transient.error, /could not respond right now/i);
  assert.equal(context.errorCode, "CONTEXT_UNAVAILABLE");
  assert.doesNotMatch(context.error, /could not respond right now/i);
  assert.equal(persistence.errorCode, "MESSAGE_PERSISTENCE");
  assert.doesNotMatch(persistence.error, /could not respond right now/i);
});
