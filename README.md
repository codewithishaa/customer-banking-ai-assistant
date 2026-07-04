# PayPathIQ Account Self-Service Chatbot

## Live Application

Deployed application:

https://paypathiq-debtor-portal-isha.vercel.app/

## Overview

This project extends the provided starter application into an account self-service chatbot for an overdue receivables account. The chatbot allows the account holder to read and update account information, manage related people, create promises to pay, make mocked payments, view transactions, book future call appointments, and receive secure account-change notifications.

The implementation focuses on safe server-side behaviour. User messages are parsed into structured actions, validated, persisted in Supabase, and followed by a notification attempt when account data changes.

The main seeded account is Jane Murphy for Example Energy Ireland.

## Features Implemented

- Account lookup for name, email, phone number, postal address, preferred contact method, balance, related people, promises to pay, transactions, and future call appointments.
- Account holder updates for name, email address, phone number, and postal address.
- Preferred contact method read/update with supported values: `email`, `sms`, and `phone`.
- Related person add, read, update, and remove workflows.
- Missing and ambiguous related-person details handled safely.
- One-time promises to pay.
- Mocked payments only; no Stripe or real payment provider.
- Persisted balance deduction after mocked payment.
- Transaction history including seeded transactions and mocked payments.
- Future call appointment booking.
- Rejection of clearly past call appointment requests.
- Safe fallback response for unrelated, unsupported, or unclear chatbot messages.
- Specific missing-detail guidance for incomplete account update, related-person, payment, promise-to-pay, and call-booking requests.
- Read-only shorthand support for related people, transactions, payments, and booked calls.
- Resend notification email after successful account-changing actions.
- Encrypted PDF attachment containing sensitive account details.
- Notification attempt tracking in Supabase.
- Optional LLM-based parsing support with deterministic fallback parsing.
- Tests for core decision/action logic and notification safety.

## Local Setup

Install dependencies:

```bash
pnpm i
```

Run the development server:

```bash
pnpm dev
```

Open:

```bash
http://localhost:3000
```

Useful checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Environment Variables

Create `.env.local` from `.env.local.example` and configure the following values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key

RESEND_API_KEY=re_your_api_key
NOTIFICATION_FROM_EMAIL=Account Portal <notifications@ishaborgaonkar.com>

# Optional LLM providers
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
OPENROUTER_API_KEY=sk-or-your-openrouter-key
```

Production email delivery is configured through Resend using the verified sender domain `ishaborgaonkar.com`. The sender is configured through `NOTIFICATION_FROM_EMAIL`, for example:

```bash
Account Portal <notifications@ishaborgaonkar.com>
```

Do not commit real API keys, Resend keys, Supabase service-role keys, or generated PDF passwords.

## Email Testing Note

To test the Resend email notification and encrypted PDF attachment in the deployed application, set the account holder email address to a current personal working email address that you can access. After any successful account-changing action, the app sends a generic notification email to the current account holder email address with the encrypted PDF attached.

Because the application uses a newly verified sending domain and password-protected PDF attachments, the notification email may occasionally appear in Spam or Promotions. When testing, please check the inbox, spam, and promotions folders.

## Architecture Overview

The system follows a server-side action pipeline:

```text
Chat UI
  ↓
/api/chat
  ↓
Message parser
  ↓
Validation layer
  ↓
Action executor
  ↓
Supabase persistence
  ↓
Notification boundary
  ↓
Encrypted PDF generator
  ↓
