# 🏦 Customer Banking AI Assistant

An **AI-powered customer banking self-service platform** that allows customers to view and manage account information, transactions, payment commitments, contact details, callbacks, and account-related requests through both a traditional dashboard and a conversational AI assistant.

The project demonstrates how **AI can be integrated with banking/customer-service workflows** so that customers can perform routine account operations through natural-language conversations instead of navigating multiple forms and support channels.

🔗 **Live Application:**
https://customer-banking-ai-assistant.vercel.app/

🔗 **GitHub Repository:**
https://github.com/codewithishaa/customer-banking-ai-assistant

---

## 📌 Project Overview

The Customer Banking AI Assistant is designed as an intelligent banking and account-management portal.

Customers can see their current account position, outstanding balance, payment information, transactions, registered contact information, scheduled calls, and other account records.

The main feature of the platform is the **AI Assistant**, which interprets customer requests written in natural language and converts them into validated banking/account actions.

For example, instead of navigating through several screens, a customer can interact with the assistant using requests such as:

* "What is my current balance?"
* "Show my latest transactions."
* "Create a promise to pay."
* "Change my phone number."
* "Update the phone number of a related person."
* "Book a callback."
* "Show my account information."
* "Generate my account statement."

The backend interprets the request, identifies the required operation and parameters, validates the information, interacts with the database, and returns the updated result to the user interface.

---

# ✨ Main Features

## 🤖 AI-Powered Banking Assistant

The conversational assistant allows users to interact with their account using natural language.

The system identifies:

* User intent
* Requested banking operation
* Amounts
* Dates
* Phone numbers
* Customer or related-person names
* Other relevant entities

The assistant can then connect the request to the appropriate account operation.

A **hybrid intent-parsing architecture** is used. The system can use an LLM for intelligent interpretation while also providing a deterministic local parser as a fallback.

---

## 💰 Account Overview

The dashboard provides customers with a clear summary of their account, including:

* Current balance
* Minimum payment
* Account/reference number
* Number of overdue days
* Creditor information
* Customer contact details
* Preferred communication channel
* Last payment activity

This gives customers a single location for understanding the current state of their account.

---

## 👤 Customer Account Management

Customers can view their registered account information, including:

* Full name
* Email address
* Phone number
* Physical address
* Communication preference
* Assigned creditor

The AI assistant can also process supported requests for updating account information.

---

## 👥 Related Person Management

The platform supports people associated with the customer's account.

Customers can view registered relationships or representatives and perform supported updates through the conversational assistant.

For example:

```text
Change Mark Murphy's phone number to +353831112233
```

The assistant extracts:

```text
Intent: update_related_person

Name: Mark Murphy
Phone: +353831112233
```

The backend then verifies that the person exists before applying the update.

---

## 💳 Transaction History

Customers can review transactions associated with their account.

Transaction information can include:

* Payment amount
* Transaction date
* Payment status
* Transaction history

The AI assistant can also answer account-related questions using the latest customer account context.

---

## 📅 Promise to Pay

Customers can create and manage **Promise to Pay (PTP)** arrangements.

This allows a customer to commit to paying a specified amount on an agreed date.

The system can process conversational requests containing:

* Payment amount
* Payment date
* Customer/account context

The information is validated before being stored in the database.

---

## 📞 Callback Booking

Customers can schedule telephone callbacks with a support agent.

The system stores callback information and displays upcoming appointments on the dashboard.

This reduces the need for customers to contact support manually and provides a structured appointment workflow.

---

## 📄 Secure PDF Statements

Customers can generate account statements directly from the application.

Statements are produced using **PDFKit** and contain relevant account information such as:

* Account details
* Current balance
* Customer information
* Related account information

For additional protection, generated PDF statements can be password protected.

The system uses the **last four digits of the registered phone number** as the document password.

---

## 📧 Automated Email Notifications

After supported account changes, the system can trigger a notification workflow.

In production, notifications can be sent using the **Resend API**.

The workflow can:

1. Complete the requested customer operation.
2. Generate an updated PDF account statement.
3. Password-protect the document.
4. Send the document to the customer's registered email.
5. Record the notification attempt in the database.

In development environments, notification behavior can fall back to local logging.

---

# 🧠 How the AI Assistant Works

The conversational workflow follows the architecture below:

```text
Customer
   ↓
Next.js / React Interface
   ↓
POST /api/chat
   ↓
Load Current Customer Account Context
   ↓
Intent & Entity Parser
   ↓
LLM Parser OR Local Regex Parser
   ↓
Business Logic Validation
   ↓
Supabase PostgreSQL
   ↓
Execute Account Operation
   ↓
Generate Notification / PDF if required
   ↓
Return Updated Account Data
   ↓
React UI Refreshes Automatically
```

