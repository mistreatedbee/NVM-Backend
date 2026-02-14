# Template Catalog

All templates return:
- `subject`
- `html`
- `text`
- `requiredVariables`

Use runtime endpoint (admin):
- `GET /api/emails/templates`

Current template names:

- `email_verification`
- `resend_verification`
- `welcome_email`
- `password_reset`
- `password_changed`
- `new_login_alert`
- `two_factor_code`
- `vendor_registration_received`
- `vendor_approved`
- `vendor_rejected`
- `account_suspended`
- `account_banned`
- `account_reinstated`
- `profile_updated`
- `account_status_update`
- `order_status_update`
- `order_confirmation`
- `new_order_received`
- `order_accepted`
- `order_shipped`
- `order_delivered`
- `order_cancelled`
- `partial_fulfillment`
- `return_request_received`
- `return_approved`
- `return_rejected`
- `refund_processed`
- `invoice_available`
- `payment_failed`
- `payment_pending`
- `payout_initiated`
- `payout_completed`
- `withdrawal_requested`
- `withdrawal_failed`
- `support_ticket_created`
- `support_ticket_updated`
- `dispute_opened`
- `dispute_resolved`
- `new_vendor_needs_approval`
- `fraud_report_alert`
- `critical_system_alert`

Legacy aliases are supported in `emails/templates/index.js` for backward compatibility.
