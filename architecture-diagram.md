# PayPathIQ System Architecture Diagram

This document details the system design, request lifecycle, data flow, and components of the PayPathIQ self-service debtor portal.

---

## 1. Architecture Flowchart

```mermaid
flowchart TD
  %% Nodes Definition
  User["Account Holder (Jane Murphy)"]
  UI["Next.js Debtor Portal UI (React Client Component)"]
  API["/api/chat Route (Next.js Server API)"]
  DB[("Supabase PostgreSQL Database")]
  Parser["Intent & Entity Parser"]
  LLM["LLM Parser (GPT/Claude/Gemini via HTTPS)"]
  Regex["Local Regex Fallback Parser"]
  Notifier["Notification Boundary"]
  PDF["PDFKit Document Builder"]
  Resend["Resend API (Production) / Local Logger (Dev)"]

  %% Stylings
  classDef userNode fill:#e0f2fe,stroke:#0284c7,stroke-width:2px;
  classDef uiNode fill:#f0fdf4,stroke:#16a34a,stroke-width:2px;
  classDef apiNode fill:#faf5ff,stroke:#7c3aed,stroke-width:2px;
  classDef dbNode fill:#fff7ed,stroke:#ea580c,stroke-width:2px;
  classDef parseNode fill:#fff1f2,stroke:#e11d48,stroke-width:2px;
  classDef notifyNode fill:#f0fdfa,stroke:#0d9488,stroke-width:2px;

  class User userNode;
  class UI uiNode;
  class API,Parser,LLM,Regex apiNode;
  class DB dbNode;
  class Notifier,PDF,Resend notifyNode;

  %% Connections
  User <-->|1. Type Message & View Updates| UI
  UI <-->|2. Send POST /api/chat Request| API
  
  subgraph Next.js Server API Handler
    API <-->|3. Fetch Current Account Context| DB
    API -->|4. Parse User Request| Parser
    
    subgraph Parser Routing
      Parser -->|If API Keys Present| LLM
      Parser -->|Fallback / Offline Mode| Regex
    end
    
    API -->|5. Apply Validation & Save Update| DB
    API -->|6. If Successful Mutation| Notifier
    
    subgraph Notification Boundary Service
      Notifier -->|a. Compile Details| PDF
      PDF -->|b. Encrypt Statement with last 4 Phone Digits| Resend
      Resend -->|c. Send Email & Insert Attempt Log| DB
    end
  end

  API <-->|7. Return Confirmed Action & Refreshed Context| UI
```

---

## 2. Component Directory & Responsibilities

| Component | Responsibility | Technology Stack |
|---|---|---|
| **Chat UI Layer** | Preserves dynamic client state, displays message history, and synchronizes the debtor dashboard dynamically on chatbot confirmations. | Next.js, React Client Components, Tailwind CSS |
| **API Endpoint** | Orchestrates account lookups, extraction parsing, business logic validation, state changes, and notification dispatches. | Next.js App Router API Route (`/api/chat`) |
| **Hybrid Parser** | Extracts intent and fields (e.g. amount, due date, phone numbers). Supports OpenAI, Anthropic, Gemini, or OpenRouter, falling back to a deterministic local parser. | Next.js Server Utility |
| **Database Persistence** | Stores the core debtor entities: account holders, related representatives, promise details, transaction logs, callback bookings, and notification metrics. | Supabase (PostgreSQL) |
| **PDF Statement Generator** | Generates a base64 PDF summary, setting PDFKit encryption permission keys and a user password using the last 4 digits of the phone number. | PDFKit Utility |
| **Notification Gateway** | Dispatches standard updates containing the password-protected attachment in production, falling back to secure terminal log output in dev mode. | Resend REST API |

---

## 3. End-to-End Request Lifecycle Example
1. **User Input**: Jane Murphy types *"Change Mark Murphy's phone number to +353831112233"* and hits send.
2. **Context Setup**: The API route receives the message, querying Supabase for the current snapshot of Jane's account (`acc_standard_001`).
3. **Intent Parsing**: The parser extracts the action `update_related_person` and parameters `{ name: "Mark Murphy", phone: "+353831112233" }`.
4. **Validation Check**: The route verifies that Mark Murphy is a registered representative.
5. **Database Transaction**: Supabase executes the update.
6. **Notification Trigger**: 
   * PDFKit builds a statement including current balances, contact info, and related people.
   * The statement is encrypted using password `4567` (the last 4 digits of Jane's phone number `+353831234567`).
   * Resend sends the email, and a row is logged in `notification_attempts`.
7. **UI Synchronization**: The API returns the success flag and the refreshed data snapshot, immediately updating the "People" list on Jane's screen.