---

# 🔄 Example Request Lifecycle

Suppose a customer enters:

```text
Change Mark Murphy's phone number to +353831112233
```

### Step 1 — User Request

The React interface sends the message to:

```text
POST /api/chat
```

### Step 2 — Account Context Retrieval

The backend retrieves the latest customer/account information from Supabase.

### Step 3 — Intent Detection

The parser identifies the operation:

```text
update_related_person
```

and extracts:

```json
{
  "name": "Mark Murphy",
  "phone": "+353831112233"
}
```

### Step 4 — Validation

The server verifies that the requested person is registered against the account.

### Step 5 — Database Update

The account information is updated in Supabase PostgreSQL.

### Step 6 — Notification Workflow

If the operation requires notification:

* PDFKit creates an updated statement.
* The PDF is password protected.
* Resend sends the notification email.
* The notification attempt is stored.

### Step 7 — UI Synchronisation

The API sends refreshed account information back to the frontend.

The dashboard immediately displays the updated information.

---

# 🏗️ System Architecture

```text
┌─────────────────────────────┐
│          Customer           │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Next.js + React Frontend    │
│ Dashboard + AI Assistant    │
└──────────────┬──────────────┘
               │
               │ POST /api/chat
               ▼
┌─────────────────────────────┐
│ Next.js Server/API Layer    │
│                             │
│ • Account Context           │
│ • Business Logic            │
│ • Validation                │
│ • Intent Processing         │
└───────┬─────────────┬───────┘
        │             │
        ▼             ▼
┌──────────────┐  ┌───────────────┐
│ LLM Parser   │  │ Regex Fallback│
└──────┬───────┘  └──────┬────────┘
       └──────────┬───────┘
                  ▼
          ┌───────────────┐
          │   Supabase    │
          │  PostgreSQL   │
          └──────┬────────┘
                 │
                 ▼
       ┌────────────────────┐
       │ Notification Layer │
       └──────┬─────────────┘
              │
        ┌─────┴──────┐
        ▼            ▼
     PDFKit        Resend
   Statements       Email
```

---

# 🛠️ Technology Stack

## Frontend

### Next.js

The application is built using **Next.js 16**.

Next.js provides both the frontend interface and server-side functionality used by the platform.

### React

**React 19** is used for building interactive components including:

* Customer dashboard
* AI chat interface
* Account information views
* Transaction views
* Quick actions
* Appointment displays

### TypeScript

TypeScript provides static typing across the application and improves reliability when handling account objects, request parameters, API responses, and component properties.

### Tailwind CSS

Tailwind CSS is used for responsive styling and application layout.

### shadcn / Base UI

Reusable interface components are implemented using modern React UI libraries.

### Lucide React

Lucide provides the icon system used throughout the interface.

---

# ⚙️ Backend

The project uses **Next.js server-side APIs** rather than a separate backend framework.

The central conversational API is:

```text
/api/chat
```

The API handles:

* Customer context retrieval
* Intent parsing
* Entity extraction
* Input validation
* Business logic
* Database operations
* Notification triggering
* Updated-state responses

This keeps the frontend and backend within one full-stack Next.js application.

---

# 🗄️ Database

## Supabase

Supabase provides the application's database layer.

The underlying database is **PostgreSQL**.

The system stores information such as:

* Customer/account holders
* Contact information
* Related people
* Account balances
* Promises to pay
* Transactions
* Callback bookings
* Notification attempts
* Account-related records

The server retrieves the current customer context before processing conversational requests so actions are based on the latest account information.

---

# 🤖 AI / Natural Language Processing

The project includes a **hybrid intent and entity extraction system**.

Depending on configuration, the parser can integrate with LLM providers such as:

* OpenAI
* Anthropic Claude
* Google Gemini
* OpenRouter

The LLM helps translate natural-language customer requests into structured operations.

For reliability, the architecture also includes a **local deterministic/regex fallback parser**.

This means the application is not completely dependent on an external AI provider for every supported request.

---

# 📄 PDF Generation

**PDFKit** is used to generate customer statements.

The generated documents can include account summaries and customer details.

PDF encryption and permissions are used to provide additional protection for sensitive account information.

---

# 📧 Email Integration

**Resend** is used as the production email delivery service.

It can deliver:

* Account updates
* Confirmation emails
* Secure PDF statements

