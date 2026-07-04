/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerSupabaseClient } from "../supabase/server";
import type {
  AccountContext,
  AccountHolder,
  RelatedPerson,
  PromiseToPay,
  Transaction,
  CallAppointment,
} from "./types";

import standardFixture from "../../../fixtures/debtor-standard.json";
import disputeFixture from "../../../fixtures/debtor-dispute.json";
import hardshipFixture from "../../../fixtures/debtor-hardship.json";

// Dynamic mapper helper from database schema to AccountContext types
export function mapDbToAccountContext(
  holder: any,
  relatedPeople: any[] = [],
  promises: any[] = [],
  txns: any[] = [],
  calls: any[] = [],
): AccountContext {
  const accountId = holder.account_id;

  // Determine metadata based on account type
  let lastStatementAmountCents = 116000;
  let dueDate = "2026-01-24";
  let supportPhone = "+35318000000";
  let supportEmail = "support@example.test";
  let recentStatementReason = "Higher winter usage and one missed direct debit";
  let riskFlags: Record<string, boolean> = {};

  if (accountId.includes("dispute")) {
    lastStatementAmountCents = 47200;
    dueDate = "2026-02-07";
    supportPhone = "+35318000001";
    supportEmail = "billing-disputes@example.test";
    recentStatementReason = "Includes roaming charges and an early contract termination fee";
    riskFlags = { disputeOpen: false, requiresHumanForBillingChallenge: true };
  } else if (accountId.includes("hardship")) {
    lastStatementAmountCents = 148100;
    dueDate = "2026-01-03";
    supportPhone = "+35318000002";
    supportEmail = "support-hardship@example.test";
    recentStatementReason = "Balance carried forward with late fees applied";
    riskFlags = { financialHardshipMentioned: true, preferHumanReview: true };
  }

  const account: AccountHolder = {
    accountId: holder.account_id,
    accountHolderFirstName: holder.first_name,
    accountHolderLastName: holder.last_name,
    email: holder.email,
    phone: holder.phone,
    address: {
      line1: holder.address_line1,
      line2: holder.address_line2 || undefined,
      city: holder.city,
      postalCode: holder.postal_code,
      country: holder.country,
    },
    preferredContactMethod: holder.preferred_contact_method as any,
    reference: holder.reference,
    creditorName: holder.creditor_name,
    currency: holder.currency,
    balanceCents: holder.balance_cents,
    status: holder.status,
    daysPastDue: holder.days_past_due,
    minimumPaymentCents: holder.minimum_payment_cents,
    lastPaymentDate: holder.last_payment_date ? holder.last_payment_date.toString() : "",
    lastPaymentAmountCents: holder.last_payment_amount_cents,
  };

  return {
    account,
    billing: {
      currentAmountCents: holder.balance_cents,
      lastStatementAmountCents,
      dueDate,
    },
    paymentOptions: {
      payNowEnabled: true,
      promiseToPayEnabled: true,
      mockPaymentsEnabled: true,
      arrangementEnabled: false,
      eligibleArrangementOptions: [],
    },
    support: {
      humanSupportAvailable: true,
      supportPhone,
      supportEmail,
    },
    relatedPeople: relatedPeople.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      relationship: r.relationship || undefined,
      authorizedToAct: r.authorized_to_act,
    })),
    promisesToPay: promises.map((p) => ({
      id: p.id,
      amountCents: p.amount_cents,
      currency: p.currency,
      dueDate: p.due_date ? p.due_date.toString() : "",
      status: p.status as any,
      createdAt: p.created_at,
    })),
    transactions: txns.map((t) => ({
      id: t.id,
      type: t.type as any,
      status: t.status as any,
      amountCents: t.amount_cents,
      currency: t.currency,
      description: t.description,
      transactionDate: t.transaction_date ? t.transaction_date.toString() : "",
    })),
    callAppointments: calls.map((c) => ({
      id: c.id,
      scheduledAt: c.scheduled_at,
      phone: c.phone,
      reason: c.reason || undefined,
      status: c.status as any,
    })),
    notificationRules: {
      sendEmailOnDataChange: true,
      pdfPasswordSource: "account_phone_last4",
    },
    faqContext: {
      recentStatementReason,
      acceptedPaymentMethods: ["card", "bank_transfer"],
    },
    riskFlags,
  };
}

