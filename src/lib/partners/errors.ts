export class PartnerProgramError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "PartnerProgramError";
  }
}

export function partnerErrorMessage(error: unknown) {
  return error instanceof PartnerProgramError
    ? error.message
    : "The partner request could not be completed.";
}
