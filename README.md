# PayPathIQ Account Self-Service Chatbot

## Live URL
Live App URL: to be added after Vercel deployment

---

## Overview
This is an account self-service chatbot for an overdue receivables account. It lets the customer (Jane Murphy) read and update account information, manage related people, create promises to pay, make mocked payments, view transactions, book calls, and receive secure account-change notifications.

---

## Setup Instructions
1. **Install dependencies**:
   ```bash
   pnpm i
   ```
2. **Setup environment variables**:
   * Copy the env template file:
     ```bash
     cp .env.local.example .env.local
     ```
   * Populate `.env.local` with your Supabase and Resend keys (see below).
3. **Supabase Setup & Migration**:
   * Run the SQL migration file located at `supabase/migrations/20260630123000_account_chat_starter.sql` in your Supabase project editor to create the database schema and automatically seed the standard account **Jane Murphy** (`acc_standard_001`).
4. **Run development server**:
   ```bash
   pnpm dev
   ```
5. **Resend Setup**:
   * Configure a domain in Resend to send transaction emails.
6. **Vercel Deployment**:
   * Connect your repository to Vercel, set your environment variables, and trigger the deployment.

---

## Environment Variables
The following environment variables are supported in `.env.local`:
* `NEXT_PUBLIC_SUPABASE_URL`
* `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
* `SUPABASE_SERVICE_ROLE_KEY`
* `RESEND_API_KEY`
* `NOTIFICATION_FROM_EMAIL`
* `OPENAI_API_KEY` (optional)
* `ANTHROPIC_API_KEY` (optional)
* `OPENROUTER_API_KEY` (optional)
* `GEMINI_API_KEY` (optional)

> [!NOTE]
> Production email delivery is configured through Resend using the verified sender domain **ishaborgaonkar.com**, for example:
> `Account Portal <notifications@ishaborgaonkar.com>`

---

## Commands
* Run development server: `pnpm dev`
* Run ESLint code checks: `pnpm lint`
* Run TypeScript compiler checks: `pnpm typecheck`
* Run test suite: `pnpm test`
* Run production compiler build: `pnpm build`

---

## Design Note

### 1. Architecture Overview
The application flows cleanly across the following boundary layers:
* **Chat UI** → `/api/chat` → **Parser** → **Validation** → **Action Executor** → **Supabase** → **Notification Boundary** → **PDF Generator** → **Resend**
* A detailed diagram is provided in [architecture-diagram.md](file:///d:/paypathiq-debtor-portal-isha/architecture-diagram.md).

### 2. Database Model Summary
The data model consists of these Supabase database tables:
* `account_holders`: Stores the profile information, contact preferences, and current outstanding balance.
* `related_people`: Stores representatives authorized to speak or act for the account holder.
* `promises_to_pay`: Tracks promises to resolve balances by a specified due date.
* `transactions`: Log of charges, fees, and payments.
* `call_appointments`: Tracks scheduled phone calls.
* `notification_attempts`: Audits email trigger summaries and delivery statuses.

### 3. Chat Action Flow
Customer text messages are processed through `/api/chat`. The handler:
1. Fetches current account context from Supabase.
2. Parses text using the hybrid parser to extract the `action` and `fields`.
3. Validates business constraints.
4. Executes database modifications (if valid).
5. Dispatches a confirmation notification and returns the updated context so the UI dashboard updates instantly.

### 4. Validation Strategy
To safeguard data integrity, the system applies server-side checks:
* **Invalid email**: Rejects updates unless they contain `@` and `.`.
* **Invalid contact method**: Restricts preferences to `email`, `sms`, or `phone`. WhatsApp and other types are rejected.
* **Missing related person details**: Refuses updates and explicitly prompts for the missing name, phone, or email instead of guessing.
* **Ambiguous duplicate names**: If duplicate representative names exist, the chatbot halts removal and asks for their email.
* **Past call rejection**: Refuses booking call requests scheduled prior to the current local date.
* **Rejected invalid actions**: Unsupported intents or validation failures abort database updates and prevent email triggers.

### 5. Mocked Payment Design
* No real payment provider or Stripe integration is utilized.
* Successful mock payments insert a record into the `transactions` table.
* The payment amount is deducted directly from the persisted `balance_cents` in the `account_holders` table.
* Transaction history lists both initial seeded transactions and new mock payments in real-time.

### 6. Notification and Encrypted PDF Design
* **Generic Email**: The email body is generic, containing no sensitive debtor or balance details.
* **Password Explanation**: The email body details that the PDF is encrypted and can be opened using the last 4 digits of the account holder's phone number as the password. The actual password digits are not written in the email.
* **Encrypted Attachment**: Sensitive details are enclosed within a password-protected PDF.
* **Verified Domain**: Production delivery is dispatched using Resend and the verified domain `ishaborgaonkar.com`.
* **Local Logging**: If `RESEND_API_KEY` is missing or contains a placeholder, fakes delivery by writing notification summaries safely to server console logs without logging passwords or base64 PDF streams.
* **Audit Trail**: Every update writes a record to `notification_attempts` (`sent`, `logged`, or `failed`).

### 7. LLM/Fallback Design
The parser uses a hybrid design. It supports optional LLM-based structured extraction when a real provider key is configured, but all required challenge workflows are covered by a deterministic fallback parser. This keeps the system reliable, testable, and safe when LLM keys are missing. Every parsed action passes through explicit validation before database writes.

### 8. Test Coverage
* **41 tests pass** in the test suite (`pnpm test`).
* Covers parser/action matching, validation checks, CRUD operations on related people, mock payments, transaction ledgers, call bookings, notifications, PDF encryption, and LLM fallback paths.
* Leverages mock side-effects; tests do not depend on live Resend endpoints, local SMTP inboxes, real payment gateways, or live LLM network requests.

### 9. Assumptions and Tradeoffs
* **Jane Murphy Account**: Restricts self-service scope to standard customer context (`acc_standard_001`).
* **Supabase Service Client**: Connects via a service role key on server handlers to fetch contextual dependencies.
* **No Authentication**: Assumes auth/admin interfaces are managed upstream.
* **Deterministic Fallback**: Keyword patterns match typical phrases exactly, trading off chatbot voice fluidity for offline reliability.

### 10. Monitoring and Future Improvements
* **Alerting**: Alert engineering teams on failed status logs in `notification_attempts`.
* **Richer Parser Options**: Implement JSON Schema validation Mode for LLM providers.
* **Audit Logs**: Maintain structured logging for all database mutative writes.
* **Observability**: Monitor email deliverability and response latencies using tracing tools.
* **Features**: Introduce multi-account navigation, auth gates, and installment plan tracking.
