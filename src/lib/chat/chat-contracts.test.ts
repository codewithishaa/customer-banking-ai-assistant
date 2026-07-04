/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock the server-side Supabase client & environment variables
vi.mock("../supabase/server", () => {
  return {
    createServerSupabaseClient: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: "mock-holder-uuid" }, error: null }),
            order: () => ({ data: [], error: null }),
          }),
        }),
        insert: async () => ({ error: null }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }),
    }),
  };
});

// Mock notification module
const mockSendNotification = vi.fn();
vi.mock("../notifications/account-change-notification", () => {
  return {
    sendAccountChangeNotification: (payload: any) => mockSendNotification(payload),
  };
});

// Mock database functions to isolate chat router routing logic
const mockFetchAccountContext = vi.fn();
const mockUpdateAccountHolder = vi.fn();
const mockAddRelatedPerson = vi.fn();
const mockUpdateRelatedPerson = vi.fn();
const mockRemoveRelatedPerson = vi.fn();
const mockCreatePromiseToPay = vi.fn();
const mockCreateTransaction = vi.fn();
const mockCreateCallAppointment = vi.fn();

vi.mock("../account/db", () => {
  return {
    fetchAccountContext: (id: string) => mockFetchAccountContext(id),
    updateAccountHolder: (id: string, up: any) => mockUpdateAccountHolder(id, up),
    addRelatedPerson: (id: string, p: any) => mockAddRelatedPerson(id, p),
    updateRelatedPerson: (id: string, name: string, up: any) => mockUpdateRelatedPerson(id, name, up),
    removeRelatedPerson: (id: string, name: string, email?: string) => mockRemoveRelatedPerson(id, name, email),
    createPromiseToPay: (id: string, pr: any) => mockCreatePromiseToPay(id, pr),
    createTransaction: (id: string, tx: any) => mockCreateTransaction(id, tx),
    createCallAppointment: (id: string, call: any) => mockCreateCallAppointment(id, call),
  };
});

import { POST } from "@/app/api/chat/route";