Resend email delivery
```

The frontend keeps the original starter dashboard and chat experience. The backend route handles message parsing, validation, database writes, mocked payments, appointments, and notification side effects.

See [`architecture-diagram.md`](./architecture-diagram.md) for the architecture diagram.

## Database Model

The Supabase schema stores account state in these main tables:

- `account_holders` — account holder profile, contact details, preferred contact method, and current balance.
- `related_people` — people linked to the account, including phone, email, relationship, and authorization status.
- `promises_to_pay` — one-time promised payments with amount, due date, and status.
- `transactions` — seeded transactions and mocked payments created through chat.
- `call_appointments` — future phone call appointments with date, time, phone number, and reason.
- `notification_attempts` — notification delivery attempts after successful account-changing actions.

## Chat Action Flow

The chatbot receives a natural-language message through the chat UI and sends it to `/api/chat`.

The server then:

1. Parses the message into a structured action.
2. Extracts relevant fields such as amount, date, email, phone number, name, or address.
3. Validates the action and fields.
4. Rejects invalid or unsafe requests without writing to the database.
5. Applies valid account changes to Supabase.
6. Creates a notification attempt for successful account-changing actions.
7. Sends a generic email with an encrypted PDF attachment through Resend.
8. Returns a clear confirmation or safe fallback response to the user.

Read-only actions do not create notification attempts. Invalid or rejected actions do not update Supabase and do not send notifications.

## Message Parsing and LLM Fallback

The parser uses a hybrid design. It supports optional LLM-based structured extraction when a real provider key is configured, but all required challenge workflows are covered by a deterministic fallback parser.

This keeps the system reliable, testable, and safe when LLM keys are missing. Every parsed action passes through explicit validation before database writes.

For unsupported, unrelated, unclear, or incomplete requests, the chatbot returns a safe guidance response instead of guessing or performing risky account changes. These fallback and missing-detail responses do not update Supabase, do not create notification attempts, and do not send email/PDF notifications.

Where possible, the bot gives the user an example format, such as how to update an address, add a related person, make a mocked payment, create a promise to pay, or book a future call.

The supported action set is intentionally limited to account lookup, contact updates, related people, promises to pay, mocked payments, transactions, call appointments, and notifications.

## Validation Strategy

Before any database write, the server validates the parsed action and fields.

Validation includes:

- Invalid email addresses are rejected.
- Empty or invalid names are rejected.
- Unsupported preferred contact methods are rejected.
- Only `email`, `sms`, and `phone` are accepted as preferred contact methods.
- Missing related-person details are requested instead of guessed.
- Ambiguous related-person matches ask for clarification.
- Past call appointments are rejected.
- Invalid actions do not write to Supabase.
- Invalid actions do not create notification attempts.

## Account Holder Updates

The chatbot supports reading and updating:

- Name
- Email address
- Phone number
- Postal address
- Preferred contact method

After a successful update, the changed account data is persisted in Supabase and a notification attempt is created.

## Related People

The chatbot supports related-person workflows:

- Add a related person.
- Capture name, email address, phone number, and authorization status.
- Read active related people.
- Update related-person contact details.
- Remove or deactivate a related person.
- Ask for missing details where required.
- Handle ambiguous duplicate names safely.

## Promise to Pay

The system supports one-time promises to pay.

The chatbot captures:

- Amount
- Future due date
- Status

The promise is stored in Supabase and can be listed later through chat.

Recurring payment plans are intentionally not included because they are outside the challenge scope.

## Mocked Payment Design

Payments are mocked only. The application does not integrate Stripe or any real payment provider.

When a user asks to pay, the system:

1. Records a mocked payment transaction.
2. Marks the transaction as completed.
3. Deducts the amount from the persisted account balance.
4. Returns a confirmation to the user.
5. Creates a notification attempt.

The transaction history includes both seeded transactions and mocked payments created through chat.

## Transactions

The chatbot can list previous transactions, including:

- Seeded fixture transactions.
- New mocked payments created during chat.
- Date.
- Amount.
- Type.
- Status.
- Description.

## Call Appointments

The chatbot can book future phone calls with an agent.

The system captures:

- Date
- Time
- Phone number
- Short reason where possible

Clearly past appointment requests are rejected. Future call appointments can be listed through chat.

## Notifications and Encrypted PDF

Whenever the chatbot successfully changes persisted account data, it creates a notification attempt and sends a generic notification email using Resend.

Sensitive account details are not included in the email body. Instead, the details are placed in an encrypted PDF attachment.

The email explains that the PDF can be opened using the last 4 digits of the account holder phone number, but it does not include the actual password digits.

The encrypted PDF includes:

- Account summary
- Related people, if any
- Transactions
- Current contact details
- Preferred contact method
- Promises to pay
- Future call appointments
- Current balance

The PDF password is generated from the last 4 digits of the current account holder phone number.

For local development, if Resend credentials are missing, the system safely logs the notification attempt instead of sending a live email.

## Email Delivery Note

Because this challenge uses a newly verified sending domain and password-protected PDF attachments, notification emails may occasionally appear in Spam or Promotions. If testing with a personal email address, please check the inbox, spam, and promotions folders.

## Tests

The test suite includes 62 passing tests covering:

- Parser/action logic
- Account lookups
- Validation
- Related people workflows
- Mocked payments
- Transaction updates
- Call appointments
- Unsupported and incomplete message fallback behaviour
- Notification boundary behaviour
- PDF/email safety
- LLM fallback behaviour

Tests mock external side effects and do not depend on live Resend delivery, real inbox inspection, live LLM APIs, or real payment providers.

Run tests with:

```bash
pnpm test
```

## Design Note

This implementation keeps the starter UI and extends the server-side behaviour around a clear action pipeline. The main design choice is to keep account changes deterministic and inspectable: free-text messages are parsed into structured actions, validated, and only then applied to Supabase. This reduces the risk of unsafe account mutations.

Supabase is used as the source of truth for account holders, related people, promises to pay, transactions, call appointments, and notification attempts. This ensures changed data survives refreshes and gives reviewers a clear audit trail of what changed.

The parser uses a hybrid approach. Optional LLM-based structured extraction can be configured, but the required challenge workflows are covered by deterministic fallback parsing. This makes the app reliable in local tests and safe when LLM keys are missing. The LLM, if configured, is not trusted to directly mutate data; every action still passes through validation and business logic.

Payment handling is intentionally mocked. No real provider such as Stripe is integrated. A payment creates a completed transaction and deducts the amount from the persisted balance.

For notifications, the email body stays generic and sensitive details are placed inside a password-protected PDF. The password is derived from the last 4 digits of the account holder phone number. Resend is used in production with the verified sender domain `ishaborgaonkar.com`.

The main tradeoffs are scope-related. The system focuses on the single seeded Jane Murphy account, does not add authentication, does not include an admin dashboard, and does not implement recurring payment plans because those are outside the challenge scope. The interface was tested primarily on desktop browsers for the challenge workflow. Mobile responsiveness and broader cross-device QA would be part of a future iteration.

## Assumptions and Tradeoffs

- The implementation focuses on the single seeded Jane Murphy account from the starter fixture.
- Payments are mocked only; no card processor or real payment provider is integrated.
- The app does not add authentication, an admin dashboard, recurring payment plans, or a production collections workflow because those are outside the challenge scope.
- A deterministic fallback parser is used for reliability and testability, with optional LLM parsing supported when configured.
- Sensitive account details are kept out of the email body and placed in the encrypted PDF attachment.
- The interface was tested primarily on desktop browsers for the challenge workflow. Mobile responsiveness and broader cross-device QA would be part of a future iteration.

## Future Improvements and Monitoring

- Add structured audit logs for each parsed intent, validation result, database mutation, and notification attempt.
- Monitor the `notification_attempts` table for failed Resend deliveries and alert when failures exceed a threshold.
- Add retry handling for failed email/PDF notifications.
- Add email deliverability monitoring for the verified sending domain.
- Add richer natural-language and date parsing for more varied customer messages.
- Add end-to-end tests against a staging deployment.
- Add authentication and account verification before production use.
- Add multi-account support and role-based access control.
- Add an admin-safe audit view for support teams.
- Track API latency, parser fallback rate, validation failure rate, and notification success rate.

## Deployment

The application is deployed on Vercel:

https://paypathiq-debtor-portal-isha.vercel.app/

Required production environment variables are configured in Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
RESEND_API_KEY
NOTIFICATION_FROM_EMAIL
```

Optional LLM provider keys can be configured if required, but the deterministic fallback parser supports all required challenge workflows without live LLM APIs.

## Reviewer Notes

- The repository should be reviewed together with the deployed Vercel application.
- The app uses Supabase persistence, so test changes will be visible in the database.
- Valid account-changing actions create notification attempts.
- Read-only actions and invalid actions should not create notification attempts.
- Email notifications are sent using Resend from the verified domain `ishaborgaonkar.com`.
- If testing email delivery with a personal email address, please check Spam or Promotions as password-protected PDF attachments can occasionally be filtered there.