import PDFDocument from "pdfkit";
import type { AccountContext } from "../account/types";

export async function generateEncryptedAccountPdf(
  context: AccountContext,
  password: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        userPassword: password,
        permissions: {
          printing: "highResolution",
          modifying: false,
          copying: false,
        },
      });

      const buffers: Buffer[] = [];
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData.toString("base64"));
      });
      doc.on("error", (err) => reject(err));

      // Draw content in the PDF
      doc.fontSize(20).text("Account Summary & Statement", { underline: true });
      doc.moveDown();

      doc.fontSize(12).text(`Account Reference: ${context.account.reference}`);
      doc.text(`Creditor: ${context.account.creditorName}`);
      doc.text(`Current Balance: €${(context.account.balanceCents / 100).toFixed(2)}`);
      doc.text(`Status: ${context.account.status.toUpperCase()}`);
      doc.text(`Days Past Due: ${context.account.daysPastDue}`);
      doc.moveDown();

      doc.fontSize(14).text("Contact Details", { underline: true });
      doc.moveDown(0.5);
      const fullName = [context.account.accountHolderFirstName, context.account.accountHolderLastName].filter(Boolean).join(" ");
      doc.fontSize(12).text(`Name: ${fullName}`);
      doc.text(`Email: ${context.account.email}`);
      doc.text(`Phone: ${context.account.phone}`);
      doc.text(`Preferred Contact Method: ${context.account.preferredContactMethod.toUpperCase()}`);
      const addrParts = [
        context.account.address.line1,
        context.account.address.line2,
        context.account.address.city,
        context.account.address.postalCode,
        context.account.address.country,
      ].filter(Boolean);
      doc.text(`Address: ${addrParts.join(", ")}`);
      doc.moveDown();

      doc.fontSize(14).text("Related People", { underline: true });
      doc.moveDown(0.5);
      if (context.relatedPeople.length === 0) {
        doc.fontSize(12).text("No related people registered.");
      } else {
        context.relatedPeople.forEach((p) => {
          doc.fontSize(12).text(`- ${p.name} (${p.relationship || "Related person"})`);
          doc.text(`  Email: ${p.email} | Phone: ${p.phone}`);
          doc.text(`  Authorized to Act: ${p.authorizedToAct ? "Yes" : "No"}`);
        });
      }
      doc.moveDown();

      doc.fontSize(14).text("Promises to Pay", { underline: true });
      doc.moveDown(0.5);
      if (context.promisesToPay.length === 0) {
        doc.fontSize(12).text("No promises to pay scheduled.");
      } else {
        context.promisesToPay.forEach((p) => {
          doc.fontSize(12).text(`- Amount: €${(p.amountCents / 100).toFixed(2)} | Due: ${p.dueDate} | Status: ${p.status}`);
        });
      }
      doc.moveDown();

      doc.fontSize(14).text("Transactions", { underline: true });
      doc.moveDown(0.5);
      if (context.transactions.length === 0) {
        doc.fontSize(12).text("No transaction history.");
      } else {
        context.transactions.forEach((t) => {
          doc.fontSize(12).text(`- ${t.transactionDate}: ${t.description} (${t.type})`);
          doc.text(`  Amount: €${(t.amountCents / 100).toFixed(2)} | Status: ${t.status}`);
        });
      }
      doc.moveDown();

      doc.fontSize(14).text("Call Appointments", { underline: true });
      doc.moveDown(0.5);
      if (context.callAppointments.length === 0) {
        doc.fontSize(12).text("No call appointments scheduled.");
      } else {
        context.callAppointments.forEach((c) => {
          doc.fontSize(12).text(`- Scheduled At: ${new Date(c.scheduledAt).toLocaleString("en-IE")}`);
          doc.text(`  Phone: ${c.phone} | Reason: ${c.reason || "None"} | Status: ${c.status}`);
        });
      }

      // Finish PDF
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
