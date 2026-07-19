export function billingConfirmationFromPersistedState(input: {
  hasPaidAccess: boolean;
}) {
  return input.hasPaidAccess ? "confirmed" : "pending";
}
