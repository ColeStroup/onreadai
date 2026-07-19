export type AuthFieldErrors = Partial<
  Record<"name" | "email" | "password" | "passwordConfirmation" | "code", string>
>;

export function normalizeEmail(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return (
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

export function passwordValidationMessage(password: string) {
  if (password.length < 8) return "Use at least 8 characters.";
  if (Buffer.byteLength(password, "utf8") > 72) {
    return "Use a password no longer than 72 bytes.";
  }
  return null;
}

export function validateSignupForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(
    formData.get("passwordConfirmation") ?? "",
  );
  const fieldErrors: AuthFieldErrors = {};

  if (name.length < 2 || name.length > 80) {
    fieldErrors.name = "Enter your full name (2-80 characters).";
  }
  if (!isValidEmail(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }
  const passwordError = passwordValidationMessage(password);
  if (passwordError) fieldErrors.password = passwordError;
  if (password !== passwordConfirmation) {
    fieldErrors.passwordConfirmation = "Passwords do not match.";
  }

  return {
    values: { name, email, password, passwordConfirmation },
    fieldErrors,
    valid: Object.keys(fieldErrors).length === 0,
  };
}
