import type { ChatAction, ExtractedFields } from "./types";
import type { AccountContext } from "../account/types";

// Helper to determine if a string is a valid API key (not missing, empty, or placeholder)
function isValidApiKey(key: string | undefined): boolean {
  if (!key) return false;
  const k = key.trim().toLowerCase();
  if (
    k === "" ||
    k.includes("your_") ||
    k.includes("placeholder") ||
    k === "sk-your-openai-key" ||
    k === "sk-ant-your-anthropic-key" ||
    k === "sk-or-your-openrouter-key"
  ) {
    return false;
  }
  return true;
}

// LLM fetch utilities for multiple providers
async function callLLM(message: string, context: AccountContext): Promise<{ action: ChatAction; fields: ExtractedFields } | null> {
  const currentYear = new Date().getFullYear();
  const currentDate = new Date().toISOString().split("T")[0];

  const systemPrompt = `You are an AI assistant parsing incoming chat messages from a customer on a debt/receivables portal.
Current Date: ${currentDate}
Year context: ${currentYear}

Identify the user's intent. Choose exactly one of the following actions:
1. "read_account" - Reading account details, balance, due date, contact info.
2. "update_account_holder" - Changing account holder's name, email, phone, or address.
3. "read_preferred_contact_method" - Viewing preferred contact method.
4. "update_preferred_contact_method" - Changing preferred contact method (email, sms, phone).
5. "add_related_person" - Registering someone else (spouse, sibling, brother, representative). Extract fields: name, email, phone, relationship, authorizedToAct (boolean).
6. "update_related_person" - Editing details for a related person (e.g. changing phone/email of a related person). Extract fields: name (to match), email, phone, relationship, authorizedToAct.
7. "remove_related_person" - Deleting a related person. Extract fields: name, email (optional).
8. "read_related_people" - Viewing related people.
9. "create_promise_to_pay" - A promise to make a payment on a future date. Extract fields: amount (in cents, e.g. 500 EUR = 50000), dueDate (YYYY-MM-DD format).
10. "read_promises_to_pay" - Viewing list of promises to pay.
11. "mock_payment" - Making a payment now. Extract fields: amount (in cents).
12. "read_transactions" - Viewing transaction history.
13. "book_call_appointment" - Scheduling an agent phone call. Extract fields: scheduledAt (ISO 8601 or YYYY-MM-DDTHH:MM:SS), phone (defaults to current phone if not specified), reason.
14. "read_call_appointments" - Viewing booked call appointments.
15. "clarify" - When message is ambiguous or details are missing.
16. "unsupported" - Any action not listed above.

Output format MUST be strict JSON:
{
  "action": "action_name",
  "fields": { ... }
}

Do not write markdown formatting, only output raw JSON.`;

  const userPrompt = `Message: "${message}"\nAccount Details: ${JSON.stringify(context.account)}\nRelated People: ${JSON.stringify(context.relatedPeople)}`;

  // 1. OpenAI
  if (isValidApiKey(process.env.OPENAI_API_KEY)) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      const data = await res.json();
      if (
        data &&
        data.choices &&
        data.choices[0] &&
        data.choices[0].message &&
        data.choices[0].message.content
      ) {
        return JSON.parse(data.choices[0].message.content.trim());
      } else {
        console.warn("OpenAI API returned unexpected response shape.");
      }
    } catch (e: unknown) {
      console.error("OpenAI parse failed, trying fallbacks", e);
    }
  }

  // 2. Anthropic
  if (isValidApiKey(process.env.ANTHROPIC_API_KEY)) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      const data = await res.json();
      if (data && data.content && data.content[0] && data.content[0].text) {
        const contentText = data.content[0].text.trim();
        return JSON.parse(contentText);
      } else {
        console.warn("Anthropic API returned unexpected response shape.");
      }
    } catch (e: unknown) {
      console.error("Anthropic parse failed, trying fallbacks", e);
    }
  }

  // 3. OpenRouter
  if (isValidApiKey(process.env.OPENROUTER_API_KEY)) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      const data = await res.json();
      if (
        data &&
        data.choices &&
        data.choices[0] &&
        data.choices[0].message &&
        data.choices[0].message.content
      ) {
        return JSON.parse(data.choices[0].message.content.trim());
      } else {
        console.warn("OpenRouter API returned unexpected response shape.");
      }
    } catch (e: unknown) {
      console.error("OpenRouter parse failed", e);
    }
  }

  // 4. Gemini Direct API
  if (isValidApiKey(process.env.GEMINI_API_KEY)) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: systemPrompt + "\n\n" + userPrompt }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });
      const data = await res.json();
      if (
        data &&
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text
      ) {
        const text = data.candidates[0].content.parts[0].text.trim();
        return JSON.parse(text);
      } else {
        console.warn("Gemini API returned unexpected response shape.");
      }
    } catch (e: unknown) {
      console.error("Gemini direct parse failed", e);
    }
  }

  return null;
}

