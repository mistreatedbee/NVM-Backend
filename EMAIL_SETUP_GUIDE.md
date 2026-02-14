# Email Setup Guide (NVM Backend)

## 1) Where to paste SMTP credentials
Use your backend environment file:
- Local backend: `nvm-marketplace-backend/.env`
- Never commit real secrets to git.

Add these variables:

```env
EMAIL_PROVIDER=SMTP
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-smtp-login
SMTP_PASS=your-smtp-password
SMTP_FROM_NAME=NVM Marketplace
SMTP_FROM_EMAIL=no-reply@your-domain.com
APP_BASE_URL=http://localhost:5173
SUPPORT_EMAIL=support@your-domain.com
```

## 2) Optional provider API keys (if not SMTP)
Set `EMAIL_PROVIDER` and matching key(s):

```env
EMAIL_PROVIDER=SENDGRID
SENDGRID_API_KEY=...
```

```env
EMAIL_PROVIDER=MAILGUN
MAILGUN_API_KEY=...
MAILGUN_DOMAIN=mg.your-domain.com
```

```env
EMAIL_PROVIDER=RESEND
RESEND_API_KEY=...
```

## 3) Local run
1. Create/update `nvm-marketplace-backend/.env`.
2. Install deps: `npm install`
3. Start backend: `npm run dev`
4. Send a test email from script:
   - `npm run email:test -- you@example.com email_verification`

## 4) API test endpoints (admin only)
- `GET /api/emails/templates`
- `POST /api/emails/test`
- `POST /api/emails/test/verification`

Example payload:

```json
{
  "to": "you@example.com",
  "templateName": "order_confirmation",
  "variables": {
    "userName": "Test User",
    "orderId": "NVM-TEST-1001",
    "actionUrl": "http://localhost:5173/orders"
  }
}
```

## 5) Vercel deployment environment variables
If backend is deployed on Vercel:
1. Open Vercel project
2. Go to `Settings -> Environment Variables`
3. Add same backend variables (`EMAIL_PROVIDER`, `SMTP_*`, `APP_BASE_URL`, etc.)
4. Redeploy

If backend is hosted separately (Render/Railway/Docker VPS):
- Set the same environment variables in that platform's secret manager.
- Ensure `APP_BASE_URL` points to your deployed frontend URL.

## 6) Security reminders
- Do not hardcode keys in source files.
- Rotate leaked credentials immediately.
- Use domain-authenticated sender addresses (SPF/DKIM/DMARC) for deliverability.
