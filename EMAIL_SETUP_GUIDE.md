# Email Setup Guide (NVM Backend + Render + Brevo)

## 1) Render environment variables
Use your backend environment file:
- Local backend: `nvm-marketplace-backend/.env`
- Never commit real secrets to git.

Add these variables:

```env
EMAIL_PROVIDER=BREVO_API
BREVO_API_KEY=your-brevo-api-key

# Optional SMTP fallback
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-smtp-login
SMTP_PASS=your-smtp-password
SMTP_FROM_NAME=NextWave Digital
SMTP_FROM_EMAIL=your_verified_sender@domain.com
APP_BASE_URL=https://nvm-frontend.vercel.app
SUPPORT_EMAIL=support@your-domain.com
EMAIL_DEBUG_ENABLED=false
EMAIL_DEBUG_TOKEN=your-debug-token
```

On Render: `Service -> Environment -> Add Environment Variable -> Save -> Manual Deploy`.

## 2) Local run
1. Create/update `nvm-marketplace-backend/.env`.
2. Install deps: `npm install`
3. Start backend: `npm run dev`
4. Send a test email from script:
   - `npm run email:test -- you@example.com email_verification`

## 3) API test endpoints (admin only)
- `GET /api/emails/templates`
- `POST /api/emails/test`
- `POST /api/emails/test/verification`
- `GET /debug/send-test-email?to=you@example.com&token=your-debug-token` (only if `EMAIL_DEBUG_ENABLED=true`)

Example payload:

```json
{
  "to": "you@example.com",
  "templateName": "order_confirmation",
  "variables": {
    "userName": "Test User",
    "orderId": "NVM-TEST-1001",
    "actionUrl": "https://nvm-frontend.vercel.app/orders"
  }
}
```

## 4) Security reminders
- Do not hardcode keys in source files.
- Rotate leaked credentials immediately.
- Use domain-authenticated sender addresses (SPF/DKIM/DMARC) for deliverability.
