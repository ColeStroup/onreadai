# Authentication

Onread uses the existing Auth.js JWT session flow for credentials and Google
OAuth. Email verification and password recovery are supporting services, not a
second authentication system.

## Credentials compatibility

- New password accounts set `emailVerificationRequiredAt` and remain restricted
  until `emailVerified` is set by a valid one-time code.
- Users created before migration `20260717193107_authentication_experience_v2`
  retain `emailVerificationRequiredAt = null`. A historic null
  `emailVerified` value does not lock out a legacy customer, administrator, or
  partner.
- A restricted JWT can access verification and sign-out only. Shared server-side
  authorization redirects all protected UI and rejects protected API access.
- Google sign-in skips the code only when Google provides verified-email
  evidence. Auth.js safe account-linking defaults remain enabled.

## Verification policy

- Six numeric digits generated with `crypto.randomInt`
- HMAC-SHA256 at rest using `EMAIL_VERIFICATION_SECRET`
- 10-minute expiry and single use
- Five wrong attempts per code and ten attempts per hour per account
- 60-second resend cooldown, five sends per hour, and ten sends per day
- A replacement invalidates previous active codes

The signed pending-verification cookie is HttpOnly, SameSite=Lax, Secure in
production, and expires after one hour. It contains no code or password.

## Password recovery

Reset links use a random 32-byte opaque token. Only a purpose-separated
HMAC-SHA256 digest is stored. Links expire after 30 minutes and are single-use.
A successful reset increments `User.sessionVersion`, invalidating JWT sessions,
and removes any database sessions.

## Production configuration

Set `NEXT_PUBLIC_APP_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `RESEND_API_KEY`,
`EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`, `EMAIL_REPLY_TO`,
`EMAIL_VERIFICATION_SECRET`, and `PASSWORD_RESET_SECRET`. The two HMAC secrets
must be separate random values of at least 32 characters. Missing secrets fail
closed in production; development uses explicit local-only fallback secrets and
email delivery still reports failure when Resend is unavailable.
