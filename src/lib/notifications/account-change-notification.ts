import { generateEncryptedAccountPdf } from "./pdf-generator";
import { createServerSupabaseClient } from "../supabase/server";
import type { AccountContext } from "../account/types";

export type AccountChangeNotification = {
  accountId: string;
  changedBy: "account_holder" | "authorized_representative";
  changeSummary: string;
  accountSnapshot: AccountContext;
};

export type AccountChangeNotificationResult = {
  notificationId: string;
  sent: boolean;
  redactedRecipient: string;
};

export async function sendAccountChangeNotification(
  notification: AccountChangeNotification,
): Promise<AccountChangeNotificationResult> {
  const supabase = createServerSupabaseClient();
  
  // Retrieve the account holder's database UUID using the account_id
  const { data: holder, error: holderErr } = await supabase
    .from("account_holders")
    .select("id")
    .eq("account_id", notification.accountId)
    .single();

  if (holderErr || !holder) {
    throw new Error(`Failed to find account holder for notification: ${notification.accountId}`);
  }

  const email = notification.accountSnapshot.account.email;
  const phone = notification.accountSnapshot.account.phone;
  // Last 4 characters of phone number as the PDF password (e.g. "4567")
  const password = phone.slice(-4);

  // Redact recipient email for logging/return (e.g. "ja***@example.test")
  const emailParts = email.split("@");
  const redactedRecipient = emailParts[0].length > 2
    ? `${emailParts[0].slice(0, 2)}***@${emailParts[1]}`
    : `***@${emailParts[1]}`;

  let pdfBase64 = "";
  try {
    pdfBase64 = await generateEncryptedAccountPdf(notification.accountSnapshot, password);
  } catch (err: unknown) {
    console.error("PDF generation failed:", err);
    // Write failed notification attempt record to DB securely and return gracefully
    const { data: attemptData } = await supabase
      .from("notification_attempts")
      .insert({
        account_holder_id: holder.id,
        trigger_action: notification.changeSummary,
        recipient_email: email,
        email_provider: "resend",
        status: "failed",
        sensitive_detail_in_pdf: true,
        error_message: "PDF generation failed",
      })
      .select("id")
      .single();

    return {
      notificationId: attemptData?.id || `failed_${Date.now()}`,
      sent: false,
      redactedRecipient,
    };
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const isRealResendKey = !!(
    resendApiKey &&
    resendApiKey.trim() !== "" &&
    !resendApiKey.toLowerCase().includes("your_") &&
    !resendApiKey.toLowerCase().includes("placeholder")
  );
  const fromEmail = process.env.NOTIFICATION_FROM_EMAIL ?? "Account Portal <notifications@example.test>";

  let notificationId = `notif_${Date.now()}`;
  let sent = false;
  let status: "sent" | "logged" | "failed" = "logged";
  let errorMessage: string | null = null;

  if (isRealResendKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: "Account update confirmation",
          html: `<p>Hello,</p>
<p>Your account was updated successfully.</p>
<p>For security, the account details are included in the attached password-protected PDF.</p>
<p>To open the PDF, use the last 4 digits of the account holder phone number as the password.</p>
<p>Kind regards,<br/>
Account Portal</p>`,
          attachments: [
            {
              filename: `AccountUpdate_${notification.accountId}.pdf`,
              content: pdfBase64,
            },
          ],
        }),
      });

      if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`Resend API Error (HTTP ${response.status}): ${bodyText}`);
      }

      const resJson = await response.json();
      if (resJson && resJson.id) {
        notificationId = resJson.id;
      }
      sent = true;
      status = "sent";
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Resend delivery failed:", err);
      status = "failed";
      errorMessage = errorMsg;
    }
  } else {
    // Local development fallback: Log generic details securely
    console.log("=========================================");
    console.log("RESEND KEY MISSING: Local Notification Logged");
    console.log(`To: ${redactedRecipient}`);
    console.log(`From: ${fromEmail}`);
    console.log(`Subject: Account update confirmation`);
    console.log("PDF generated successfully (Base64 size):", pdfBase64.length);
    console.log("=========================================");
    sent = false;
    status = "logged";
  }

  // Insert notification attempt record
  const { data: attemptData } = await supabase
    .from("notification_attempts")
    .insert({
      account_holder_id: holder.id,
      trigger_action: notification.changeSummary,
      recipient_email: email,
      email_provider: "resend",
      status,
      sensitive_detail_in_pdf: true,
      error_message: errorMessage,
    })
    .select("id")
    .single();

  if (attemptData && attemptData.id) {
    notificationId = attemptData.id;
  }

  return {
    notificationId,
    sent,
    redactedRecipient,
  };
}