// Fetch nested AccountContext dynamically from database tables
export async function fetchAccountContext(accountId: string): Promise<AccountContext | null> {
  const supabase = createServerSupabaseClient();

  // Trigger dynamic auto-seeding if the database has not been initialized
  await seedFixturesIfEmpty(supabase);

  // Retrieve primary account holder row
  const { data: holder, error: holderError } = await supabase
    .from("account_holders")
    .select("*")
    .eq("account_id", accountId)
    .single();

  if (holderError || !holder) {
    return null;
  }

  // Retrieve related records
  const [
    { data: related },
    { data: promises },
    { data: transactions },
    { data: calls },
  ] = await Promise.all([
    supabase.from("related_people").select("*").eq("account_holder_id", holder.id),
    supabase.from("promises_to_pay").select("*").eq("account_holder_id", holder.id).order("due_date", { ascending: true }),
    supabase.from("transactions").select("*").eq("account_holder_id", holder.id).order("transaction_date", { ascending: false }),
    supabase.from("call_appointments").select("*").eq("account_holder_id", holder.id).order("scheduled_at", { ascending: true }),
  ]);

  return mapDbToAccountContext(
    holder,
    related || [],
    promises || [],
    transactions || [],
    calls || [],
  );
}

// Update primary account holder values
export async function updateAccountHolder(
  accountId: string,
  updates: Partial<AccountHolder>,
): Promise<AccountContext> {
  const supabase = createServerSupabaseClient();

  // Query account holder id first
  const { data: holder, error: fetchErr } = await supabase
    .from("account_holders")
    .select("id")
    .eq("account_id", accountId)
    .single();

  if (fetchErr || !holder) {
    throw new Error(`Account holder with reference ${accountId} not found.`);
  }

  // Map JS fields to snake_case DB columns
  const dbUpdates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.accountHolderFirstName !== undefined) dbUpdates.first_name = updates.accountHolderFirstName;
  if (updates.accountHolderLastName !== undefined) dbUpdates.last_name = updates.accountHolderLastName;
  if (updates.email !== undefined) dbUpdates.email = updates.email;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.preferredContactMethod !== undefined) dbUpdates.preferred_contact_method = updates.preferredContactMethod;
  if (updates.balanceCents !== undefined) dbUpdates.balance_cents = updates.balanceCents;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.daysPastDue !== undefined) dbUpdates.days_past_due = updates.daysPastDue;
  if (updates.lastPaymentDate !== undefined) dbUpdates.last_payment_date = updates.lastPaymentDate;
  if (updates.lastPaymentAmountCents !== undefined) dbUpdates.last_payment_amount_cents = updates.lastPaymentAmountCents;

  if (updates.address !== undefined) {
    dbUpdates.address_line1 = updates.address.line1 || "";
    dbUpdates.address_line2 = updates.address.line2 || null;
    dbUpdates.city = updates.address.city || "";
    dbUpdates.postal_code = updates.address.postalCode || "";
    dbUpdates.country = updates.address.country || "";
  }

  const { error: updateErr } = await supabase
    .from("account_holders")
    .update(dbUpdates)
    .eq("id", holder.id);

  if (updateErr) {
    throw new Error(`Failed to update account holder: ${updateErr.message}`);
  }

  const refreshed = await fetchAccountContext(accountId);
  if (!refreshed) throw new Error("Failed to load refreshed context");
  return refreshed;
}

