# Password Reset Flow

## Required Environment Variables

- `FRONTEND_URL` or `APP_BASE_URL` (for reset links)
- `RESET_PASSWORD_EXPIRE_MINUTES` (default `30`, clamped to `15-60`)
- `RESET_PASSWORD_TOKEN_BYTES` (default `32`)
- SMTP/Brevo config used by existing email service:
  - `BREVO_API_KEY` or
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`

## API Endpoints

- `POST /api/auth/forgot-password`
  - Body: `{ "email": "user@example.com" }`
  - Always returns `200` with:
  - `If an account exists for that email, we sent a reset link.`

- `POST /api/auth/validate-reset-token`
  - Body: `{ "email": "user@example.com", "token": "<rawToken>" }`
  - Returns `200` valid true, or `400` invalid/expired.

- `POST /api/auth/reset-password`
  - Body: `{ "email": "user@example.com", "token": "<rawToken>", "newPassword": "Abcdef12", "confirmPassword": "Abcdef12" }`
  - Success: `200`, `Password updated successfully.`
  - Failure: `400`, `Reset link is invalid or expired.`

## Security Behavior

- Forgot password response is generic (no account enumeration).
- Reset token is generated with cryptographic randomness.
- Only token hash is stored (`resetPasswordTokenHash`).
- Token is single-use (`resetPasswordUsedAt` set on success).
- Token has expiry (`resetPasswordTokenExpiresAt`).
- Route abuse controls:
  - forgot-password: IP and email throttling
  - reset-password: IP and credential-key throttling
- Activity logs:
  - `PASSWORD_RESET_REQUESTED`
  - `PASSWORD_RESET_COMPLETED`

## End-to-End Verification

1. Submit forgot-password with existing email and non-existing email; verify same `200` response message.
2. Open reset link from email and reset password with strong password.
3. Try to reuse same link/token; expect `400` invalid/expired.
4. Try random/wrong token; expect `400` invalid/expired.
5. Wait past expiry; expect invalid/expired.
6. Spam forgot/reset endpoints to confirm rate limits.
7. Confirm reset email URL points to production frontend domain over HTTPS.
