export const dynamic = "force-dynamic";

import fixture from "../../fixtures/debtor-standard.json";
import { fetchAccountContext } from "@/lib/account/db";
import { DebtorPortal } from "@/components/debtor-portal";

export default async function Home() {
  // Try loading real account from DB. If it fails or is unconfigured, fall back to fixture.
  let initialContext = null;
  try {
    initialContext = await fetchAccountContext("acc_standard_001");
  } catch (err) {
    console.error("Failed to load initial account context from database:", err);
  }

  return <DebtorPortal fixture={fixture} initialContext={initialContext || undefined} />;
}