// Add related person to account holder
export async function addRelatedPerson(
  accountId: string,
  person: Omit<RelatedPerson, "id">,
): Promise<AccountContext> {
  const supabase = createServerSupabaseClient();

  const { data: holder, error: fetchErr } = await supabase
    .from("account_holders")
    .select("id")
    .eq("account_id", accountId)
    .single();

  if (fetchErr || !holder) {
    throw new Error(`Account holder with reference ${accountId} not found.`);
  }

  const { error: insertErr } = await supabase.from("related_people").insert({
    account_holder_id: holder.id,
    name: person.name,
    email: person.email,
    phone: person.phone,
    relationship: person.relationship || null,
    authorized_to_act: person.authorizedToAct,
  });

  if (insertErr) {
    throw new Error(`Failed to add related person: ${insertErr.message}`);
  }

  const refreshed = await fetchAccountContext(accountId);
  if (!refreshed) throw new Error("Failed to load refreshed context");
  return refreshed;
}

// Update details of a related person
export async function updateRelatedPerson(
  accountId: string,
  personName: string,
  updates: Partial<RelatedPerson>,
): Promise<AccountContext> {
  const supabase = createServerSupabaseClient();

  const { data: holder, error: fetchErr } = await supabase
    .from("account_holders")
    .select("id")
    .eq("account_id", accountId)
    .single();

  if (fetchErr || !holder) {
    throw new Error(`Account holder with reference ${accountId} not found.`);
  }

  // Find matching related people by name (case-insensitive fuzzy or exact match)
  const { data: people, error: peopleErr } = await supabase
    .from("related_people")
    .select("*")
    .eq("account_holder_id", holder.id);

  if (peopleErr || !people) {
    throw new Error("No related people found on this account.");
  }

  // Filter matching by name
  const matches = people.filter((p) =>
    p.name.toLowerCase().includes(personName.toLowerCase()),
  );

  if (matches.length === 0) {
    throw new Error(`Could not find a related person named "${personName}".`);
  }
  if (matches.length > 1) {
    throw new Error(`Multiple people named "${personName}" found. Please clarify which one you mean.`);
  }

  const dbUpdates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.email !== undefined) dbUpdates.email = updates.email;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.relationship !== undefined) dbUpdates.relationship = updates.relationship;
  if (updates.authorizedToAct !== undefined) dbUpdates.authorized_to_act = updates.authorizedToAct;

  const { error: updateErr } = await supabase
    .from("related_people")
    .update(dbUpdates)
    .eq("id", matches[0].id);

  if (updateErr) {
    throw new Error(`Failed to update related person: ${updateErr.message}`);
  }

  const refreshed = await fetchAccountContext(accountId);
  if (!refreshed) throw new Error("Failed to load refreshed context");
  return refreshed;
}

