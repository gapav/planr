# Interest requests

The public `/velkommen#interesse` form posts to `/api/interest`; no login is required.
It sends one notification through the existing Resend integration, with the coach
as Reply-To. It does not create an account, send an invitation, or add a subscriber.

## Server configuration

- `RESEND_API_KEY` and `RESEND_FROM`: existing verified email sender configuration.
- `GREP_INTEREST_TO`: optional recipient override. Defaults to the owner's explicitly
  requested `gardpavels@gmail.com`. Never expose these variables with `NEXT_PUBLIC_`.

The same email variables must be configured in the target deployment environment.
No database changes or new dependencies are needed. A success response means the
email provider accepted the request, not that inbox delivery has been confirmed.
Provider failures return an error and the form preserves the entered details.

## Abuse and privacy

Same-origin POSTs only; JSON and 8 KiB streamed body limit; server-side field
validation and HTML escaping; fixed notification recipient; honeypot; process-local
hourly caps (5/IP, 3/email, 50 total). IPs/email addresses are HMAC-hashed for these
short-lived counters and form payloads are not logged or stored in the app database.
Resend idempotency keys prevent identical notifications being duplicated for 24 hours.

The in-memory limiter is best-effort, not a distributed abuse guarantee. Before
promoting the page at scale, configure a hosting/WAF rate limit for POST `/api/interest`
or replace the limiter with shared storage. Only trust IP headers from the hosting proxy.
Notifications remain in the owner's mailbox and are subject to the email provider's
retention; the form tells coaches not to include player information.

Tests mock the provider and do not send real emails. For delivery verification, submit
one clearly labelled test request through the page and check the destination inbox.
