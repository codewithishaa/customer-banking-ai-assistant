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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ChatRequest>;
    const accountId = body.accountId?.trim();
    const message = body.message?.trim();

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
    const { action, fields } = await parseMessage(message, currentContext);

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

        if (text.includes("what is my name") || text.includes("my name")) {
          const fullName = [acc.accountHolderFirstName, acc.accountHolderLastName].filter(Boolean).join(" ");
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
          const fullName = [acc.accountHolderFirstName, acc.accountHolderLastName].filter(Boolean).join(" ");
          reply = `Your account details are as follows:\n- Full Name: ${fullName}\n- Email: ${acc.email}\n- Phone: ${acc.phone}\n- Address: ${addr}\n- Preferred Contact Method: ${acc.preferredContactMethod.toLowerCase()}\n- Current Balance: €${balanceFormatted}\n- Creditor: ${acc.creditorName}\n- Reference: ${acc.reference}`;
        }
        break;
      }

      case "update_account_holder": {
        const updates: Partial<AccountHolder> = {};
        if (fields.email !== undefined) {
          if (!isValidEmail(fields.email)) {
            success = false;
            reply = "The email address format you provided is invalid. Please provide a valid email.";
            break;
          }
          updates.email = fields.email;
        }
        if (fields.phone !== undefined) {
          if (fields.phone.replace(/\D/g, "").length < 5) {
            success = false;
            reply = "The phone number you provided is invalid. Please provide a valid phone number.";
            break;
          }
          updates.phone = fields.phone;
        }
        if (fields.name !== undefined) {
          const nameStr = fields.name.trim();
          if (!isValidName(nameStr)) {
            success = false;
            reply = "The name you provided is invalid. Please provide a valid name.";
            break;
          }
          const nameParts = nameStr.split(/\s+/);
          updates.accountHolderFirstName = nameParts[0];
          updates.accountHolderLastName = nameParts.slice(1).join(" ");
        }
        if (fields.address !== undefined) {
          const addrStr = fields.address.trim();
          if (!addrStr) {
            success = false;
            reply = "The address you provided is invalid.";
            break;
          }
          const parts = addrStr.split(",");
          updates.address = {
            line1: parts[0]?.trim() || "",
            city: parts[1]?.trim() || currentContext.account.address.city,
            postalCode: currentContext.account.address.postalCode,
            country: currentContext.account.address.country,
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
          reply = "Please specify a valid preferred contact method. Supported methods are: email, sms, or phone.";
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
          reply = `To add a related person, please provide their ${missing.join(", ")}.`;
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
        break;
      }

      case "update_related_person": {
        const { name, email, phone, relationship, authorizedToAct } = fields;
        if (!name) {
          success = false;
          reply = "Please specify the name of the related person you wish to update.";
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
          reply = "Please specify the name of the related person you want to remove.";
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
        if (!amountCents || !dueDate) {
          success = false;
          reply = "Please provide both the amount and a future date for your promise to pay.";
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
        if (list.length === 0) {
          reply = "You have no promises to pay scheduled.";
        } else {
          reply = "Here are your scheduled promises to pay:\n" +
            list.map((p) => `- €${(p.amountCents / 100).toFixed(2)} due on ${p.dueDate} (Status: ${p.status.toUpperCase()})`).join("\n");
        }
        break;
      }

      case "mock_payment": {
        const { amountCents } = fields;
        if (!amountCents || amountCents <= 0) {
          success = false;
          reply = "Please specify a valid payment amount.";
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
        if (list.length === 0) {
          reply = "You have no previous transactions.";
        } else {
          reply = "Here is your transaction history:\n" +
            list.map((t) => `- ${t.transactionDate}: ${t.description} of €${(t.amountCents / 100).toFixed(2)} (${t.type.toUpperCase()} - ${t.status.toUpperCase()})`).join("\n");
        }
        break;
      }

      case "book_call_appointment": {
        const { scheduledAt, phone, reason } = fields;
        if (!scheduledAt) {
          success = false;
          reply = "Please specify a date and time for booking the call.";
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

        const formattedTime = new Date(scheduledAt).toLocaleString("en-IE");
        reply = `I have scheduled your call appointment for ${formattedTime} on ${callPhone}.`;
        notificationQueued = true;
        break;
      }

      case "read_call_appointments": {
        const list = currentContext.callAppointments;
        if (list.length === 0) {
          reply = "You have no call appointments booked.";
        } else {
          reply = "Here are your booked call appointments:\n" +
            list.map((c) => `- Call scheduled at ${new Date(c.scheduledAt).toLocaleString("en-IE")} on number ${c.phone} (Reason: ${c.reason || "None"})`).join("\n");
        }
        break;
      }

      case "clarify": {
        success = false;
        reply = "I'm not completely sure about your request. Could you please provide more details or clarify?";
        break;
      }

      default: {
        success = false;
        reply = "I'm sorry, I cannot perform that action. How else can I help you today?";
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