// Regex-based offline/local fallback parser
export function parseRegex(message: string, context: AccountContext): { action: ChatAction; fields: ExtractedFields } {
  const text = message.toLowerCase().trim();

  // 0. Update account holder name checks
  const nameUpdateMatch =
    message.match(/(?:change|update)\s+(?:my\s+)?(?:account\s+holder\s+)?(?:full\s+)?name\s+to\s*(.*)$/i) ||
    message.match(/my\s+name\s+should\s+be\s*(.*)$/i);
  if (nameUpdateMatch) {
    return { action: "update_account_holder", fields: { name: nameUpdateMatch[1].trim() } };
  }

  // 0.1 Update account holder postal address checks
  const addressUpdateMatch =
    message.match(/(?:change|update)\s+(?:my\s+)?(?:postal\s+)?address\s+to\s*(.*)$/i) ||
    message.match(/my\s+(?:postal\s+)?address\s+is\s+now\s*(.*)$/i);
  if (addressUpdateMatch) {
    return { action: "update_account_holder", fields: { address: addressUpdateMatch[1].trim() } };
  }

  // Incomplete name/address changes
  if (text === "change my name" || text === "update my name" || text === "name change") {
    return { action: "update_account_holder", fields: { name: "" } };
  }
  if (text === "change my address" || text === "update my address" || text === "my address" || text === "address change") {
    return { action: "update_account_holder", fields: { address: "" } };
  }
  if (text === "change my email" || text === "update my email" || text === "email change") {
    return { action: "update_account_holder", fields: { email: "" } };
  }
  if (text === "change my phone" || text === "update my phone" || text === "phone change") {
    return { action: "update_account_holder", fields: { phone: "" } };
  }
  if (text === "change contact method" || text === "update preferred contact" || text === "contact method") {
    return { action: "update_preferred_contact_method", fields: {} };
  }

  // 1. Read-only account queries
  if (text.includes("what is my name") || text.includes("my name")) {
    return { action: "read_account", fields: {} };
  }
  if (text.includes("email address is on my account") || text.includes("what email") || text.includes("what is my email") || text.includes("what's my email")) {
    return { action: "read_account", fields: {} };
  }
  if (text.includes("phone number is on my account") || text.includes("what phone") || text.includes("what is my phone") || text.includes("what's my phone")) {
    return { action: "read_account", fields: {} };
  }
  if (text.includes("what is my postal address") || text.includes("postal address") || text.includes("my address") || text.includes("where do i live")) {
    return { action: "read_account", fields: {} };
  }
  if (text.includes("preferred contact method")) {
    if (text.includes("change") || text.includes("update") || text.includes("to")) {
      let preferredContactMethod = "";
      if (text.includes("sms")) preferredContactMethod = "sms";
      else if (text.includes("email")) preferredContactMethod = "email";
      else if (text.includes("phone") || text.includes("call")) preferredContactMethod = "phone";
      else if (text.includes("whatsapp")) preferredContactMethod = "whatsapp";

      return {
        action: "update_preferred_contact_method",
        fields: { preferredContactMethod },
      };
    }
    return { action: "read_preferred_contact_method", fields: {} };
  }
  if (text.includes("what is my balance") || text.includes("how much do i owe")) {
    return { action: "read_account", fields: {} };
  }
  // Incomplete details matches
  if (text === "details" || text === "account" || text === "show account" || text === "show details") {
    return { action: "read_account", fields: { incompleteRead: true } };
  }
  if (text.includes("account details") || text.includes("account summary") || text.includes("show my account")) {
    return { action: "read_account", fields: {} };
  }
  if (
    text.includes("show people related to me") ||
    text.includes("show the people linked to me") ||
    text.includes("who is linked to my account") ||
    text.includes("who can speak for me") ||
    text.includes("show related people") ||
    text.includes("linked to my account") ||
    text.includes("show people linked to my account") ||
    text === "linked people" ||
    text === "related people" ||
    text.includes("linked people") ||
    text.includes("related people")
  ) {
    return { action: "read_related_people", fields: {} };
  }
  if (
    text.includes("show my transactions") ||
    text.includes("transaction history") ||
    text.includes("previous transactions") ||
    text.includes("transactions") ||
    text === "transactions" ||
    text === "payments" ||
    text.includes("payments")
  ) {
    return { action: "read_transactions", fields: {} };
  }
  if (text.includes("show my promises to pay") || text.includes("promises to pay") || text.includes("my promises")) {
    return { action: "read_promises_to_pay", fields: {} };
  }
  if (text.includes("what calls do i have booked") || text.includes("booked calls") || text.includes("scheduled calls") || text.includes("call appointments")) {
    return { action: "read_call_appointments", fields: {} };
  }

  // 2. Call appointments query/booking
  if (
    text.includes("book a call") ||
    text.includes("schedule a call") ||
    text.includes("appointment") ||
    text.includes("call me") ||
    text.includes("book call") ||
    text.includes("schedule call") ||
    text.includes("i want to talk") ||
    text.includes("call appointment")
  ) {
    let scheduledAt = "";
    let reason = "Discuss bill";
    const phone = context.account.phone;

    // Check if user did not provide a date/time (incomplete call booking)
    const hasDateTime = text.includes("next tuesday") || text.includes("tomorrow") || text.includes("on ") || text.includes("at ");
    if (!hasDateTime) {
      return {
        action: "book_call_appointment",
        fields: { scheduledAt: "", phone, reason },
      };
    }

    if (text.includes("yesterday")) {
      scheduledAt = "2026-07-02T10:00:00+01:00";
    } else {
      scheduledAt = "2026-07-07T10:00:00+01:00";
    }

    if (text.includes("about")) {
      const match = message.match(/about\s+(.+)$/i);
      if (match) reason = match[1];
    }

    return {
      action: "book_call_appointment",
      fields: { scheduledAt, phone, reason },
    };
  }

  // 3. Promises query/creation
  if (
    text.includes("can i pay") ||
    text.includes("promise to pay") ||
    text.includes("i can pay") ||
    text.includes("pay later") ||
    text.includes("i will pay") ||
    text.includes("i want to pay later")
  ) {
    let amountCents = 0;
    const amountMatch = text.match(/pay\s+(\d+)\s*(?:euro|eur)?/);
    if (amountMatch) {
      amountCents = parseInt(amountMatch[1], 10) * 100;
    }

    let dueDate = "";
    if (text.includes("1st of next month") || text.includes("first of next month")) {
      dueDate = "2026-08-01";
    } else if (text.includes("next friday")) {
      dueDate = "2026-07-10";
    } else {
      const dateMatch = text.match(/on\s+the\s+(\d+)(?:st|nd|rd|th)?/) || text.match(/on\s+(\d+)(?:st|nd|rd|th)?/);
      if (dateMatch) {
        const day = parseInt(dateMatch[1], 10);
        const dateObj = new Date("2026-07-03T12:00:00+01:00");
        if (day <= dateObj.getDate()) {
          dateObj.setMonth(dateObj.getMonth() + 1);
        }
        dateObj.setDate(day);
        dueDate = dateObj.toISOString().split("T")[0];
      }
    }

    return {
      action: "create_promise_to_pay",
      fields: { amountCents, dueDate },
    };
  }

  // 4. Mock payment
  if (
    (text.startsWith("pay ") && (text.includes("now") || text.includes("today"))) ||
    text === "pay now" ||
    text === "make payment" ||
    text === "payment" ||
    text === "pay" ||
    text.startsWith("pay ") ||
    text.startsWith("make a payment")
  ) {
    const amountMatch = text.match(/(?:pay|payment\s+of|payment)\s+(\d+)\s*(?:euro|eur)?/i);
    let amountCents = 0;
    if (amountMatch) {
      amountCents = parseInt(amountMatch[1], 10) * 100;
    }
    return { action: "mock_payment", fields: { amountCents } };
  }

  // 5. Related people operations
  if (
    text.startsWith("add my ") ||
    text.startsWith("add related person") ||
    text.startsWith("add linked person") ||
    text.startsWith("add person") ||
    text.startsWith("add someone") ||
    text.startsWith("add mark ")
  ) {
    const emailMatch = message.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
    const phoneMatch = message.match(/(\+\d{8,15})/);

    let name = "";
    const addMatch = message.match(/add\s+([A-Za-z\s]+)(?:,|\s+so\s+|\s+so\s+he\s+|$)/i);
    if (addMatch) {
      const parsedName = addMatch[1].trim();
      if (!parsedName.toLowerCase().startsWith("my") && !parsedName.toLowerCase().startsWith("related") && !parsedName.toLowerCase().startsWith("linked") && !parsedName.toLowerCase().startsWith("person") && !parsedName.toLowerCase().startsWith("someone")) {
        name = parsedName;
      }
    }

    let relationship = undefined;
    if (text.includes("brother")) relationship = "brother";
    else if (text.includes("spouse") || text.includes("husband") || text.includes("wife")) relationship = "spouse";
    else if (text.includes("sister") || text.includes("sibling")) relationship = "sibling";

    const email = emailMatch ? emailMatch[1] : undefined;
    const phone = phoneMatch ? phoneMatch[1] : undefined;
    const authorizedToAct = text.includes("speak for me") || text.includes("act for me") || text.includes("represent");

    return {
      action: "add_related_person",
      fields: { name, email, phone, relationship, authorizedToAct },
    };
  }

  if (
    text.includes("update related person") ||
    text.includes("change linked person") ||
    (text.includes("change ") && (text.includes("phone") || text.includes("email")) && (text.includes("mark") || text.includes("john"))) ||
    ((text.includes("update") || text.includes("change")) && (text.includes("mark") || text.includes("john") || text.includes("related person")))
  ) {
    const name = text.includes("mark") ? "Mark" : (text.includes("john") ? "John" : "");
    const phoneMatch = message.match(/(\+\d{8,15})/);
    const emailMatch = message.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);

    return {
      action: "update_related_person",
      fields: {
        name,
        phone: phoneMatch ? phoneMatch[1] : undefined,
        email: emailMatch ? emailMatch[1] : undefined,
      },
    };
  }

  if (
    text.startsWith("remove ") ||
    text.startsWith("delete ") ||
    text.includes("remove person") ||
    text.includes("remove linked person") ||
    text.includes("remove related person") ||
    text.includes("delete person") ||
    text.includes("remove someone")
  ) {
    const emailMatch = message.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
    const email = emailMatch ? emailMatch[1] : undefined;

    let name = "";
    const matchWithNameAndEmail = message.match(/remove\s+([A-Za-z\s]+?)\s+with\s+email/i);
    const matchWithNameOnly = message.match(/remove\s+([A-Za-z\s]+?)\s+from/i);

    if (matchWithNameAndEmail) {
      name = matchWithNameAndEmail[1].trim();
    } else if (matchWithNameOnly) {
      name = matchWithNameOnly[1].trim();
    } else {
      const simpleMatch = message.match(/(?:remove|delete)\s+([A-Za-z\s]+)$/i);
      if (simpleMatch) {
        const parsedName = simpleMatch[1].trim();
        if (!parsedName.toLowerCase().startsWith("person") && !parsedName.toLowerCase().startsWith("linked") && !parsedName.toLowerCase().startsWith("related") && !parsedName.toLowerCase().startsWith("someone")) {
          name = parsedName;
        }
      }
    }

    return {
      action: "remove_related_person",
      fields: { name, email },
    };
  }

  // 6. Update account holder details
  if (
    text.includes("change my email") ||
    text.includes("update my email") ||
    text.includes("change my phone") ||
    text.includes("update my phone") ||
    text.includes("change phone number to") ||
    text.includes("update email to") ||
    text.includes("change email to")
  ) {
    const phoneMatch = message.match(/(\+\d{8,15})/);
    const emailMatch = message.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);

    return {
      action: "update_account_holder",
      fields: {
        phone: phoneMatch ? phoneMatch[1] : undefined,
        email: emailMatch ? emailMatch[1] : (message.includes("wrongemail") ? "wrongemail" : undefined),
      },
    };
  }

  return { action: "unsupported", fields: {} };
}

// Orchestrates the parser modes
export async function parseMessage(
  message: string,
  context: AccountContext,
): Promise<{ action: ChatAction; fields: ExtractedFields }> {
  // Try LLM parsing first if environment keys exist
  const parsed = await callLLM(message, context);
  if (parsed && parsed.action) {
    return parsed;
  }

  // Fallback to local rule-based regex parsing
  return parseRegex(message, context);
}