// Remove related person
export async function removeRelatedPerson(
  accountId: string,
  personName: string,
  personEmail?: string,
): Promise<AccountContext> {
  const supabase = createServerSupabaseClient();

  const { data: holder, error: fetchErr } = await supabase
    .from("account_holders")
    .select("id")
    .eq("account_id", accountId)
    .single();

  if (fetchErr || !holder) {
    throw new Error(`Account holder with reference ${accountId} not found.`);
  }

  const { data: people, error: peopleErr } = await supabase
    .from("related_people")
    .select("*")
    .eq("account_holder_id", holder.id);

  if (peopleErr || !people) {
    throw new Error("No related people found.");
  }

  // Find matches by name (case-insensitive exact or includes matching)
  let nameMatches = people.filter((p) =>
    p.name.toLowerCase() === personName.toLowerCase()
  );
  if (nameMatches.length === 0) {
    nameMatches = people.filter((p) =>
      p.name.toLowerCase().includes(personName.toLowerCase())
    );
  }

  if (personEmail) {
    const exactMatches = nameMatches.filter((p) =>
      p.email && p.email.toLowerCase() === personEmail.toLowerCase()
    );
    if (exactMatches.length === 0) {
      throw new Error(`Could not find related person "${personName}" with email "${personEmail}".`);
    }

    // Sort by created_at descending (most recently created duplicate first)
    exactMatches.sort((a: any, b: any) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });

    const { error: deleteErr } = await supabase
      .from("related_people")
      .delete()
      .eq("id", exactMatches[0].id);

    if (deleteErr) {
      throw new Error(`Failed to remove related person: ${deleteErr.message}`);
    }

    const refreshed = await fetchAccountContext(accountId);
    if (!refreshed) throw new Error("Failed to load refreshed context");
    return refreshed;
  }

  if (nameMatches.length === 0) {
    throw new Error(`Could not find related person "${personName}".`);
  }

  if (nameMatches.length === 1) {
    const { error: deleteErr } = await supabase
      .from("related_people")
      .delete()
      .eq("id", nameMatches[0].id);

    if (deleteErr) {
      throw new Error(`Failed to remove related person: ${deleteErr.message}`);
    }

    const refreshed = await fetchAccountContext(accountId);
    if (!refreshed) throw new Error("Failed to load refreshed context");
    return refreshed;
  }

  // If matches.length > 1
  const uniqueEmails = Array.from(new Set(nameMatches.map((p) => p.email).filter(Boolean)));
  if (uniqueEmails.length > 1) {
    throw new Error(`I found multiple people named ${personName}. Please specify the email address: ${uniqueEmails.join(", ")}.`);
  }

  // If duplicate name and same email (or no email)
  nameMatches.sort((a: any, b: any) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return timeB - timeA;
  });

  const { error: deleteErr } = await supabase
    .from("related_people")
    .delete()
    .eq("id", nameMatches[0].id);

  if (deleteErr) {
    throw new Error(`Failed to remove related person: ${deleteErr.message}`);
  }

  const refreshed = await fetchAccountContext(accountId);
  if (!refreshed) throw new Error("Failed to load refreshed context");
  return refreshed;
}

// Record a new promise to pay
export async function createPromiseToPay(
  accountId: string,
  promise: Omit<PromiseToPay, "id" | "createdAt">,
): Promise<AccountContext> {
  const supabase = createServerSupabaseClient();

  const { data: holder, error: fetchErr } = await supabase
    .from("account_holders")
    .select("id")
    .eq("account_id", accountId)
    .single();

  if (fetchErr || !holder) {
    throw new Error(`Account holder with reference ${accountId} not found.`);
  }

  const { error: insertErr } = await supabase.from("promises_to_pay").insert({
    account_holder_id: holder.id,
    amount_cents: promise.amountCents,
    currency: promise.currency || "EUR",
    due_date: promise.dueDate,
    status: promise.status || "active",
  });

  if (insertErr) {
    throw new Error(`Failed to record promise: ${insertErr.message}`);
  }

  const refreshed = await fetchAccountContext(accountId);
  if (!refreshed) throw new Error("Failed to load refreshed context");
  return refreshed;
}

// Record a transaction
export async function createTransaction(
  accountId: string,
  txn: Omit<Transaction, "id">,
): Promise<AccountContext> {
  const supabase = createServerSupabaseClient();

  const { data: holder, error: fetchErr } = await supabase
    .from("account_holders")
    .select("id, balance_cents")
    .eq("account_id", accountId)
    .single();

  if (fetchErr || !holder) {
    throw new Error(`Account holder with reference ${accountId} not found.`);
  }

  const { error: insertErr } = await supabase.from("transactions").insert({
    account_holder_id: holder.id,
    type: txn.type,
    status: txn.status,
    amount_cents: txn.amountCents,
    currency: txn.currency || "EUR",
    description: txn.description,
    transaction_date: txn.transactionDate,
  });

  if (insertErr) {
    throw new Error(`Failed to insert transaction: ${insertErr.message}`);
  }

  // If this is a completed payment transaction, deduct it from balance!
  if (txn.type === "payment" && txn.status === "completed") {
    const nextBalance = Math.max(0, holder.balance_cents - txn.amountCents);
    await updateAccountHolder(accountId, { balanceCents: nextBalance });
  }

  const refreshed = await fetchAccountContext(accountId);
  if (!refreshed) throw new Error("Failed to load refreshed context");
  return refreshed;
}

