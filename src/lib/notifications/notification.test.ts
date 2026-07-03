/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { generateEncryptedAccountPdf } from "./pdf-generator";
import { sendAccountChangeNotification } from "./account-change-notification";

vi.mock("../supabase/server", () => {
  return {
    createServerSupabaseClient: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: "mock-holder-uuid" }, error: null }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({ data: { id: "attempt_123" }, error: null }),
          }),
        }),
      }),
    }),
  };
});

describe("PayPathIQ Notification and Encryption Contracts", () => {
  const mockContext: any = {
    account: {
      accountId: "acc_standard_001",
      accountHolderFirstName: "Jane",
      accountHolderLastName: "Murphy",
      email: "jane.murphy@example.test",
      phone: "+353831234567",
      address: {
        line1: "12 River Walk",
        city: "Dublin",
        postalCode: "D06 X123",
        country: "Ireland",
      },
      preferredContactMethod: "email",
      reference: "EI-2026-000123",
      creditorName: "Example Energy Ireland",
      currency: "EUR",
      balanceCents: 128500,
      status: "overdue",
      daysPastDue: 47,
    },
    relatedPeople: [],
    promisesToPay: [],
    transactions: [],
    callAppointments: [],
  };

  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.RESEND_API_KEY = process.env.RESEND_API_KEY;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = originalEnv.RESEND_API_KEY;
  });

  it("generateEncryptedAccountPdf creates a base64 encoded PDF string", async () => {
    const base64Pdf = await generateEncryptedAccountPdf(mockContext, "4567");
    expect(base64Pdf).toBeTypeOf("string");
    expect(base64Pdf.length).toBeGreaterThan(0);

    // Verify it is a valid base64 PDF header (%PDF-1.4 or similar when decoded)
    const decoded = Buffer.from(base64Pdf, "base64");
    expect(decoded.toString("utf8", 0, 4)).toBe("%PDF");
  });

  it("sends notification through Resend with a generic body when a valid key is provided", async () => {
    process.env.RESEND_API_KEY = "re_some_valid_production_api_key_123";
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ id: "resend_notif_123" }),
    } as any);

    const result = await sendAccountChangeNotification({
      accountId: "acc_standard_001",
      changedBy: "account_holder",
      changeSummary: "Updated phone number",
      accountSnapshot: mockContext,
    });

    expect(fetchSpy).toHaveBeenCalled();
    const fetchArgs = fetchSpy.mock.calls[0];
    const fetchUrl = fetchArgs[0].toString();
    const fetchBody = JSON.parse(fetchArgs[1]?.body as string);

    expect(fetchUrl).toContain("api.resend.com");
    expect(result.sent).toBe(true);

    // Email content assertions: must be generic and NOT contain sensitive details
    expect(fetchBody.subject).toBe("Account update confirmation");
    const html = fetchBody.html;
    expect(html).toContain("Your account was updated successfully.");
    expect(html).toContain("For security, the account details are included in the attached password-protected PDF.");
    expect(html).toContain("To open the PDF, use the last 4 digits of the account holder phone number as the password.");
    expect(html).not.toContain("4567"); // Actual password digits are not exposed
    expect(html).not.toContain("1,285.00"); // balance redacted
    expect(html).not.toContain("Jane Murphy"); // related/holder details excluded
    expect(html).not.toContain("12 River Walk"); // address details excluded

    fetchSpy.mockRestore();
  });

  it("safely falls back to local logging and does not trigger fetch when key is missing or a placeholder", async () => {
    process.env.RESEND_API_KEY = "re_your_api_key"; // Placeholder key
    const fetchSpy = vi.spyOn(global, "fetch");

    const result = await sendAccountChangeNotification({
      accountId: "acc_standard_001",
      changedBy: "account_holder",
      changeSummary: "Updated phone number",
      accountSnapshot: mockContext,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.sent).toBe(false);
    expect(result.notificationId).toBe("attempt_123");

    fetchSpy.mockRestore();
  });

  it("PDF password uses the last 4 digits of the phone number", async () => {
    process.env.RESEND_API_KEY = "re_your_api_key";
    
    // We spy on pdf generator to verify the password argument
    const pdfGenerator = await import("./pdf-generator");
    const pdfSpy = vi.spyOn(pdfGenerator, "generateEncryptedAccountPdf");

    await sendAccountChangeNotification({
      accountId: "acc_standard_001",
      changedBy: "account_holder",
      changeSummary: "Updated phone number",
      accountSnapshot: mockContext,
    });

    expect(pdfSpy).toHaveBeenCalledWith(expect.any(Object), "4567");
    pdfSpy.mockRestore();
  });

  it("handles PDF generation failure safely and returns failure without throwing", async () => {
    process.env.RESEND_API_KEY = "re_your_api_key";
    const pdfGenerator = await import("./pdf-generator");
    const pdfSpy = vi.spyOn(pdfGenerator, "generateEncryptedAccountPdf").mockRejectedValue(new Error("Font load error"));

    const result = await sendAccountChangeNotification({
      accountId: "acc_standard_001",
      changedBy: "account_holder",
      changeSummary: "Updated phone number",
      accountSnapshot: mockContext,
    });

    expect(result.sent).toBe(false);
    expect(result.notificationId).toBe("attempt_123");
    pdfSpy.mockRestore();
  });
});