describe("chat action acceptance contracts", () => {
  let mockContext: any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00+01:00"));
    vi.clearAllMocks();

    mockContext = {
      account: {
        accountId: "acc_standard_001",
        accountHolderFirstName: "Jane",
        accountHolderLastName: "Murphy",
        email: "jane.murphy@example.test",
        phone: "+353831234567",
        address: { line1: "12 River Walk", line2: "Rathmines", city: "Dublin", postalCode: "D06 X123", country: "Ireland" },
        preferredContactMethod: "email",
        reference: "EI-2026-000123",
        creditorName: "Example Energy Ireland",
        currency: "EUR",
        balanceCents: 128500,
        status: "overdue",
        daysPastDue: 47,
        minimumPaymentCents: 2500,
        lastPaymentDate: "2026-01-10",
        lastPaymentAmountCents: 5000,
      },
      billing: { currentAmountCents: 128500, lastStatementAmountCents: 116000, dueDate: "2026-01-24" },
      paymentOptions: { payNowEnabled: true, promiseToPayEnabled: true, mockPaymentsEnabled: true, arrangementEnabled: false, eligibleArrangementOptions: [] },
      support: { humanSupportAvailable: true, supportPhone: "+35318000000", supportEmail: "support@example.test" },
      relatedPeople: [],
      promisesToPay: [],
      transactions: [],
      callAppointments: [],
    };

    mockFetchAccountContext.mockResolvedValue(mockContext);
    mockUpdateAccountHolder.mockImplementation((id, updates) => {
      mockContext.account = { ...mockContext.account, ...updates };
      return Promise.resolve(mockContext);
    });
    mockAddRelatedPerson.mockImplementation((id, p) => {
      const merged = { ...mockContext };
      merged.relatedPeople = [...merged.relatedPeople, { id: "rel_123", ...p }];
      return Promise.resolve(merged);
    });
    mockUpdateRelatedPerson.mockImplementation((id, name, updates) => {
      const merged = { ...mockContext };
      merged.relatedPeople = merged.relatedPeople.map((p: any) =>
        p.name === name ? { ...p, ...updates } : p
      );
      return Promise.resolve(merged);
    });
    mockRemoveRelatedPerson.mockImplementation((id, name, email) => {
      const matches = mockContext.relatedPeople.filter((p: any) => p.name.toLowerCase() === name.toLowerCase());
      if (!email && matches.length > 1) {
        const uniqueEmails = Array.from(new Set(matches.map((p: any) => p.email).filter(Boolean)));
        if (uniqueEmails.length > 1) {
          return Promise.reject(new Error(`I found multiple people named ${name}. Please specify the email address: ${uniqueEmails.join(", ")}.`));
        }
      }
      const merged = { ...mockContext };
      merged.relatedPeople = merged.relatedPeople.filter((p: any) => {
        if (email) {
          return !(p.name.toLowerCase() === name.toLowerCase() && p.email?.toLowerCase() === email.toLowerCase());
        }
        return p.name.toLowerCase() !== name.toLowerCase();
      });
      return Promise.resolve(merged);
    });
    mockCreatePromiseToPay.mockImplementation((id, pr) => {
      const merged = { ...mockContext };
      merged.promisesToPay = [...merged.promisesToPay, { id: "ptp_123", ...pr }];
      return Promise.resolve(merged);
    });
    mockCreateTransaction.mockImplementation((id, tx) => {
      const merged = { ...mockContext };
      merged.transactions = [...merged.transactions, { id: "txn_123", ...tx }];
      if (tx.type === "payment" && tx.status === "completed") {
        merged.account.balanceCents -= tx.amountCents;
      }
      return Promise.resolve(merged);
    });
    mockCreateCallAppointment.mockImplementation((id, call) => {
      const merged = { ...mockContext };
      merged.callAppointments = [...merged.callAppointments, { id: "call_123", ...call }];
      return Promise.resolve(merged);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates the account holder phone number and queues a redacted notification", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        accountId: "acc_standard_001",
        message: "Change my phone number to +353831112233",
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.result.success).toBe(true);
    expect(mockUpdateAccountHolder).toHaveBeenCalledWith("acc_standard_001", {
      phone: "+353831112233",
    });
    expect(mockSendNotification).toHaveBeenCalled();
  });

  it("adds an authorized related person with name, email, and phone", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        accountId: "acc_standard_001",
        message: "Add Mark Murphy, mark@example.test, +353831998877 so he can act for me",
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.result.success).toBe(true);
    expect(mockAddRelatedPerson).toHaveBeenCalledWith("acc_standard_001", {
      name: "Mark Murphy",
      email: "mark@example.test",
      phone: "+353831998877",
      relationship: "Representative",
      authorizedToAct: true,
    });
    expect(mockSendNotification).toHaveBeenCalled();
  });

  it("records a one-time promise to pay with amount and future due date", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        accountId: "acc_standard_001",
        message: "Can I pay 500 euro on the 1st of next month?",
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.result.success).toBe(true);
    expect(mockCreatePromiseToPay).toHaveBeenCalled();
    const args = mockCreatePromiseToPay.mock.calls[0][1];
    expect(args.amountCents).toBe(50000);
    expect(args.dueDate).toMatch(/2026-08-01|2026-07-\d{2}/);
  });

  it("records a mocked payment transaction and deducts it from balance", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        accountId: "acc_standard_001",
        message: "Pay 150 euro now",
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.result.success).toBe(true);
    expect(mockCreateTransaction).toHaveBeenCalledWith("acc_standard_001", expect.objectContaining({
      type: "payment",
      amountCents: 15000,
    }));
    expect(body.result.account.account.balanceCents).toBe(113500); // 128500 - 15000
  });

  it("books a future call appointment and rejects dates in the past", async () => {
    // 1. Future Call
    const reqFuture = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        accountId: "acc_standard_001",
        message: "Book a call next Tuesday at 10am about my bill",
      }),
    });
    const resFuture = await POST(reqFuture);
    const bodyFuture = await resFuture.json();

    expect(resFuture.status).toBe(200);
    expect(bodyFuture.result.success).toBe(true);
    expect(mockCreateCallAppointment).toHaveBeenCalledWith("acc_standard_001", expect.objectContaining({
      scheduledAt: "2026-07-07T10:00:00+01:00",
      reason: "my bill",
      phone: "+353831234567"
    }));

    // 2. Past Call
    const reqPast = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        accountId: "acc_standard_001",
        message: "Book a call yesterday at 10am.",
      }),
    });
    mockCreateCallAppointment.mockClear();
    const resPast = await POST(reqPast);
    const bodyPast = await resPast.json();

    expect(bodyPast.result.success).toBe(false);
    expect(bodyPast.result.reply).toContain("past");
    expect(mockCreateCallAppointment).not.toHaveBeenCalled();
  });

  describe("PayPathIQ offline routing and safety checks", () => {
    const originalEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
      originalEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      originalEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
      originalEnv.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
      originalEnv.GEMINI_API_KEY = process.env.GEMINI_API_KEY;

      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GEMINI_API_KEY;
    });

    afterEach(() => {
      process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
      process.env.ANTHROPIC_API_KEY = originalEnv.ANTHROPIC_API_KEY;
      process.env.OPENROUTER_API_KEY = originalEnv.OPENROUTER_API_KEY;
      process.env.GEMINI_API_KEY = originalEnv.GEMINI_API_KEY;
    });

    it("missing LLM keys use offline parser", async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GEMINI_API_KEY;

      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "What phone number is on my account?",
        }),
      });

      const res = await POST(req);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.result.action).toBe("read_account");
    });

    it("placeholder LLM keys do not call providers", async () => {
      process.env.OPENAI_API_KEY = "sk-your-openai-key";
      process.env.ANTHROPIC_API_KEY = "sk-ant-your-anthropic-key";
      process.env.OPENROUTER_API_KEY = "sk-or-your-openrouter-key";

      const fetchSpy = vi.spyOn(global, "fetch");

      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "What is my balance?",
        }),
      });

      const res = await POST(req);
      const body = await res.json();
      expect(body.result.action).toBe("read_account");
      
      const llmCalls = fetchSpy.mock.calls.filter(c => 
        c[0].toString().includes("api.openai") || 
        c[0].toString().includes("api.anthropic") || 
        c[0].toString().includes("openrouter.ai")
      );
      expect(llmCalls.length).toBe(0);
      fetchSpy.mockRestore();
    });

    it("unexpected provider response shape falls back safely", async () => {
      process.env.OPENAI_API_KEY = "test-openai-key";
      
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({})
      } as any);

      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "What is my balance?",
        }),
      });

      const res = await POST(req);
      const body = await res.json();
      expect(body.result.action).toBe("read_account");
      fetchSpy.mockRestore();
    });

    it("name lookup", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "What is my name?",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.action).toBe("read_account");
      expect(body.result.reply).toBe("Your name on the account is Jane Murphy.");
    });

    it("Change my name to David updates the account holder name and triggers notification", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Change my name to David",
        }),
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.result.success).toBe(true);
      expect(body.result.action).toBe("update_account_holder");
      expect(body.result.reply).toContain("David");
      expect(mockUpdateAccountHolder).toHaveBeenCalledWith("acc_standard_001", {
        accountHolderFirstName: "David",
        accountHolderLastName: "",
      });
      expect(mockSendNotification).toHaveBeenCalled();
    });

    it("What is my name? returns the updated name after update", async () => {
      // 1. Update the name
      const reqUpdate = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Change my name to David",
        }),
      });
      await POST(reqUpdate);

      // 2. Query the name
      const reqQuery = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "What is my name?",
        }),
      });
      const res = await POST(reqQuery);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.result.action).toBe("read_account");
      expect(body.result.reply).toBe("Your name on the account is David.");
    });

    it("empty/invalid name is rejected", async () => {
      const invalidNames = [
        "Change my name to ",
        "Update my name to 123",
        "My name should be David1",
        "Change my name to a",
        "Change my name to ???",
      ];

      for (const nameMessage of invalidNames) {
        const req = new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({
            accountId: "acc_standard_001",
            message: nameMessage,
          }),
        });

        const res = await POST(req);
        const body = await res.json();
        expect(body.result.success).toBe(false);
        expect(body.result.reply).toContain("format");
      }
    });

    it("invalid name update does not trigger notification or update db", async () => {
      mockSendNotification.mockClear();
      mockUpdateAccountHolder.mockClear();

      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Change my name to David123",
        }),
      });

      const res = await POST(req);
      const body = await res.json();

      expect(body.result.success).toBe(false);
      expect(mockUpdateAccountHolder).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("read-name question does not trigger notification", async () => {
      mockSendNotification.mockClear();

      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "What is my name?",
        }),
      });

      await POST(req);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("postal address update success and read-back", async () => {
      // 1. Update address
      const reqUpdate = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Change my postal address to 12 Test Street, Dublin 2, Ireland.",
        }),
      });
      const resUpdate = await POST(reqUpdate);
      const bodyUpdate = await resUpdate.json();

      expect(resUpdate.status).toBe(200);
      expect(bodyUpdate.result.success).toBe(true);
      expect(bodyUpdate.result.reply).toContain("12 Test Street, Dublin 2, Ireland");
      expect(mockUpdateAccountHolder).toHaveBeenCalledWith("acc_standard_001", {
        address: {
          line1: "12 Test Street",
          line2: undefined,
          city: "Dublin 2",
          postalCode: "",
          country: "Ireland",
        },
      });

      // 2. Read back address
      const reqRead = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "What is my postal address?",
        }),
      });
      const resRead = await POST(reqRead);
      const bodyRead = await resRead.json();
      expect(bodyRead.result.reply).toBe("Your postal address is 12 Test Street, Dublin 2, Ireland.");
    });

    it("postal address update preserves the exact user-provided address and does not merge old address components like Rathmines", async () => {
      mockContext.account.address = {
        line1: "12 River Walk",
        line2: "Rathmines",
        city: "Dublin",
        postalCode: "D06 X123",
        country: "Ireland",
      };

      // 1. Update address
      const reqUpdate = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Change my postal address to 12 GrandCanal, Dublin 8, Ireland.",
        }),
      });
      const resUpdate = await POST(reqUpdate);
      const bodyUpdate = await resUpdate.json();

      expect(resUpdate.status).toBe(200);
      expect(bodyUpdate.result.success).toBe(true);

      // 2. Read back address
      const reqRead = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "What is my address?",
        }),
      });
      const resRead = await POST(reqRead);
      const bodyRead = await resRead.json();
      expect(bodyRead.result.reply).toBe("Your postal address is 12 GrandCanal, Dublin 8, Ireland.");
      expect(bodyRead.result.reply).not.toContain("Rathmines");
      expect(bodyRead.result.reply).not.toContain("D06 X123");
    });

    it("invalid/empty postal address rejection", async () => {
      const invalidAddresses = [
        "Change my postal address to ",
        "Change my address to short",
        "Update my address to NoCommas",
      ];

      for (const addrMsg of invalidAddresses) {
        const req = new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({
            accountId: "acc_standard_001",
            message: addrMsg,
          }),
        });
        const res = await POST(req);
        const body = await res.json();
        expect(body.result.success).toBe(false);
        expect(body.result.reply).toContain("format");
      }
    });

    it("address update triggers notification and uses updated address in PDF snapshot", async () => {
      mockSendNotification.mockClear();
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Change my address to 12 Test Street, Dublin 2, Ireland",
        }),
      });
      await POST(req);
      expect(mockSendNotification).toHaveBeenCalled();
      const payload = mockSendNotification.mock.calls[0][0];
      expect(payload.accountSnapshot.account.address).toEqual({
        line1: "12 Test Street",
        line2: undefined,
        city: "Dublin 2",
        postalCode: "",
        country: "Ireland",
      });
    });

    it("invalid empty/short address does not update and does not trigger notification", async () => {
      mockSendNotification.mockClear();
      mockUpdateAccountHolder.mockClear();

      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Change my address to ",
        }),
      });
      await POST(req);
      expect(mockUpdateAccountHolder).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("related-person missing-details follow-up completes successfully", async () => {
      mockSendNotification.mockClear();
      mockAddRelatedPerson.mockClear();

      // 1. Initial request with missing details
      const req1 = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          conversationId: "conv-follow-up-test",
          message: "Add my brother so he can speak for me",
        }),
      });
      const res1 = await POST(req1);
      const body1 = await res1.json();
      expect(body1.result.success).toBe(false);
      expect(body1.result.reply).toContain("Please provide the related person's name, email, and phone");
      expect(mockAddRelatedPerson).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();

      // 2. Follow-up completing the missing details
      const req2 = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          conversationId: "conv-follow-up-test",
          message: "David, david@gmail.com, +353786786789",
        }),
      });
      const res2 = await POST(req2);
      const body2 = await res2.json();
      expect(body2.result.success).toBe(true);
      expect(body2.result.reply).toContain("successfully added David");
      expect(mockAddRelatedPerson).toHaveBeenCalledWith("acc_standard_001", {
        name: "David",
        email: "david@gmail.com",
        phone: "+353786786789",
        relationship: "brother",
        authorizedToAct: true,
      });
      expect(mockSendNotification).toHaveBeenCalled();
    });

    it("related-person confirmation fallback workflow", async () => {
      mockSendNotification.mockClear();
      mockAddRelatedPerson.mockClear();

      // 1. Send details out of nowhere
      const req1 = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          conversationId: "conv-fallback-test",
          message: "David, david@gmail.com, +353786786789",
        }),
      });
      const res1 = await POST(req1);
      const body1 = await res1.json();
      expect(body1.result.success).toBe(false);
      expect(body1.result.reply).toContain("Do you want me to add this person");
      expect(mockAddRelatedPerson).not.toHaveBeenCalled();

      // 2. Confirm adding them
      const req2 = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          conversationId: "conv-fallback-test",
          message: "Yes please",
        }),
      });
      const res2 = await POST(req2);
      const body2 = await res2.json();
      expect(body2.result.success).toBe(true);
      expect(body2.result.reply).toContain("successfully added David");
      expect(mockAddRelatedPerson).toHaveBeenCalledWith("acc_standard_001", {
        name: "David",
        email: "david@gmail.com",
        phone: "+353786786789",
        relationship: "Representative",
        authorizedToAct: false,
      });
      expect(mockSendNotification).toHaveBeenCalled();
    });

    it("related people read wording variants", async () => {
      const wordings = [
        "show people related to me",
        "show the people linked to me",
        "who is linked to my account?",
        "who can speak for me?",
        "show related people",
      ];

      for (const msg of wordings) {
        const req = new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({
            accountId: "acc_standard_001",
            message: msg,
          }),
        });
        const res = await POST(req);
        const body = await res.json();
        expect(body.result.action).toBe("read_related_people");
      }
    });

    it("name update trims trailing punctuation", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Change my name to David Murphy.",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.reply).toBe("I have updated the account holder name to David Murphy.");
      expect(mockUpdateAccountHolder).toHaveBeenCalledWith("acc_standard_001", {
        accountHolderFirstName: "David",
        accountHolderLastName: "Murphy",
      });
    });

    it("future calls list excludes past calls", async () => {
      // Current system time is set to 2026-07-04T12:00:00+01:00
      mockContext.callAppointments = [
        { id: "c1", scheduledAt: "2026-07-02T10:00:00+01:00", phone: "+353831234567", reason: "Past call", status: "scheduled" },
        { id: "c2", scheduledAt: "2026-07-07T10:00:00+01:00", phone: "+353831234567", reason: "Future call", status: "scheduled" },
      ];

      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "What calls do I have booked?",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.reply).toContain("Future call");
      expect(body.result.reply).not.toContain("Past call");
    });

    it("next Tuesday at 10am displays as 10:00", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Book a call next Tuesday at 10am about my bill",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.reply).toContain("10:00");
    });

    it("postal address lookup", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "What is my postal address?",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.action).toBe("read_account");
      expect(body.result.reply).toBe("Your postal address is 12 River Walk, Rathmines, Dublin, D06 X123, Ireland.");
    });

    it("balance lookup", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "What is my balance?",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.action).toBe("read_account");
      expect(body.result.reply).toBe("Your current outstanding balance is €1,285.00.");
    });

    it("amount-owed-specific response", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "How much do I owe?",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.action).toBe("read_account");
      expect(body.result.reply).toBe("You currently owe €1,285.00.");
    });

    it("full summary only when user asks for account details", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Show my account details.",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.action).toBe("read_account");
      expect(body.result.reply).toContain("Your account details are as follows:");
      expect(body.result.reply).toContain("Full Name: Jane Murphy");
      expect(body.result.reply).toContain("Current Balance: €1,285.00");
    });

    it("related people listing", async () => {
      mockContext.relatedPeople = [
        { id: "rp_123", name: "Mark Murphy", phone: "+353831110000", email: "mark@example.test", relationship: "Representative", authorizedToAct: true }
      ];
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Show people linked to my account.",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.action).toBe("read_related_people");
      expect(body.result.reply).toContain("Mark Murphy");
      expect(body.result.reply).toContain("Representative");
      expect(body.result.reply).toContain("+353831110000");
      expect(body.result.reply).toContain("mark@example.test");
    });

    it("invalid email rejection does not trigger notification", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Change my email to wrongemail",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.action).toBe("update_account_holder");
      expect(body.result.success).toBe(false);
      expect(mockUpdateAccountHolder).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("invalid preferred contact method rejection does not trigger notification", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Change my preferred contact method to WhatsApp",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.action).toBe("update_preferred_contact_method");
      expect(body.result.success).toBe(false);
      expect(mockUpdateAccountHolder).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("preferred contact method lookup", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "What is my preferred contact method?",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.action).toBe("read_preferred_contact_method");
      expect(body.result.reply).toBe("Your preferred contact method is email.");
    });

    it("read-only action does not trigger notification", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "What phone number is on my account?",
        }),
      });
      await POST(req);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("successful update action triggers notification", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Change my phone number to +353831112233",
        }),
      });
      await POST(req);
      expect(mockSendNotification).toHaveBeenCalled();
    });

    it("successful related person update triggers notification", async () => {
      mockContext.relatedPeople = [{ id: "rp_123", name: "Mark", phone: "+353831110000", relationship: "Representative", authorizedToAct: true }];
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Change Mark's phone number to +353831112233",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.success).toBe(true);
      expect(mockUpdateRelatedPerson).toHaveBeenCalledWith("acc_standard_001", "Mark", { phone: "+353831112233" });
      expect(mockSendNotification).toHaveBeenCalled();
    });

    it("successful promise to pay triggers notification", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Can I pay 500 euro on the 1st of next month?",
        }),
      });
      await POST(req);
      expect(mockSendNotification).toHaveBeenCalled();
    });

    it("successful mocked payment triggers notification", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Pay 150 euro now",
        }),
      });
      await POST(req);
      expect(mockSendNotification).toHaveBeenCalled();
    });

    it("successful call booking triggers notification", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Book a call next Tuesday at 10am about my bill",
        }),
      });
      await POST(req);
      expect(mockSendNotification).toHaveBeenCalled();
    });

    it("invalid past call booking does not trigger notification", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Book a call yesterday",
        }),
      });
      await POST(req);
      expect(mockCreateCallAppointment).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("invalid payment amount does not trigger notification", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Pay -50 euro now",
        }),
      });
      await POST(req);
      expect(mockCreateTransaction).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("add related person brother asks for missing fields", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Add my brother so he can speak for me.",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.success).toBe(false);
      expect(body.result.missingFields).toContain("name");
      expect(body.result.missingFields).toContain("email");
      expect(body.result.missingFields).toContain("phone");
      expect(mockAddRelatedPerson).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("remove related person test", async () => {
      mockContext.relatedPeople = [{ id: "rp_123", name: "Mark Murphy", phone: "+353831110000", relationship: "Representative", authorizedToAct: true }];
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Remove Mark Murphy from my account.",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.success).toBe(true);
      expect(mockRemoveRelatedPerson).toHaveBeenCalledWith("acc_standard_001", "Mark Murphy", undefined);
      expect(mockSendNotification).toHaveBeenCalled();

      // Verify removed person no longer appears in the returned list
      const list = body.result.relatedPeople;
      expect(list.some((p: any) => p.name === "Mark Murphy")).toBe(false);
    });

    it("remove related person by name and email", async () => {
      mockContext.relatedPeople = [
        { id: "rp_123", name: "Mark Murphy", email: "mark@example.test", phone: "+353831110000", relationship: "Representative", authorizedToAct: true },
        { id: "rp_456", name: "Mark Murphy", email: "mark2@example.test", phone: "+353831112222", relationship: "Representative", authorizedToAct: true }
      ];
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Remove Mark Murphy with email mark@example.test from my account.",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.success).toBe(true);
      expect(mockRemoveRelatedPerson).toHaveBeenCalledWith("acc_standard_001", "Mark Murphy", "mark@example.test");
      expect(mockSendNotification).toHaveBeenCalled();

      // Verify removed person no longer appears in the returned list
      const list = body.result.relatedPeople;
      const emails = list.map((p: any) => p.email);
      expect(emails).not.toContain("mark@example.test");
      expect(emails).toContain("mark2@example.test");
    });

    it("remove related person duplicate name asks for email clarification and does not trigger notification", async () => {
      mockContext.relatedPeople = [
        { id: "rp_123", name: "Mark Murphy", email: "mark@example.test", phone: "+353831110000", relationship: "Representative", authorizedToAct: true },
        { id: "rp_456", name: "Mark Murphy", email: "mark2@example.test", phone: "+353831112222", relationship: "Representative", authorizedToAct: true }
      ];
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Remove Mark Murphy from my account.",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.success).toBe(false);
      expect(body.result.reply).toContain("Please specify the email address");
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("show transactions test", async () => {
      mockContext.transactions = [
        { id: "txn_001", transactionDate: "2026-07-01", description: "Opening balance", amountCents: 128500, type: "charge", status: "completed" },
        { id: "txn_002", transactionDate: "2026-07-03", description: "Mocked payment via chat", amountCents: 15000, type: "payment", status: "completed" }
      ];
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Show my transactions.",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.action).toBe("read_transactions");
      expect(body.result.reply).toContain("Opening balance of €1285.00");
      expect(body.result.reply).toContain("Mocked payment via chat of €150.00");
    });

    it("show promises test", async () => {
      mockContext.promisesToPay = [
        { id: "ptp_001", dueDate: "2026-08-01", amountCents: 50000, status: "active", currency: "EUR" }
      ];
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Show my promises to pay.",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.action).toBe("read_promises_to_pay");
      expect(body.result.reply).toContain("€500.00 due on 2026-08-01");
    });

    it("show calls test", async () => {
      mockContext.callAppointments = [
        { id: "call_001", scheduledAt: "2026-07-07T10:00:00+01:00", phone: "+353831234567", reason: "Discuss bill", status: "scheduled" }
      ];
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "What calls do I have booked?",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.action).toBe("read_call_appointments");
      expect(body.result.reply).toContain("7/7/2026");
      expect(body.result.reply).toContain("Discuss bill");
      expect(body.result.reply).toContain("+353831234567");
    });

    it("email lookup test", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "What email address is on my account?",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.action).toBe("read_account");
      expect(body.result.reply).toBe("The email address on your account is jane.murphy@example.test.");
    });

    it("phone lookup test", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "What phone number is on my account?",
        }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.result.action).toBe("read_account");
      expect(body.result.reply).toBe("The phone number on your account is +353831234567.");
    });

    it("chatbot action still returns success even if notification/PDF fails", async () => {
      mockSendNotification.mockRejectedValueOnce(new Error("PDF generation failed"));
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          accountId: "acc_standard_001",
          message: "Change my phone number to +353831112233",
        }),
      });

      const res = await POST(req);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.result.success).toBe(true); // Persisted data-change succeeded
      expect(body.result.reply).toContain("successfully updated");
    });

    describe("PayPathIQ chatbot workflow fallback and guidance tests", () => {
      it("unrelated question returns supported-actions fallback and does not notify or mutate DB", async () => {
        mockSendNotification.mockClear();
        mockUpdateAccountHolder.mockClear();

        const messages = ["hello", "hi", "what is the weather", "asdfgh", "help", "update my details", "please help me"];
        for (const msg of messages) {
          const req = new Request("http://localhost/api/chat", {
            method: "POST",
            body: JSON.stringify({
              accountId: "acc_standard_001",
              message: msg,
            }),
          });
          const res = await POST(req);
          const body = await res.json();
          expect(body.result.success).toBe(false);
          expect(body.result.reply).toContain("I can help with account self-service only");
          expect(body.result.reply).toContain("Change my postal address to 12 River Walk");
          expect(mockSendNotification).not.toHaveBeenCalled();
          expect(mockUpdateAccountHolder).not.toHaveBeenCalled();
        }
      });

      it("incomplete read messages return account read guidance", async () => {
        const messages = ["details", "account", "show account", "show details"];
        for (const msg of messages) {
          const req = new Request("http://localhost/api/chat", {
            method: "POST",
            body: JSON.stringify({
              accountId: "acc_standard_001",
              message: msg,
            }),
          });
          const res = await POST(req);
          const body = await res.json();
          expect(body.result.success).toBe(true);
          expect(body.result.reply).toContain("I can show specific account details. Please ask one of:");
        }
      });

      it("incomplete contact holder updates return correct format guidance", async () => {
        const testCases = [
          { msg: "change my name", expected: "Change my name to Jane Murphy" },
          { msg: "update my name", expected: "Change my name to Jane Murphy" },
          { msg: "name change", expected: "Change my name to Jane Murphy" },
          { msg: "change my email", expected: "Change my email to jane@example.com" },
          { msg: "update my email", expected: "Change my email to jane@example.com" },
          { msg: "email change", expected: "Change my email to jane@example.com" },
          { msg: "change my phone", expected: "Change my phone number to +353831234567" },
          { msg: "update my phone", expected: "Change my phone number to +353831234567" },
          { msg: "phone change", expected: "Change my phone number to +353831234567" },
          { msg: "change my address", expected: "Change my postal address to 12 River Walk" },
          { msg: "update my address", expected: "Change my postal address to 12 River Walk" },
          { msg: "address change", expected: "Change my postal address to 12 River Walk" },
          { msg: "change contact method", expected: "Change my preferred contact method to email" },
          { msg: "contact method", expected: "Change my preferred contact method to email" }
        ];

        for (const tc of testCases) {
          const req = new Request("http://localhost/api/chat", {
            method: "POST",
            body: JSON.stringify({
              accountId: "acc_standard_001",
              message: tc.msg,
            }),
          });
          const res = await POST(req);
          const body = await res.json();
          expect(body.result.success).toBe(false);
          expect(body.result.reply).toContain(tc.expected);
        }
      });

      it("related people read variants and incomplete add/update/remove return format guidance", async () => {
        // Read variants
        const readVariants = [
          "Show people linked to my account.",
          "Show related people.",
          "show people related to me",
          "who can speak for me?",
          "who is linked to my account?",
          "list related people",
          "linked people",
          "related people"
        ];
        for (const msg of readVariants) {
          const req = new Request("http://localhost/api/chat", {
            method: "POST",
            body: JSON.stringify({
              accountId: "acc_standard_001",
              message: msg,
            }),
          });
          const res = await POST(req);
          const body = await res.json();
          expect(body.result.action).toBe("read_related_people");
        }

        // Incomplete add
        const addReq = new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({
            accountId: "acc_standard_001",
            message: "add my brother",
          }),
        });
        const addBody = await (await POST(addReq)).json();
        expect(addBody.result.success).toBe(false);
        expect(addBody.result.reply).toContain("Add John Murphy, john@example.com, +353831987654 so he can act for me.");

        // Incomplete update
        const updateReq = new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({
            accountId: "acc_standard_001",
            message: "update related person",
          }),
        });
        const updateBody = await (await POST(updateReq)).json();
        expect(updateBody.result.success).toBe(false);
        expect(updateBody.result.reply).toContain("Example: Change Mark's phone number to +353831112233.");

        // Incomplete remove
        const removeReq = new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({
            accountId: "acc_standard_001",
            message: "remove someone",
          }),
        });
        const removeBody = await (await POST(removeReq)).json();
        expect(removeBody.result.success).toBe(false);
        expect(removeBody.result.reply).toContain("Example: Remove Mark Murphy with email mark@example.test from my account.");
      });

      it("payments, promises, and calls incomplete queries return format guidance", async () => {
        // Incomplete mocked payment
        const payReq = new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({
            accountId: "acc_standard_001",
            message: "pay now",
          }),
        });
        const payBody = await (await POST(payReq)).json();
        expect(payBody.result.success).toBe(false);
        expect(payBody.result.reply).toContain("Pay 10 euro now.");

        // Incomplete promise
        const promiseReq = new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({
            accountId: "acc_standard_001",
            message: "promise to pay",
          }),
        });
        const promiseBody = await (await POST(promiseReq)).json();
        expect(promiseBody.result.success).toBe(false);
        expect(promiseBody.result.reply).toContain("Can I pay 500 euro on the 1st of next month?");

        // Incomplete call booking
        const callReq = new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({
            accountId: "acc_standard_001",
            message: "call me",
          }),
        });
        const callBody = await (await POST(callReq)).json();
        expect(callBody.result.success).toBe(false);
        expect(callBody.result.reply).toContain("Book a call next Tuesday at 10am about my bill.");
      });
    });
  });
});
