import "server-only";

const minimumProductionSecretLength = 32;

function authSecret(
  environmentName: "EMAIL_VERIFICATION_SECRET" | "PASSWORD_RESET_SECRET",
  developmentFallback: string,
) {
  const configured = process.env[environmentName]?.trim();

  if (configured && configured.length >= minimumProductionSecretLength) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `${environmentName} must be configured with at least ${minimumProductionSecretLength} characters.`,
    );
  }

  return configured || developmentFallback;
}

export function getEmailVerificationSecret() {
  return authSecret(
    "EMAIL_VERIFICATION_SECRET",
    "development-only-email-verification-secret-v1",
  );
}

export function getPasswordResetSecret() {
  return authSecret(
    "PASSWORD_RESET_SECRET",
    "development-only-password-reset-secret-v1",
  );
}