Notification attempts can also be recorded for auditing and monitoring.

---

# ☁️ Deployment

The application is deployed using **Vercel**.

Vercel hosts the Next.js application and provides the production environment for the frontend and server-side routes.

Live deployment:

```text
https://customer-banking-ai-assistant.vercel.app/
```

---

# 🧪 Testing & Code Quality

The project includes:

* TypeScript type checking
* ESLint
* Vitest

Available scripts include:

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm typecheck
pnpm test
```

---

# 📦 Core Technologies

| Area                   | Technology                             |
| ---------------------- | -------------------------------------- |
| Full-Stack Framework   | Next.js 16                             |
| Frontend               | React 19                               |
| Programming Language   | TypeScript                             |
| Styling                | Tailwind CSS                           |
| UI Components          | shadcn, Base UI                        |
| Icons                  | Lucide React                           |
| Backend/API            | Next.js App Router / Server API Routes |
| Database               | Supabase PostgreSQL                    |
| AI/NLP                 | LLM-based Intent & Entity Parsing      |
| AI Providers Supported | OpenAI, Anthropic, Gemini, OpenRouter  |
| Fallback NLP           | Local Regex / Deterministic Parser     |
| PDF Generation         | PDFKit                                 |
| Email                  | Resend                                 |
| Testing                | Vitest                                 |
| Code Quality           | ESLint, TypeScript                     |
| Deployment             | Vercel                                 |

---

# 📁 Project Structure

```text
customer-banking-ai-assistant/
│
├── docs/
│
├── fixtures/
│
├── public/
│
├── src/
│   ├── app/
│   │   ├── api/
│   │   └── ...
│   │
│   ├── components/
│   │
│   └── lib/
│
├── supabase/
│   └── migrations/
│
├── architecture-diagram.md
├── package.json
├── tsconfig.json
├── next.config.ts
├── vitest.config.ts
└── README.md
```

---

# 🚀 Running the Project Locally

Clone the repository:

```bash
git clone https://github.com/codewithishaa/customer-banking-ai-assistant.git
```

Move into the project directory:

```bash
cd customer-banking-ai-assistant
```

Install dependencies:

```bash
pnpm install
```

Create the required environment configuration based on:

```text
.env.example
.env.local.example
```

Start the development server:

```bash
pnpm dev
```

Then open:

```text
http://localhost:3000
```

---

# 💡 Why This Project Was Built

Traditional customer-support systems often require customers to navigate multiple pages, forms, or telephone support channels to perform simple account operations.

This project explores a different approach:

> **Use conversational AI as an interface to existing structured banking operations.**

Rather than allowing an LLM to directly manipulate data, the system converts customer language into structured intents, validates requests through application business logic, performs controlled database operations, and then confirms the result.

This architecture combines the flexibility of conversational AI with the predictability required for financial workflows.

---

# 🎯 Key Engineering Concepts Demonstrated

This project demonstrates practical experience with:

* Full-stack application development
* Next.js server-side architecture
* React UI development
* TypeScript
* REST-style API communication
* PostgreSQL data modelling
* Supabase integration
* Conversational AI
* LLM integration
* Intent classification
* Entity extraction
* AI fallback mechanisms
* Business-rule validation
* Secure document generation
* Automated email workflows
* Customer self-service automation
* State synchronisation between frontend and backend
* Cloud deployment

---

# 🔐 Security Considerations

The architecture keeps sensitive operations on the server side.

Important design principles include:

* Server-side database operations
* Validation before account mutations
* Environment variables for API credentials
* Password-protected PDF statements
* Controlled account-context retrieval
* Notification logging
* Structured operations instead of unrestricted AI database access

This project is a demonstration application and should not be considered a production banking system without additional authentication, authorization, auditing, encryption, compliance, fraud prevention, rate limiting, monitoring, and financial-security controls.

---

# 🔮 Future Improvements

Potential extensions include:

* Secure customer authentication
* OTP / multi-factor authentication
* Role-based access control
* Real banking/payment API integration
* Advanced AI tool/function calling
* Conversation history
* Retrieval-Augmented Generation for banking policies
* Fraud and anomaly detection
* Sentiment-aware customer support
* Support-agent escalation
* Audit dashboards
* Real-time notifications
* Voice-based banking assistant
* Multi-language customer support
* AI request monitoring and observability

---

# 👩‍💻 Author

**Isha Borgaonkar**

AI / Machine Learning • Full-Stack Development • Data Science

GitHub:
https://github.com/codewithishaa

Live Project:
https://customer-banking-ai-assistant.vercel.app/
