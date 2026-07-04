import { NextResponse } from "next/server";
import {
  fetchAccountContext,
  updateAccountHolder,
  addRelatedPerson,
  updateRelatedPerson,
  removeRelatedPerson,
  createPromiseToPay,
  createTransaction,
  createCallAppointment,
} from "@/lib/account/db";
import { parseMessage } from "@/lib/chat/parser";
import { sendAccountChangeNotification } from "@/lib/notifications/account-change-notification";
import type { ChatRequest, ChatResponse } from "@/lib/chat/types";
import type { AccountHolder, RelatedPerson } from "@/lib/account/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const conversationState = new Map<string, { action: string; pendingData: any }>();

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ChatRequest>;
    const accountId = body.accountId?.trim();
    const message = body.message?.trim();
    const conversationId = body.conversationId ?? "starter-conversation";

    if (!accountId || !message) {
      return NextResponse.json(
        { error: "accountId and message are required." },
        { status: 400 },
      );
    }

    // 1. Fetch current account context
    const currentContext = await fetchAccountContext(accountId);
    if (!currentContext) {
      return NextResponse.json(
        { error: `Account with ID ${accountId} was not found.` },
        { status: 404 },
      );
    }

    // 2. Parse intent and extract fields
    const { action: parsedAction, fields: parsedFields } = await parseMessage(message, currentContext);

    let action = parsedAction;
    let fields = parsedFields;

    // Stateful follow-up handling
    const pendingState = conversationState.get(conversationId);
    if (pendingState) {
      if (action !== "unsupported" && action !== "clarify") {
        // Discard pending state on explicit new action
        conversationState.delete(conversationId);
      } else if (pendingState.action === "add_related_person") {
        const emailMatch = message.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
        const phoneMatch = message.match(/(\+\d{8,15})/);
        const extractedEmail = emailMatch ? emailMatch[1] : undefined;
        const extractedPhone = phoneMatch ? phoneMatch[1] : undefined;
        let namePart = message;
        if (extractedEmail) namePart = namePart.replace(extractedEmail, "");
        if (extractedPhone) namePart = namePart.replace(extractedPhone, "");
        namePart = namePart.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]+/g, " ").trim();
        namePart = namePart.replace(/\s+/g, " ");
        const extractedName = namePart || undefined;

        fields = {
          relationship: pendingState.pendingData.relationship,
          authorizedToAct: pendingState.pendingData.authorizedToAct,
          name: extractedName || pendingState.pendingData.name,
          email: extractedEmail || pendingState.pendingData.email,
          phone: extractedPhone || pendingState.pendingData.phone,
        };
        action = "add_related_person";
      } else if (pendingState.action === "confirm_add_related_person") {
        const isYes = message.toLowerCase().match(/\b(yes|yep|sure|ok|okay|add|confirm|do it)\b/);
        if (isYes) {
          fields = {
            relationship: "Representative",
            authorizedToAct: false,
            name: pendingState.pendingData.name,
            email: pendingState.pendingData.email,
            phone: pendingState.pendingData.phone,
          };
          action = "add_related_person";
        } else {
          action = "cancel_pending_add";
        }
        conversationState.delete(conversationId);
      }
    } else if (action === "unsupported" || action === "clarify") {
      // Check if message has name, email, and phone for confirmation fallback
      const emailMatch = message.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
      const phoneMatch = message.match(/(\+\d{8,15})/);
      if (emailMatch && phoneMatch) {
        const extractedEmail = emailMatch[1];
        const extractedPhone = phoneMatch[1];
        let namePart = message.replace(extractedEmail, "").replace(extractedPhone, "");
        namePart = namePart.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]+/g, " ").trim();
        namePart = namePart.replace(/\s+/g, " ");
        const extractedName = namePart;
        if (extractedName && extractedName.length >= 2) {
          action = "ask_confirm_add";
          fields = {
            name: extractedName,
            email: extractedEmail,
            phone: extractedPhone,
          };
        }
      }
    }

    let success = true;
    let reply = "";
    let refreshedContext = currentContext;
    let missingFields: string[] = [];
    let notificationQueued = false;

    // Helper for validation
    const isValidEmail = (emailStr: string) => {
      return emailStr.includes("@") && emailStr.includes(".");
    };

    const isValidName = (nameStr: string) => {
      const trimmed = nameStr.trim();
      if (trimmed.length < 2) return false;
      if (/\d/.test(trimmed)) return false;
      if (!/[a-zA-Z]/.test(trimmed)) return false;
      return true;
    };

    const isValidAddress = (addrStr: string) => {
      const trimmed = addrStr.trim();
      if (trimmed.length < 5) return false;
      const parts = trimmed.split(",").map(p => p.trim()).filter(Boolean);
      if (parts.length < 2) return false;
      return true;
    };

    const isDateInPast = (dateStr: string) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(dateStr);
      return target < today;
    };

    // 3. Process actions
    switch (action) {
      case "read_account": {
        const acc = currentContext.account;
        const text = message.toLowerCase().trim();

        if (fields.incompleteRead || text === "details" || text === "account" || text === "show account" || text === "show details") {
          reply = "I can show specific account details. Please ask one of:\n- What is my name?\n- What is my email?\n- What is my address?\n- What is my balance?\n- Show my transactions.\n- Show people linked to my account.\n- Show my promises to pay.\n- What calls do I have booked?";
        } else if (text.includes("what is my name") || text.includes("my name")) {
          let fullName = [acc.accountHolderFirstName, acc.accountHolderLastName].filter(Boolean).join(" ");
          fullName = fullName.replace(/[.!?]+$/, "").trim();
          reply = `Your name on the account is ${fullName}.`;
        } else if (
          text.includes("email address is on my account") ||
          text.includes("what email") ||
          text.includes("what is my email") ||
          text.includes("what's my email")
        ) {
          reply = `The email address on your account is ${acc.email}.`;
        } else if (
          text.includes("phone number is on my account") ||
          text.includes("what phone") ||
          text.includes("what is my phone") ||
          text.includes("what's my phone")
        ) {
          reply = `The phone number on your account is ${acc.phone}.`;
        } else if (
          text.includes("postal address") ||
          text.includes("my address") ||
          text.includes("where do i live")
        ) {
          const addrParts = [
            acc.address.line1,
            acc.address.line2,
            acc.address.city,
            acc.address.postalCode,
            acc.address.country,
          ].filter(Boolean);
          reply = `Your postal address is ${addrParts.join(", ")}.`;
        } else if (text.includes("what is my balance") || text.includes("my balance")) {
          const balanceFormatted = (acc.balanceCents / 100).toLocaleString("en-IE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          reply = `Your current outstanding balance is €${balanceFormatted}.`;
        } else if (text.includes("how much do i owe")) {
          const balanceFormatted = (acc.balanceCents / 100).toLocaleString("en-IE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          reply = `You currently owe €${balanceFormatted}.`;
        } else {
          // General full account summary
          const addr = [
            acc.address.line1,
            acc.address.line2,
            acc.address.city,
            acc.address.postalCode,
            acc.address.country,
          ].filter(Boolean).join(", ");
          const balanceFormatted = (acc.balanceCents / 100).toLocaleString("en-IE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          let fullName = [acc.accountHolderFirstName, acc.accountHolderLastName].filter(Boolean).join(" ");
          fullName = fullName.replace(/[.!?]+$/, "").trim();
          reply = `Your account details are as follows:\n- Full Name: ${fullName}\n- Email: ${acc.email}\n- Phone: ${acc.phone}\n- Address: ${addr}\n- Preferred Contact Method: ${acc.preferredContactMethod.toLowerCase()}\n- Current Balance: €${balanceFormatted}\n- Creditor: ${acc.creditorName}\n- Reference: ${acc.reference}`;
        }
        break;
      }

      case "update_account_holder": {
        const updates: Partial<AccountHolder> = {};
        const text = message.toLowerCase().trim();

        // 1. Check for name update intent
        const nameKeywords = ["change my name", "update my name", "name change", "change name", "update name"];
        const isNameAction = nameKeywords.some(kw => text.includes(kw)) || (fields.name !== undefined && fields.name.trim() === "");
        if (isNameAction && (fields.name === undefined || !isValidName(fields.name.trim()))) {
          success = false;
          reply = "Please provide the full name in this format: Change my name to Jane Murphy.";
          break;
        }

        // 2. Check for email update intent
        const emailKeywords = ["change my email", "update my email", "email change", "change email", "update email"];
        const isEmailAction = emailKeywords.some(kw => text.includes(kw)) || (fields.email !== undefined && fields.email.trim() === "");
        if (isEmailAction && (fields.email === undefined || !isValidEmail(fields.email.trim()))) {
          success = false;
          reply = "Please provide the new email address in this format: Change my email to jane@example.com.";
          break;
        }

        // 3. Check for phone update intent
        const phoneKeywords = ["change my phone", "update my phone", "phone change", "change phone", "update phone", "change phone number to"];
        const isPhoneAction = phoneKeywords.some(kw => text.includes(kw)) || (fields.phone !== undefined && fields.phone.trim() === "");
        if (isPhoneAction && (fields.phone === undefined || fields.phone.replace(/\D/g, "").length < 5)) {
          success = false;
          reply = "Please provide the new phone number in this format: Change my phone number to +353831234567.";
          break;
        }

        // 4. Check for address update intent
        const addressKeywords = ["change my address", "update my address", "my address", "address change", "change my postal address", "update my postal address"];
        const isAddressAction = addressKeywords.some(kw => text.includes(kw)) || (fields.address !== undefined && fields.address.trim() === "");
        if (isAddressAction && (fields.address === undefined || !isValidAddress(fields.address.trim()))) {
          success = false;
          reply = "Please provide the full postal address in this format: Change my postal address to 12 River Walk, Rathmines, Dublin, D06 X123, Ireland.";
          break;
        }

        // Apply edits if fields are valid
        if (fields.email !== undefined) {
          if (!isValidEmail(fields.email)) {
            success = false;
            reply = "Please provide the new email address in this format: Change my email to jane@example.com.";
            break;
          }
          updates.email = fields.email;
        }
        if (fields.phone !== undefined) {
          if (fields.phone.replace(/\D/g, "").length < 5) {
            success = false;
            reply = "Please provide the new phone number in this format: Change my phone number to +353831234567.";
            break;
          }
          updates.phone = fields.phone;
        }
        if (fields.name !== undefined) {
          let nameStr = fields.name.trim();
          nameStr = nameStr.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]+$/, "").trim();
          if (!isValidName(nameStr)) {
            success = false;
            reply = "Please provide the full name in this format: Change my name to Jane Murphy.";
            break;
          }
          const nameParts = nameStr.split(/\s+/);
          updates.accountHolderFirstName = nameParts[0];
          updates.accountHolderLastName = nameParts.slice(1).join(" ");
        }
        if (fields.address !== undefined) {
          let addrStr = fields.address.trim();
          addrStr = addrStr.replace(/[.!?]+$/, "").trim();
          if (!isValidAddress(addrStr)) {
            success = false;
            reply = "Please provide the full postal address in this format: Change my postal address to 12 River Walk, Rathmines, Dublin, D06 X123, Ireland.";
            break;
          }
          const parts = addrStr.split(",").map(p => p.trim());
          const line1 = parts[0] || "";
          const line2 = parts.length > 4 ? parts[1] : "";
          let city = "";
          let postalCode = "";
          let country = "";

          if (parts.length === 2) {
            city = parts[1];
          } else if (parts.length === 3) {
            city = parts[1];
            country = parts[2];
          } else if (parts.length === 4) {
            city = parts[1];
            postalCode = parts[2];
            country = parts[3];
          } else if (parts.length >= 5) {
            city = parts[2];
            postalCode = parts[3];
            country = parts[4];
          }

          updates.address = {
            line1,
            line2: line2 || undefined,
            city,
            postalCode,
            country,
          };
        }

        if (Object.keys(updates).length === 0) {
          success = false;
          reply = "I couldn't identify any contact fields to update. Please specify what you would like to change (e.g. email or phone number).";
        } else {
          refreshedContext = await updateAccountHolder(accountId, updates);
          if (updates.accountHolderFirstName !== undefined) {
            const fullName = [updates.accountHolderFirstName, updates.accountHolderLastName].filter(Boolean).join(" ");
            reply = `I have updated the account holder name to ${fullName}.`;
          } else if (updates.address !== undefined) {
            const addrParts = [
              updates.address.line1,
              updates.address.line2,
              updates.address.city,
              updates.address.postalCode,
              updates.address.country,
            ].filter(Boolean);
            reply = `I have updated your postal address to ${addrParts.join(", ")}.`;
          } else {
            reply = "I have successfully updated your account contact details.";
          }
          notificationQueued = true;
        }
        break;
      }

      case "read_preferred_contact_method": {
        reply = `Your preferred contact method is ${currentContext.account.preferredContactMethod.toLowerCase()}.`;
        break;
      }

      case "update_preferred_contact_method": {
        const method = fields.preferredContactMethod?.toLowerCase().trim();
        if (method === "email" || method === "sms" || method === "phone") {
          refreshedContext = await updateAccountHolder(accountId, { preferredContactMethod: method as "email" | "sms" | "phone" });
          reply = `I have updated your preferred contact method to ${method.toUpperCase()}.`;
          notificationQueued = true;
        } else {
          success = false;
          reply = "Please provide the preferred contact method in this format: Change my preferred contact method to email. Supported methods are email, sms, and phone.";
        }
        break;
      }

      case "add_related_person": {
        // Required fields: name, email, phone
        const { name, email, phone, relationship, authorizedToAct } = fields;
        const missing = [];
        if (!name) missing.push("name");
        if (!email) missing.push("email");
        if (!phone) missing.push("phone");

        if (missing.length > 0) {
          success = false;
          missingFields = missing;
          reply = "Please provide the related person's name, email, and phone in this format: Add John Murphy, john@example.com, +353831987654 so he can act for me.";
          conversationState.set(conversationId, {
            action: "add_related_person",
            pendingData: {
              relationship,
              authorizedToAct,
              name: name || undefined,
              email: email || undefined,
              phone: phone || undefined,
            }
          });
          break;
        }

        if (!isValidEmail(email!)) {
          success = false;
          reply = "The email address for the related person is invalid.";
          break;
        }

        refreshedContext = await addRelatedPerson(accountId, {
          name: name!,
          email: email!,
          phone: phone!,
          relationship: relationship || "Representative",
          authorizedToAct: !!authorizedToAct,
        });

        reply = `I have successfully added ${name} as a related person on your account (Authorized: ${authorizedToAct ? "Yes" : "No"}).`;
        notificationQueued = true;
        conversationState.delete(conversationId);
        break;
      }

      case "update_related_person": {
        const { name, email, phone, relationship, authorizedToAct } = fields;
        if (!name || (email === undefined && phone === undefined)) {
          success = false;
          reply = "Please provide the related person's name and detail to update. Example: Change Mark's phone number to +353831112233.";
          break;
        }

        const updates: Partial<RelatedPerson> = {};
        if (email !== undefined) {
          if (!isValidEmail(email)) {
            success = false;
            reply = "The email address format provided is invalid.";
            break;
          }
          updates.email = email;
        }
        if (phone !== undefined) {
          updates.phone = phone;
        }
        if (relationship !== undefined) updates.relationship = relationship;
        if (authorizedToAct !== undefined) updates.authorizedToAct = authorizedToAct;

        try {
          refreshedContext = await updateRelatedPerson(accountId, name, updates);
          reply = `I have updated the details for related person ${name}.`;
          notificationQueued = true;
        } catch (e: unknown) {
          success = false;
          reply = e instanceof Error ? e.message : String(e);
        }
        break;
      }

      case "remove_related_person": {
        const { name, email } = fields;
        if (!name) {
          success = false;
          reply = "Please provide the related person's name and, if possible, email. Example: Remove Mark Murphy with email mark@example.test from my account.";
          break;
        }

        try {
          refreshedContext = await removeRelatedPerson(accountId, name, email);
          reply = email
            ? `I have removed ${name} with email ${email} from your related people.`
            : `I have removed ${name} from your related people.`;
          notificationQueued = true;
        } catch (e: unknown) {
          success = false;
          reply = e instanceof Error ? e.message : String(e);
        }
        break;
      }

      case "read_related_people": {
        const list = currentContext.relatedPeople;
        if (list.length === 0) {
          reply = "You do not have any related people registered on your account.";
        } else {
          reply = "Here are the related people on your account:\n" +
            list.map((p) => `- ${p.name} (${p.relationship || "Representative"}), Phone: ${p.phone}, Email: ${p.email} [Authorized: ${p.authorizedToAct ? "Yes" : "No"}]`).join("\n");
        }
        break;
      }

      case "create_promise_to_pay": {
        const { amountCents, dueDate } = fields;
        if (!amountCents || amountCents <= 0 || !dueDate) {
          success = false;
          reply = "Please provide the amount and date in this format: Can I pay 500 euro on the 1st of next month?";
          break;
        }

        if (isDateInPast(dueDate)) {
          success = false;
          reply = "I cannot record a promise to pay in the past. Please choose a future date.";
          break;
        }

        refreshedContext = await createPromiseToPay(accountId, {
          amountCents,
          dueDate,
          currency: currentContext.account.currency,
          status: "active",
        });

        reply = `I have recorded your promise to pay €${(amountCents / 100).toFixed(2)} on ${dueDate}.`;
        notificationQueued = true;
        break;
      }

      case "read_promises_to_pay": {
        const list = currentContext.promisesToPay;
        const sorted = [...list].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        if (sorted.length === 0) {
          reply = "You have no promises to pay scheduled.";
        } else {
          reply = "Here are your scheduled promises to pay:\n" +
            sorted.map((p) => `- €${(p.amountCents / 100).toFixed(2)} due on ${p.dueDate} (Status: ${p.status.toUpperCase()})`).join("\n");
        }
        break;
      }

      case "mock_payment": {
        const { amountCents } = fields;
        if (!amountCents || amountCents <= 0) {
          success = false;
          reply = "Please provide the amount in this format: Pay 10 euro now.";
          break;
        }

        refreshedContext = await createTransaction(accountId, {
          type: "payment",
          status: "completed",
          amountCents,
          currency: currentContext.account.currency,
          description: "Mocked payment via chat",
          transactionDate: new Date().toISOString().split("T")[0],
        });

        reply = `Your payment of €${(amountCents / 100).toFixed(2)} has been mock processed. €${(amountCents / 100).toFixed(2)} has been deducted from your balance.`;
        notificationQueued = true;
        break;
      }

      case "read_transactions": {
        const list = currentContext.transactions;
        const sorted = [...list].sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());
        if (sorted.length === 0) {
          reply = "You have no previous transactions.";
        } else {
          reply = "Here is your transaction history:\n" +
            sorted.map((t) => `- ${t.transactionDate}: ${t.description} of €${(t.amountCents / 100).toFixed(2)} (${t.type.toUpperCase()} - ${t.status.toUpperCase()})`).join("\n");
        }
        break;
      }

      case "book_call_appointment": {
        const { scheduledAt, phone, reason } = fields;
        if (!scheduledAt) {
          success = false;
          reply = "Please provide a future date and time in this format: Book a call next Tuesday at 10am about my bill.";
          break;
        }

        if (isDateInPast(scheduledAt)) {
          success = false;
          reply = "I cannot book a call appointment in the past. Please choose a future date and time.";
          break;
        }

        const callPhone = phone || currentContext.account.phone;
        refreshedContext = await createCallAppointment(accountId, {
          scheduledAt,
          phone: callPhone,
          reason: reason || "Discuss account status",
          status: "scheduled",
        });

        const formattedTime = new Date(scheduledAt).toLocaleString("en-IE", { timeZone: "Europe/Dublin" });
        reply = `I have scheduled your call appointment for ${formattedTime} on ${callPhone}.`;
        notificationQueued = true;
        break;
      }

      case "read_call_appointments": {
        const list = currentContext.callAppointments;
        const now = new Date();
        const futureAppointments = list.filter((c) => {
          return new Date(c.scheduledAt).getTime() >= now.getTime();
        });

        const uniqueAppointments: typeof list = [];
        const seenTimes = new Set<string>();
        const sorted = [...futureAppointments].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

        for (const appt of sorted) {
          if (!seenTimes.has(appt.scheduledAt)) {
            seenTimes.add(appt.scheduledAt);
            uniqueAppointments.push(appt);
          }
        }

        if (uniqueAppointments.length === 0) {
          reply = "You have no call appointments booked.";
        } else {
          reply = "Here are your booked call appointments:\n" +
            uniqueAppointments.map((c) => `- Call scheduled at ${new Date(c.scheduledAt).toLocaleString("en-IE", { timeZone: "Europe/Dublin" })} on number ${c.phone} (Reason: ${c.reason || "None"})`).join("\n");
        }
        break;
      }

      case "ask_confirm_add": {
        success = false;
        reply = "Do you want me to add this person as a related person on your account?";
        conversationState.set(conversationId, {
          action: "confirm_add_related_person",
          pendingData: {
            name: fields.name,
            email: fields.email,
            phone: fields.phone,
          }
        });
        break;
      }

      case "cancel_pending_add": {
        success = false;
        reply = "Okay, I won't add them. How else can I help you?";
        break;
      }

      case "unsupported":
      case "clarify":
      default: {
        success = false;
        reply = "I can help with account self-service only. You can ask me to view or update account details, manage related people, make a mocked payment, create a promise to pay, view transactions, or book a future call.\n\nFor example:\n- What is my balance?\n- Change my postal address to 12 River Walk, Rathmines, Dublin, D06 X123, Ireland.\n- Add John Murphy, john@example.com, +353831987654 so he can act for me.\n- Pay 10 euro now.\n- Book a call next Tuesday at 10am about my bill.";
        break;
      }
    }

    // 4. Trigger email notification if changes were persisted
    if (notificationQueued && success) {
      try {
        await sendAccountChangeNotification({
          accountId,
          changedBy: "account_holder",
          changeSummary: reply,
          accountSnapshot: refreshedContext,
        });
      } catch (err) {
        console.error("Error triggering change notification:", err);
      }
    }

    const response: ChatResponse = {
      conversationId: body.conversationId ?? "starter-conversation",
      message: {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: reply,
        createdAt: new Date().toISOString(),
      },
      result: {
        action,
        success,
        reply,
        account: refreshedContext,
        relatedPeople: refreshedContext.relatedPeople,
        promisesToPay: refreshedContext.promisesToPay,
        transactions: refreshedContext.transactions,
        callAppointments: refreshedContext.callAppointments,
        missingFields: missingFields.length > 0 ? missingFields : undefined,
        notificationQueued: notificationQueued ? true : undefined,
      },
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    console.error("Chat API route error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