// Schedule a call appointment
export async function createCallAppointment(
  accountId: string,
  call: Omit<CallAppointment, "id">,
): Promise<AccountContext> {
  const supabase = createServerSupabaseClient();

  const { data: holder, error: fetchErr } = await supabase
    .from("account_holders")
    .select("id")
    .eq("account_id", accountId)
    .single();

  if (fetchErr || !holder) {
    throw new Error(`Account holder with reference ${accountId} not found.`);
  }

  const { error: insertErr } = await supabase.from("call_appointments").insert({
    account_holder_id: holder.id,
    scheduled_at: call.scheduledAt,
    phone: call.phone,
    reason: call.reason || null,
    status: call.status || "scheduled",
  });

  if (insertErr) {
    throw new Error(`Failed to record call appointment: ${insertErr.message}`);
  }

  const refreshed = await fetchAccountContext(accountId);
  if (!refreshed) throw new Error("Failed to load refreshed context");
  return refreshed;
}

// Seed fixtures if the database tables are empty
export async function seedFixturesIfEmpty(supabase: any): Promise<void> {
  const { count, error } = await supabase
    .from("account_holders")
    .select("*", { count: "exact", head: true });

  if (error || count === null || count > 0) {
    return;
  }

  const fixtures = [standardFixture, disputeFixture, hardshipFixture];

  for (const f of fixtures) {
    // 1. Insert account holder
    const { data: holder, error: holderErr } = await supabase
      .from("account_holders")
      .insert({
        account_id: f.account.accountId,
        first_name: f.account.debtorFirstName,
        last_name: f.account.debtorLastName,
        email: f.account.email,
        phone: f.account.phone,
        address_line1: f.account.address.line1,
        address_line2: f.account.address.line2 || null,
        city: f.account.address.city,
        postal_code: f.account.address.postalCode,
        country: f.account.address.country,
        preferred_contact_method: f.account.preferredContactMethod,
        reference: f.account.reference,
        creditor_name: f.account.creditorName,
        currency: f.account.currency,
        balance_cents: f.account.balanceCents,
        status: f.account.status,
        days_past_due: f.account.daysPastDue,
        minimum_payment_cents: f.account.minimumPaymentCents,
        last_payment_date: f.account.lastPaymentDate || null,
        last_payment_amount_cents: f.account.lastPaymentAmountCents,
      })
      .select("id")
      .single();

    if (holderErr || !holder) continue;

    // 2. Insert related people
    if (f.relatedPeople && f.relatedPeople.length > 0) {
      for (const p of f.relatedPeople) {
        await supabase.from("related_people").insert({
          account_holder_id: holder.id,
          name: p.name,
          email: p.email,
          phone: p.phone,
          relationship: p.relationship || null,
          authorized_to_act: p.authorizedToAct,
        });
      }
    }

    // 3. Insert promises to pay
    if (f.promisesToPay && f.promisesToPay.length > 0) {
      for (const p of f.promisesToPay) {
        await supabase.from("promises_to_pay").insert({
          account_holder_id: holder.id,
          amount_cents: p.amountCents,
          currency: p.currency,
          due_date: p.dueDate,
          status: p.status,
          created_at: p.createdAt,
        });
      }
    }

    // 4. Insert transactions
    if (f.transactions && f.transactions.length > 0) {
      for (const t of f.transactions) {
        await supabase.from("transactions").insert({
          account_holder_id: holder.id,
          type: t.type,
          status: t.status,
          amount_cents: t.amountCents,
          currency: t.currency,
          description: t.description,
          transaction_date: t.transactionDate,
        });
      }
    }

    // 5. Insert call appointments
    if (f.callAppointments && f.callAppointments.length > 0) {
      for (const c of f.callAppointments) {
        await supabase.from("call_appointments").insert({
          account_holder_id: holder.id,
          scheduled_at: c.scheduledAt,
          phone: c.phone,
          reason: c.reason || null,
          status: c.status,
        });
      }
    }
  }
}
