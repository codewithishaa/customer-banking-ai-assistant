"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  Bell,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Euro,
  LayoutGrid,
  Mail,
  MapPin,
  Menu,
  MessageSquare,
  Phone,
  SendHorizonal,
  UserRound,
  UsersRound,
  X,
  Settings,
  Star,
  ChevronRight,
  Shield,
  Sparkles,
  Info,
  Calendar,
  AlertCircle,
  Download,
  Key,
  UserCheck,
  Check,
  Plus
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  normalizeLegacyFixture,
  type AccountContext,
  type CallAppointment,
  type LegacyAccountFixture,
  type PromiseToPay,
  type RelatedPerson,
  type Transaction,
} from "@/lib/account/types";
import type { ChatResponse } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

type PortalProps = {
  fixture: LegacyAccountFixture;
  initialContext?: AccountContext;
};

type View = "dashboard" | "conversations" | "settings";
type DashboardDataTab =
  | "contact"
  | "people"
  | "promises"
  | "transactions"
  | "calls";

type ChatMessage = {
  id: string;
  role: "customer" | "agent";
  content: string;
};

function formatCurrency(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

function formatDate(date: string) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

function formatDateTime(date: string) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatAddress(address: AccountContext["account"]["address"]) {
  return [
    address.line1,
    address.line2,
    address.city,
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
}

function formatStatus(value: string) {
  if (!value) return "";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName ? firstName[0] : ""}${lastName ? lastName[0] : ""}`;
}

function formatHeaderDate(date: Date) {
  const dayStr = date.toLocaleDateString("en-US", { weekday: "short" });
  const dateNum = date.getDate();
  const monthStr = date.toLocaleDateString("en-US", { month: "short" });
  const yearNum = date.getFullYear();

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return `${dayStr} ${dateNum} ${monthStr} ${yearNum} • ${timeStr}`;
}

export function DebtorPortal({ fixture, initialContext }: PortalProps) {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [activeView, setActiveView] = useState<View>("dashboard");
  const [activeDataTab, setActiveDataTab] = useState<DashboardDataTab>("contact");
  const [activeNav, setActiveNav] = useState<"dashboard" | "ai" | "account" | "payments" | "activity" | "settings">("dashboard");
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [accountContext, setAccountContext] = useState<AccountContext>(
    initialContext || normalizeLegacyFixture(fixture)
  );

  // Custom toast notification simulation
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const fullName = `${accountContext.account.accountHolderFirstName} ${accountContext.account.accountHolderLastName}`;

  const handleSendMessage = async (textToSend?: string) => {
    const nextMessage = (typeof textToSend === "string" ? textToSend : draft).trim();

    if (!nextMessage || isSending) {
      return;
    }

    const sentAt = Date.now();
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: `customer-${sentAt}`,
        role: "customer",
        content: nextMessage,
      },
    ]);
    setDraft("");
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountId: accountContext.account.accountId,
          message: nextMessage,
          conversationId: "starter-conversation",
        }),
      });
      const body = (await response.json()) as
        | ChatResponse
        | { error?: string };

      const assistantReply =
        body && "message" in body
          ? body.message.content
          : ("error" in body ? body.error : null) ?? "The chat API did not return a usable response.";

      if (body && "result" in body && body.result.account) {
        setAccountContext(body.result.account);
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `agent-${sentAt + 1}`,
          role: "agent",
          content: assistantReply,
        },
      ]);
    } catch {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `agent-${sentAt + 1}`,
          role: "agent",
          content:
            "The chat API could not be reached. Check the API route and dev server logs.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const selectSuggestedPrompt = (promptText: string) => {
    setActiveNav("ai");
    setActiveView("conversations");
    setDraft(promptText);
    showToast(`Draft filled: "${promptText}". Press Send to query the assistant.`);
  };

  const handleTabChange = (tab: DashboardDataTab) => {
    setActiveDataTab(tab);
    if (tab === "contact" || tab === "people" || tab === "calls") {
      setActiveNav("account");
    } else if (tab === "promises") {
      setActiveNav("payments");
    } else if (tab === "transactions") {
      setActiveNav("activity");
    }
  };


  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col font-sans">

      {/* Toast alert system */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#16325B] text-white px-5 py-3.5 rounded-xl shadow-lg border border-slate-700/30 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <Info className="size-4 text-[#0EA5E9]" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Global Header (Sticky ~80px) */}
      <header className="sticky top-0 z-40 shrink-0 border-b border-[#E2E8F0] bg-white h-20 shadow-sm px-6 lg:px-8">
        <div className="h-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="flex size-10 items-center justify-center rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] shadow-sm hover:bg-[#EFF6FF] focus:outline-none md:hidden cursor-pointer"
              aria-label="Open sidebar"
            >
              <Menu className="size-5" />
            </button>

            {/* Logo Mark */}
            <div className="hidden sm:flex size-11 items-center justify-center rounded-xl bg-[#16325B] text-white shadow-sm shrink-0">
              <Sparkles className="size-5 text-[#0EA5E9]" />
            </div>

            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="text-left focus:outline-none cursor-pointer group flex flex-col justify-center border-none bg-transparent p-0"
              type="button"
            >
              <h1 className="text-[18px] sm:text-[20px] font-bold tracking-tight text-[#16325B] leading-none group-hover:text-[#2563EB] transition-colors">
                Customer Banking AI Assistant
              </h1>
              <p className="text-[13px] text-[#64748B] font-medium mt-1">
                Intelligent Banking. Smarter Conversations.
              </p>
            </button>
          </div>

          <div className="flex items-center gap-3 sm:gap-6">
            {/* Customer Status badge */}
            <div className="hidden md:flex items-center gap-2">
              <span className="text-[13px] font-medium text-[#64748B]">Status:</span>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-[13px] font-semibold border",
                  accountContext.account.status === "active" || accountContext.account.status === "cleared"
                    ? "border-[#16A34A] bg-emerald-50 text-[#16A34A]"
                    : "border-[#F59E0B] bg-amber-50 text-[#F59E0B]"
                )}
              >
                {formatStatus(accountContext.account.status)}
              </span>
            </div>

            {/* Current Date */}
            <div className="hidden lg:flex items-center gap-1.5 text-[13px] font-medium text-[#475569]">
              <Calendar className="size-4 text-[#64748B]" />
              <span>
                {isMounted ? formatHeaderDate(new Date()) : ""}
              </span>
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => showToast("You have 3 system reminders regarding upcoming payments.")}
                className="flex size-10 items-center justify-center rounded-lg border border-[#E2E8F0] hover:bg-[#EFF6FF] text-[#475569] transition cursor-pointer"
              >
                <Bell className="size-4.5" />
                <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-[#DC2626]" />
              </button>
            </div>

            {/* User Profile Relocated from Sidebar */}
            <div className="flex items-center gap-3 pl-3 border-l border-[#E2E8F0]">
              <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 border border-slate-100 shadow-sm transition-all duration-200">
                <Avatar size="default" className="shadow-none shrink-0">
                  <AvatarFallback className="bg-[#16325B] text-xs font-semibold text-white">
                    {getInitials(
                      accountContext.account.accountHolderFirstName,
                      accountContext.account.accountHolderLastName
                    )}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:block text-left min-w-0 max-w-[180px]">
                  <p className="truncate text-[13px] font-bold text-[#0F172A] leading-tight">
                    {fullName}
                  </p>
                  <p className="truncate text-[11px] text-[#64748B] font-medium mt-0.5">
                    {accountContext.account.email}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col md:flex-row w-full max-w-[1700px] mx-auto relative items-stretch">

        {/* Left Sidebar (Redesigned Premium Enterprise Banking Navigation) */}
        {/* Backdrop for mobile drawer */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-50 bg-[#0F172A]/40 backdrop-blur-sm md:hidden transition-opacity duration-300"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[290px] shrink-0 flex-col bg-white border-r border-[#E2E8F0] p-6 transition-transform duration-300 ease-in-out",
            "md:relative md:top-auto md:bottom-auto md:left-auto md:right-auto md:h-auto md:z-10 md:translate-x-0 md:w-20 md:px-3 md:py-8",
            "lg:w-[290px] lg:p-6",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          )}
        >
          {/* Close Button (Mobile drawer only) */}
          <div className="flex justify-end w-full md:hidden mb-4">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className="flex size-9 items-center justify-center rounded-lg bg-slate-50 border border-[#E2E8F0] text-[#475569] hover:bg-slate-100 cursor-pointer shrink-0"
              aria-label="Close sidebar"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Navigation Section */}
          <div className="w-full">
            <nav className="space-y-2 w-full">
              <SidebarItem
                active={activeNav === "dashboard"}
                icon={LayoutGrid}
                label="Dashboard"
                onClick={() => {
                  setActiveNav("dashboard");
                  setActiveView("dashboard");
                  setActiveDataTab("contact");
                  setIsSidebarOpen(false);
                }}
              />

              {/* Highlighted AI Assistant ⭐ */}
              <SidebarItem
                active={activeNav === "ai"}
                icon={MessageSquare}
                label="AI Assistant ⭐"
                highlighted={true}
                onClick={() => {
                  setActiveNav("ai");
                  setActiveView("conversations");
                  setIsSidebarOpen(false);
                }}
              />

              <SidebarItem
                active={activeNav === "account"}
                icon={UserRound}
                label="Customer Account"
                onClick={() => {
                  setActiveNav("account");
                  setActiveView("dashboard");
                  setActiveDataTab("contact");
                  setIsSidebarOpen(false);
                }}
              />

              <SidebarItem
                active={activeNav === "settings"}
                icon={Settings}
                label="Settings"
                onClick={() => {
                  setActiveNav("settings");
                  setActiveView("settings");
                  setIsSidebarOpen(false);
                }}
              />
            </nav>
          </div>
        </aside>

        {/* Content View Space */}
        <div className="flex-1 flex flex-col min-w-0 w-full bg-[#F8FAFC]">

          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            {activeView === "dashboard" ? (
              <DashboardView
                accountContext={accountContext}
                fullName={fullName}
                activeDataTab={activeDataTab}
                setActiveDataTab={handleTabChange}
                onSelectPrompt={selectSuggestedPrompt}
                onTriggerPdf={() => showToast("Encrypted Statement generated. A copy has been delivered to your registered email.")}
              />

            ) : activeView === "conversations" ? (
              <ConversationView
                draft={draft}
                isSending={isSending}
                messages={messages}
                onDraftChange={setDraft}
                onSendMessage={() => handleSendMessage()}
                onSelectPrompt={selectSuggestedPrompt}
              />
            ) : (
              <SettingsView accountContext={accountContext} />
            )}
          </main>
        </div>
      </div>

      {/* Minimal Elegant Footer (Spans full page width at bottom of page) */}
      <footer className="border-t border-[#E2E8F0] bg-white py-4 px-6 text-center text-xs text-[#64748B] w-full">
        <div className="mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 max-w-7xl">
          <div className="flex items-center justify-center gap-1.5 font-medium">
            <span>Customer Banking AI Assistant</span>
            <span className="text-slate-300">•</span>
            <span>Designed & Developed by Isha Borgaonkar</span>
          </div>
          <div>
            <a
              href="https://ishaborgaonkar.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#16325B] hover:text-[#2563EB] hover:underline"
            >
              Portfolio: ishaborgaonkar.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Left Sidebar navigation element
function SidebarItem({
  active,
  icon: Icon,
  label,
  onClick,
  highlighted,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  highlighted?: boolean;
}) {
  return (
    <div className="relative group w-full">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center rounded-xl transition-all duration-200 cursor-pointer h-12",
          "justify-start px-4 gap-3",
          "md:justify-center md:px-0 md:gap-0 lg:justify-between lg:px-4 lg:gap-3",
          active
            ? "bg-[#16325B] text-white shadow-[0_4px_12px_rgba(22,50,91,0.2)]"
            : highlighted
              ? "bg-amber-50/70 border border-amber-200/50 text-[#16325B] hover:bg-amber-100/50"
              : "text-[#475569] hover:bg-[#EFF6FF]/60 hover:text-[#16325B]"
        )}
      >
        <div className="flex items-center gap-3 md:gap-0 lg:gap-3 w-full justify-start md:justify-center lg:justify-start">
          <Icon
            className={cn(
              "w-[22px] h-[22px] shrink-0 transition-colors duration-150",
              active
                ? "text-white"
                : highlighted
                  ? "text-[#F59E0B]"
                  : "text-[#64748B] group-hover:text-[#16325B]"
            )}
          />
          <span className="text-[13.5px] font-bold md:hidden lg:inline leading-none truncate pl-0">
            {label}
          </span>
        </div>

        {highlighted && !active && (
          <span className="inline-flex items-center justify-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 border border-amber-200/30 md:hidden lg:inline shrink-0">
            Core
          </span>
        )}
      </button>

      {/* Premium Tooltip for Collapsed Tablet Mode */}
      <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 hidden md:group-hover:flex lg:group-hover:hidden items-center z-50 pointer-events-none animate-in fade-in slide-in-from-left-2 duration-150">
        <div className="relative bg-[#16325B] text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-md whitespace-nowrap flex items-center gap-2">
          <span>{label}</span>
          {highlighted && (
            <span className="bg-[#0EA5E9] text-white text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-wider">
              Core
            </span>
          )}
        </div>
        {/* Tooltip arrow */}
        <div className="w-1.5 h-1.5 bg-[#16325B] rotate-45 -translate-x-[15px] absolute top-1/2 -translate-y-1/2" />
      </div>
    </div>
  );
}

// Redesigned Dashboard View
function DashboardView({
  accountContext,
  fullName,
  activeDataTab,
  setActiveDataTab,
  onSelectPrompt,
  onTriggerPdf,
}: {
  accountContext: AccountContext;
  fullName: string;
  activeDataTab: DashboardDataTab;
  setActiveDataTab: (tab: DashboardDataTab) => void;
  onSelectPrompt: (promptText: string) => void;
  onTriggerPdf: () => void;
}) {
  const {
    account,
    callAppointments,
    promisesToPay,
    relatedPeople,
    transactions,
  } = accountContext;

  return (
    <div className="flex-1 flex flex-col gap-6 w-full">

      {/* Customer Greeting Header */}
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-[#64748B]">
              Customer Overview
            </p>
            <h2 className="text-[28px] font-bold tracking-tight text-[#0F172A] mt-1.5 leading-none">
              Welcome back, {fullName}
            </h2>
            <p className="mt-2 text-[16px] text-[#475569]">
              Review your primary account summaries, billing deadlines, and update credentials through the AI chat.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[13px] font-bold text-[#64748B]">Secure SSL Environment</span>
          </div>
        </div>

        {/* 4 Equal-sized summary cards */}
        <div className="mt-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={Euro}
            label="Current balance"
            value={formatCurrency(account.balanceCents, account.currency)}
            iconColor="text-blue-600"
            bgColor="bg-blue-50"
          />
          <MetricCard
            icon={CreditCard}
            label="Minimum Payment"
            value={formatCurrency(account.minimumPaymentCents, account.currency)}
            iconColor="text-[#16325B]"
            bgColor="bg-slate-100"
          />
          <MetricCard
            icon={LayoutGrid}
            label="Reference"
            value={account.reference}
            iconColor="text-sky-600"
            bgColor="bg-sky-50"
          />
          <MetricCard
            icon={UserRound}
            label="Days overdue"
            value={`${account.daysPastDue} days`}
            iconColor={account.daysPastDue > 0 ? "text-[#DC2626]" : "text-[#16A34A]"}
            bgColor={account.daysPastDue > 0 ? "bg-rose-50" : "bg-emerald-50"}
            isDestructive={account.daysPastDue > 0}
          />
        </div>
      </section>

      {/* Main Grid (Two column split on desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* Left main: Customer Account Info Tabs (2/3 Width) */}
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm flex flex-col">
            <div className="flex flex-col gap-4 border-b border-[#E2E8F0] pb-4">
              <div>
                <h3 className="text-[20px] font-semibold text-[#0F172A]">
                  Customer Account Ledger
                </h3>
                <p className="text-[13px] text-[#64748B] mt-0.5 font-medium">
                  Select a category to view active contact profiles, registered relationships, agreements, and calls.
                </p>
              </div>

              {/* Elegant rounded pill navigation */}
              <div className="bg-slate-100/80 p-1 rounded-xl flex flex-wrap gap-1 w-fit border border-[#E2E8F0]/40">
                <DashboardTabButton
                  active={activeDataTab === "contact"}
                  icon={UserRound}
                  label="Contact"
                  onClick={() => setActiveDataTab("contact")}
                />
                <DashboardTabButton
                  active={activeDataTab === "people"}
                  icon={UsersRound}
                  label={`People (${relatedPeople.length})`}
                  onClick={() => setActiveDataTab("people")}
                />
                <DashboardTabButton
                  active={activeDataTab === "promises"}
                  icon={CheckCircle2}
                  label={`Promises (${promisesToPay.length})`}
                  onClick={() => setActiveDataTab("promises")}
                />
                <DashboardTabButton
                  active={activeDataTab === "transactions"}
                  icon={CreditCard}
                  label={`Transactions (${transactions.length})`}
                  onClick={() => setActiveDataTab("transactions")}
                />
                <DashboardTabButton
                  active={activeDataTab === "calls"}
                  icon={Clock3}
                  label={`Calls (${callAppointments.length})`}
                  onClick={() => setActiveDataTab("calls")}
                />
              </div>
            </div>

            {/* Tab Body */}
            <div className="mt-6">
              {activeDataTab === "contact" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow icon={UserRound} label="Full Customer Name" value={fullName} />
                  <InfoRow icon={Mail} label="Registered Email" value={account.email} />
                  <InfoRow icon={Phone} label="Contact Phone" value={account.phone} />
                  <InfoRow
                    icon={LayoutGrid}
                    label="Preferred Channel"
                    value={account.preferredContactMethod.toUpperCase()}
                  />
                  <InfoRow
                    icon={Shield}
                    label="Assigned Creditor"
                    value={account.creditorName}
                  />
                  <InfoRow
                    icon={MapPin}
                    label="Physical Address"
                    value={formatAddress(account.address)}
                  />
                  <div className="sm:col-span-2">
                    <InfoRow
                      icon={CalendarDays}
                      label="Last Payment Activity"
                      value={`${formatCurrency(
                        account.lastPaymentAmountCents,
                        account.currency
                      )} settled on ${formatDate(account.lastPaymentDate)}`}
                    />
                  </div>
                </div>
              )}

              {activeDataTab === "people" && (
                <DataRows emptyText="No related people are currently saved on this banking profile.">
                  {relatedPeople.map((person) => (
                    <RelatedPersonRow key={person.id} person={person} />
                  ))}
                </DataRows>
              )}

              {activeDataTab === "promises" && (
                <DataRows emptyText="No promises to pay are currently registered.">
                  {promisesToPay.map((promise) => (
                    <PromiseRow key={promise.id} promise={promise} />
                  ))}
                </DataRows>
              )}

              {activeDataTab === "transactions" && (
                <DataRows emptyText="No transactions recorded on this profile.">
                  {transactions.map((transaction) => (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                    />
                  ))}
                </DataRows>
              )}

              {activeDataTab === "calls" && (
                <DataRows emptyText="No pending callback appointments are scheduled.">
                  {callAppointments.map((appointment) => (
                    <CallAppointmentRow
                      appointment={appointment}
                      key={appointment.id}
                    />
                  ))}
                </DataRows>
              )}
            </div>
          </section>
        </div>

        {/* Right sidebar: Quick Actions & previews (1/3 Width) */}
        <div className="space-y-6">

          {/* Quick Actions Panel */}
          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
            <h3 className="text-[16px] font-bold text-[#0F172A] border-b border-[#E2E8F0] pb-2.5 flex items-center gap-2">
              <Sparkles className="size-4.5 text-[#2563EB]" />
              Quick Actions
            </h3>
            <div className="mt-3.5 space-y-2.5">
              <QuickActionButton
                label="Launch AI Chat"
                description="Consult the AI support agent directly"
                icon={MessageSquare}
                onClick={() => onSelectPrompt("Show my current account summary")}
              />
              <QuickActionButton
                label="Create Promise to Pay"
                description="Coordinate automated pay extensions"
                icon={CreditCard}
                onClick={() => onSelectPrompt("I would like to promise to pay €150 next Monday")}
              />
              <QuickActionButton
                label="Book Agent callback"
                description="Reserve telephone slots"
                icon={Clock3}
                onClick={() => onSelectPrompt("Schedule a call for tomorrow at 3 PM")}
              />
              <QuickActionButton
                label="Export PDF Statement"
                description="Download secure billing details"
                icon={Download}
                onClick={onTriggerPdf}
              />
            </div>
          </section>

          {/* Upcoming appointments preview */}
          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
            <h3 className="text-[16px] font-bold text-[#0F172A] border-b border-[#E2E8F0] pb-2.5 flex items-center gap-2">
              <Clock3 className="size-4.5 text-[#16325B]" />
              Upcoming Appointments
            </h3>
            <div className="mt-3 space-y-2.5">
              {callAppointments.filter(app => app.status === "scheduled").length > 0 ? (
                callAppointments
                  .filter(app => app.status === "scheduled")
                  .slice(0, 2)
                  .map((app) => (
                    <div key={app.id} className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[13px] space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-[#0F172A]">{formatDateTime(app.scheduledAt)}</span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">Scheduled</span>
                      </div>
                      <p className="text-[#64748B] text-[11px] truncate">Phone: {app.phone}</p>
                      {app.reason && <p className="text-[#475569] italic truncate mt-1">&ldquo;{app.reason}&rdquo;</p>}
                    </div>
                  ))
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-[#E2E8F0] text-center bg-[#F8FAFC]">
                  <p className="text-[13px] text-[#64748B] font-medium">No calls scheduled</p>
                  <button
                    onClick={() => onSelectPrompt("Can you schedule a support callback call for me?")}
                    className="mt-2 text-[11px] text-[#2563EB] font-bold hover:underline cursor-pointer"
                  >
                    Schedule call now
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* AI conversations recommendations */}
          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
            <h3 className="text-[16px] font-bold text-[#0F172A] border-b border-[#E2E8F0] pb-2.5 flex items-center gap-2">
              <Bot className="size-4.5 text-[#2563EB]" />
              Suggested AI Inquiries
            </h3>
            <div className="mt-3 space-y-2">
              <SuggestedPromptButton
                text="What is my current balance & due date?"
                onClick={() => onSelectPrompt("What is my current balance and when is it due?")}
              />
              <SuggestedPromptButton
                text="Update contact phone number"
                onClick={() => onSelectPrompt("I need to update my phone number")}
              />
              <SuggestedPromptButton
                text="List my recent transactions"
                onClick={() => onSelectPrompt("Can you list my recent transactions?")}
              />
              <SuggestedPromptButton
                text="Request a billing extension"
                onClick={() => onSelectPrompt("Can I request a payment extension or promise to pay?")}
              />
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

// Redesigned AI Assistant Conversation Page
function ConversationView({
  draft,
  isSending,
  messages,
  onDraftChange,
  onSendMessage,
  onSelectPrompt,
}: {
  draft: string;
  isSending: boolean;
  messages: ChatMessage[];
  onDraftChange: (value: string) => void;
  onSendMessage: () => void | Promise<void>;
  onSelectPrompt: (promptText: string) => void;
}) {
  const hasMessages = messages.length > 0;
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void onSendMessage();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <section className="w-full bg-white border border-[#E2E8F0] rounded-2xl shadow-sm flex flex-col">

      {/* Low-height chat header */}
      <div className="shrink-0 border-b border-[#E2E8F0] px-6 py-4 bg-[#F8FAFC]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-[#16325B] text-white">
                <Bot className="size-4" />
              </div>
              <h2 className="text-[20px] font-bold text-[#16325B]">
                Banking AI Assistant
              </h2>
            </div>
            <p className="text-[13px] text-[#64748B] mt-1 font-medium leading-relaxed">
              Secure AI-powered assistance for managing accounts, payments, transactions, appointments, customer information, and banking requests using natural language.
            </p>
          </div>
          <div className="flex items-center gap-1.5 self-start sm:self-center">
            <span className="size-2 rounded-full bg-[#16A34A] animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#16A34A] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Online
            </span>
          </div>
        </div>
      </div>

      {/* Chat conversation area */}
      <div className="px-6 py-5 bg-[#F8FAFC]/30">
        {hasMessages ? (
          <div className="mx-auto flex w-full max-w-4xl flex-col space-y-4 pb-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex w-full items-start gap-3",
                  message.role === "customer" ? "justify-end" : "justify-start"
                )}
              >
                {/* Assistant icon */}
                {message.role !== "customer" && (
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#16325B] shadow-sm mt-0.5">
                    <Bot className="size-4.5 text-[#2563EB]" />
                  </div>
                )}

                {/* Message bubble */}
                <div
                  className={cn(
                    "flex flex-col gap-1 max-w-[85%] sm:max-w-[72%]",
                    message.role === "customer" ? "items-end ml-auto" : "items-start"
                  )}
                >
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#64748B]">
                      {message.role === "customer" ? "Authorized Session" : "AI Assistant"}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date().toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  <div
                    className={cn(
                      "rounded-2xl px-4.5 py-3 text-[16px] leading-relaxed shadow-sm break-words whitespace-pre-wrap",
                      message.role === "customer"
                        ? "bg-[#16325B] text-white rounded-tr-none"
                        : "border border-[#E2E8F0] bg-white text-[#0F172A] rounded-tl-none"
                    )}
                  >
                    {message.content}
                  </div>
                </div>
              </div>
            ))}

            {/* Simulated loading indicator */}
            {isSending && (
              <div className="flex w-full items-start gap-3 justify-start">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#16325B] shadow-sm mt-0.5 animate-pulse">
                  <Bot className="size-4.5 text-[#2563EB]" />
                </div>
                <div className="flex flex-col gap-1 items-start">
                  <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#64748B]">
                    AI Assistant
                  </span>
                  <div className="rounded-2xl border border-[#E2E8F0] bg-white text-slate-700 rounded-tl-none px-5 py-3.5 shadow-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#16325B] animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="h-2 w-2 rounded-full bg-[#16325B] animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="h-2 w-2 rounded-full bg-[#16325B] animate-bounce"></span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        ) : (
          /* Premium Empty Chat State */
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="flex w-full max-w-2xl flex-col items-center justify-center rounded-2xl border border-[#E2E8F0] bg-white px-6 py-10 text-center shadow-sm sm:px-10">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#2563EB] shadow-sm">
                <Sparkles className="size-7" />
              </div>
              <h3 className="mt-5 text-[20px] font-bold text-[#0F172A]">
                Secure Banking Assistant
              </h3>
              <p className="mt-2.5 max-w-md text-[16px] text-[#475569] leading-relaxed">
                Welcome to your self-service assistant. Ask questions using natural language to update your contact details, register promises, query balances, or schedule calls.
              </p>

              <div className="mt-8 w-full border-t border-[#E2E8F0] pt-6 text-left">
                <p className="text-[13px] font-bold uppercase tracking-wider text-[#64748B] mb-3 text-center sm:text-left">
                  Quick Start Prompts
                </p>
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                  <PromptStarterCard
                    title="Check balance & due date"
                    subtitle="Ask: 'What is my current balance & when is it due?'"
                    onClick={() => onSelectPrompt("What is my current balance and when is it due?")}
                  />
                  <PromptStarterCard
                    title="Postpone a payment"
                    subtitle="Ask: 'I promise to pay €100 next Friday'"
                    onClick={() => onSelectPrompt("I would like to promise to pay €100 next Friday")}
                  />
                  <PromptStarterCard
                    title="Schedule phone callback"
                    subtitle="Ask: 'Schedule a call for tomorrow at 2 PM'"
                    onClick={() => onSelectPrompt("Schedule a call for tomorrow at 2 PM")}
                  />
                  <PromptStarterCard
                    title="Review transaction history"
                    subtitle="Ask: 'Show my recent transactions'"
                    onClick={() => onSelectPrompt("Can you show my recent transactions?")}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Suggested prompts row above input */}
      {hasMessages && (
        <div className="shrink-0 bg-white border-t border-[#E2E8F0] px-6 py-2 overflow-x-auto whitespace-nowrap flex gap-2 scrollbar-none">
          <span className="text-[11px] font-bold text-[#64748B] self-center mr-1">Suggestions:</span>
          <button
            onClick={() => onDraftChange("What is my balance?")}
            className="px-3 py-1 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] text-[13px] text-[#475569] hover:bg-[#EFF6FF] hover:border-[#2563EB]/50 transition cursor-pointer"
          >
            Check Balance
          </button>
          <button
            onClick={() => onDraftChange("Can I promise to pay next week?")}
            className="px-3 py-1 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] text-[13px] text-[#475569] hover:bg-[#EFF6FF] hover:border-[#2563EB]/50 transition cursor-pointer"
          >
            Defer Payment
          </button>
          <button
            onClick={() => onDraftChange("Schedule callback call")}
            className="px-3 py-1 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] text-[13px] text-[#475569] hover:bg-[#EFF6FF] hover:border-[#2563EB]/50 transition cursor-pointer"
          >
            Request Call
          </button>
          <button
            onClick={() => onDraftChange("Update address details")}
            className="px-3 py-1 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] text-[13px] text-[#475569] hover:bg-[#EFF6FF] hover:border-[#2563EB]/50 transition cursor-pointer"
          >
            Change Address
          </button>
        </div>
      )}

      {/* Composer input area fixed at bottom */}
      <form
        className="sticky bottom-0 z-20 border-t border-[#E2E8F0] bg-white px-6 py-4 shadow-[0_-4px_12px_rgba(15,23,42,0.03)] rounded-b-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          void onSendMessage();
        }}
      >
        <div className="mx-auto flex max-w-4xl items-center gap-3 rounded-xl border border-[#E2E8F0] bg-white p-2 shadow-sm">
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Ask the AI banking assistant anything..."
            rows={1}
            className="h-[44px] min-h-[44px] max-h-[100px] flex-1 resize-none border-0 bg-transparent px-3 py-2 text-[16px] text-[#0F172A] outline-none placeholder:text-[#64748B] custom-scrollbar"
          />
          <div className="flex shrink-0 items-center gap-3 pr-1.5">
            <p className="hidden md:block text-[13px] text-[#64748B] whitespace-nowrap font-medium">
              Press <kbd className="bg-slate-100 px-1.5 py-0.5 rounded border text-[11px] font-mono text-[#475569] shadow-sm">Ctrl + Enter</kbd> to send
            </p>
            <Button
              type="submit"
              disabled={!draft.trim() || isSending}
              className={cn(
                "h-11 rounded-lg px-4 text-[13px] font-bold text-white shadow-none transition-all flex items-center cursor-pointer",
                draft.trim() && !isSending
                  ? "bg-[#16325B] hover:bg-[#2563EB]"
                  : "bg-slate-400 cursor-not-allowed"
              )}
            >
              {isSending ? "Processing" : "Send"}
              <SendHorizonal className="ml-1.5 size-4" />
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}

// Redesigned high-fidelity Settings View
function SettingsView({
  accountContext,
}: {
  accountContext: AccountContext;
}) {
  const [toggles, setToggles] = useState({
    twoFactor: false,
    emailAlerts: true,
    smsReminders: true,
    monthlyStatements: true,
  });

  const [preferredContact, setPreferredPreferred] = useState(
    accountContext.account.preferredContactMethod || "email"
  );

  return (
    <div className="flex-1 flex flex-col gap-6 w-full max-w-4xl mx-auto">
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 sm:p-8 shadow-sm">
        <div className="border-b border-[#E2E8F0] pb-5">
          <h2 className="text-[28px] font-bold text-[#0F172A] tracking-tight flex items-center gap-2.5">
            <Settings className="size-7 text-[#16325B]" />
            Portal Configurations
          </h2>
          <p className="text-[16px] text-[#475569] mt-1">
            Configure system configurations, manage notification preferences, and review security settings.
          </p>
        </div>

        {/* Profile Card */}
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <div className="flex size-12 items-center justify-center rounded-xl bg-[#16325B] font-bold text-white text-lg shrink-0">
            {getInitials(
              accountContext.account.accountHolderFirstName,
              accountContext.account.accountHolderLastName
            )}
          </div>
          <div className="text-center sm:text-left min-w-0">
            <h3 className="text-[16px] font-bold text-[#0F172A]">
              {accountContext.account.accountHolderFirstName} {accountContext.account.accountHolderLastName}
            </h3>
            <p className="text-[13px] text-[#64748B] mt-0.5">
              Account Ref: <span className="font-mono text-slate-700 font-bold">{accountContext.account.reference}</span> • ID: <span className="font-mono text-slate-700">{accountContext.account.accountId}</span>
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-8">
          {/* Security */}
          <div>
            <h4 className="text-[16px] font-bold text-[#0F172A] flex items-center gap-2 border-b border-[#E2E8F0] pb-2">
              <Shield className="size-4.5 text-[#2563EB]" />
              Security & Credentials
            </h4>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-[16px] font-semibold text-[#0F172A]">Two-Factor Authentication (2FA)</p>
                  <p className="text-[13px] text-[#64748B] mt-0.5">Prompt OTP security code verification upon account loading.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setToggles({ ...toggles, twoFactor: !toggles.twoFactor })}
                  className={cn(
                    "relative inline-flex h-6.5 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    toggles.twoFactor ? "bg-[#16A34A]" : "bg-slate-200"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block size-5.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      toggles.twoFactor ? "translate-x-4.5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between py-2 border-t border-[#E2E8F0]/60">
                <div>
                  <p className="text-[16px] font-semibold text-[#0F172A]">Encrypted PDF Attachment Code</p>
                  <p className="text-[13px] text-[#64748B] mt-0.5 font-medium">Secured using the last 4 characters of your phone number ({accountContext.account.phone.slice(-4)}).</p>
                </div>
                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-xs font-mono font-bold text-[#475569]">
                  •••• ({accountContext.account.phone.slice(-4)})
                </div>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div>
            <h4 className="text-[16px] font-bold text-[#0F172A] flex items-center gap-2 border-b border-[#E2E8F0] pb-2">
              <Bell className="size-4.5 text-[#2563EB]" />
              Notifications & Alerts
            </h4>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-[16px] font-semibold text-[#0F172A]">Instant Account Modification Email</p>
                  <p className="text-[13px] text-[#64748B] mt-0.5">Dispatch security emails instantly when address or phone info is updated.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setToggles({ ...toggles, emailAlerts: !toggles.emailAlerts })}
                  className={cn(
                    "relative inline-flex h-6.5 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    toggles.emailAlerts ? "bg-[#16A34A]" : "bg-slate-200"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block size-5.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      toggles.emailAlerts ? "translate-x-4.5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between py-2 border-t border-[#E2E8F0]/60">
                <div>
                  <p className="text-[16px] font-semibold text-[#0F172A]">SMS Reminders</p>
                  <p className="text-[13px] text-[#64748B] mt-0.5">Send billing notifications 24 hours prior to deadline dates.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setToggles({ ...toggles, smsReminders: !toggles.smsReminders })}
                  className={cn(
                    "relative inline-flex h-6.5 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    toggles.smsReminders ? "bg-[#16A34A]" : "bg-slate-200"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block size-5.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      toggles.smsReminders ? "translate-x-4.5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between py-2 border-t border-[#E2E8F0]/60">
                <div>
                  <p className="text-[16px] font-semibold text-[#0F172A]">Encrypted PDF Statements</p>
                  <p className="text-[13px] text-[#64748B] mt-0.5 font-medium">Include full encrypted balance spreadsheets in email payloads.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setToggles({ ...toggles, monthlyStatements: !toggles.monthlyStatements })}
                  className={cn(
                    "relative inline-flex h-6.5 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    toggles.monthlyStatements ? "bg-[#16A34A]" : "bg-slate-200"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block size-5.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      toggles.monthlyStatements ? "translate-x-4.5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// Visual Metric summary card
function MetricCard({
  icon: Icon,
  label,
  value,
  iconColor,
  bgColor,
  isDestructive,
}: {
  icon: typeof LayoutGrid;
  label: string;
  value: string;
  iconColor?: string;
  bgColor?: string;
  isDestructive?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 hover-elevation">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-[#64748B] uppercase tracking-wider">{label}</span>
        <div className={cn("flex size-9 items-center justify-center rounded-lg shadow-sm shrink-0", bgColor || "bg-[#F8FAFC]")}>
          <Icon className={cn("size-4.5", iconColor || "text-[#16325B]")} />
        </div>
      </div>
      <p className={cn("mt-4 text-[24px] font-bold tracking-tight", isDestructive ? "text-[#DC2626]" : "text-[#0F172A]")}>
        {value}
      </p>
    </div>
  );
}

// Redesigned dashboard data rows tab switches
function DashboardTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof LayoutGrid;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9.5 items-center gap-2 rounded-lg px-4 text-[13px] font-bold transition duration-150 cursor-pointer",
        active
          ? "bg-[#16325B] text-white shadow-sm"
          : "text-[#475569] hover:text-[#16325B] hover:bg-white"
      )}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </button>
  );
}

// Info grid item in contact section
function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof LayoutGrid;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/55 p-4.5 flex gap-3.5 items-start hover:border-[#2563EB]/25 transition duration-150">
      <div className="flex size-10 items-center justify-center rounded-lg bg-white border border-[#E2E8F0] text-[#16325B] shadow-sm shrink-0">
        <Icon className="size-4.5 text-[#2563EB]" />
      </div>
      <div className="min-w-0">
        <span className="text-[13px] font-bold text-[#64748B] uppercase tracking-wider block">{label}</span>
        <p className="mt-1 text-[16px] font-semibold text-[#0F172A] leading-relaxed break-words">
          {value}
        </p>
      </div>
    </div>
  );
}

// Card wrapper container inside tabs
function DataRows({
  children,
  emptyText,
}: {
  children: React.ReactNode[];
  emptyText: string;
}) {
  return (
    <div className="grid gap-3.5">
      {children.length > 0 ? (
        children
      ) : (
        <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center">
          <AlertCircle className="size-6 text-[#64748B] mx-auto mb-2" />
          <p className="text-[13px] text-[#64748B] font-medium">
            {emptyText}
          </p>
        </div>
      )}
    </div>
  );
}

// Redesigned Related Person profile card
function RelatedPersonRow({ person }: { person: RelatedPerson }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4.5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:border-[#2563EB]/25 transition">
      <div className="flex items-start gap-3.5 min-w-0">
        <Avatar size="default" className="shadow-none border border-[#E2E8F0]">
          <AvatarFallback className="bg-[#16325B] font-bold text-white text-xs">
            {getInitials(person.name, "")}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-[16px] font-bold text-[#0F172A] truncate">
            {person.name}
          </p>
          <p className="text-[13px] text-[#64748B] mt-0.5">
            {person.relationship ? formatStatus(person.relationship) : "Authorized Counterparty"}
          </p>

          <div className="mt-3.5 flex flex-col gap-1.5 text-[13px] text-[#475569] font-medium">
            <span className="flex items-center gap-1.5 truncate">
              <Mail className="size-3.5 text-[#64748B]" />
              {person.email}
            </span>
            <span className="flex items-center gap-1.5">
              <Phone className="size-3.5 text-[#64748B]" />
              {person.phone}
            </span>
          </div>
        </div>
      </div>

      <span
        className={cn(
          "w-fit rounded-full border px-3 py-1 text-[13px] font-bold self-start",
          person.authorizedToAct
            ? "border-[#16A34A] bg-emerald-50 text-[#16A34A]"
            : "border-[#E2E8F0] bg-white text-[#64748B]"
        )}
      >
        {person.authorizedToAct ? "Authorized to Act" : "No Authorization"}
      </span>
    </div>
  );
}

// Redesigned Promise to Pay card
function PromiseRow({ promise }: { promise: PromiseToPay }) {
  const isFulfilled = promise.status === "completed";
  const isCancelled = promise.status === "cancelled";
  const isMissed = promise.status === "missed";
  const isActive = promise.status === "active";

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4.5 flex flex-col sm:flex-row justify-between sm:items-start gap-4 hover:border-[#2563EB]/25 transition">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[20px] font-bold text-[#0F172A]">
            {formatCurrency(promise.amountCents, promise.currency)}
          </span>
        </div>
        <p className="text-[13px] text-[#475569] font-medium">
          Commitment Deadline: <span className="font-semibold text-[#0F172A]">{formatDate(promise.dueDate)}</span>
        </p>
        <p className="text-[11px] text-[#64748B] font-medium">
          Registered: {formatDateTime(promise.createdAt)}
        </p>
      </div>

      <div className="flex flex-col sm:items-end gap-2">
        <span className={cn(
          "inline-flex w-fit rounded-full border px-3 py-1 text-[13px] font-bold",
          isFulfilled ? "border-[#16A34A] bg-emerald-50 text-[#16A34A]" :
            isCancelled || isMissed ? "border-[#DC2626] bg-rose-50 text-[#DC2626]" :
              "border-[#F59E0B] bg-amber-50 text-[#F59E0B]"
        )}>
          {formatStatus(promise.status)}
        </span>
      </div>
    </div>
  );
}


// Redesigned ledger Transaction row
function TransactionRow({ transaction }: { transaction: Transaction }) {
  const isCredit = transaction.type === "payment" || transaction.amountCents < 0; // standard credits reduce balance

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4.5 flex items-center justify-between gap-4 hover:border-[#2563EB]/25 transition">
      <div className="flex items-center gap-3.5 min-w-0">
        <div className={cn(
          "flex size-10 items-center justify-center rounded-lg border shadow-sm shrink-0",
          isCredit ? "bg-emerald-50 border-[#16A34A]/30 text-[#16A34A]" : "bg-slate-50 border-slate-200 text-[#16325B]"
        )}>
          {isCredit ? <Check className="size-4.5" /> : <CreditCard className="size-4.5" />}
        </div>
        <div className="min-w-0">
          <p className="text-[16px] font-bold text-[#0F172A] truncate">
            {transaction.description}
          </p>
          <p className="text-[13px] text-[#64748B] mt-0.5 font-medium">
            {formatStatus(transaction.type)} • {formatDate(transaction.transactionDate)}
          </p>
        </div>
      </div>

      <div className="text-right shrink-0">
        <p className={cn(
          "text-[16px] font-bold tracking-tight",
          isCredit ? "text-[#16A34A]" : "text-[#0F172A]"
        )}>
          {isCredit ? "-" : ""}{formatCurrency(Math.abs(transaction.amountCents), transaction.currency)}
        </p>
        <span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-[#475569] border border-slate-200 mt-1">
          {formatStatus(transaction.status)}
        </span>
      </div>
    </div>
  );
}

// Redesigned call appointment row
function CallAppointmentRow({
  appointment,
}: {
  appointment: CallAppointment;
}) {
  const isScheduled = appointment.status === "scheduled";

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4.5 flex flex-col sm:flex-row justify-between sm:items-start gap-4 hover:border-[#2563EB]/25 transition">
      <div className="space-y-1">
        <p className="text-[16px] font-bold text-[#0F172A]">
          {formatDateTime(appointment.scheduledAt)}
        </p>
        <p className="text-[13px] text-[#475569] font-medium flex items-center gap-1.5">
          <Phone className="size-3.5 text-[#64748B]" />
          Agent Callback: {appointment.phone}
        </p>
        {appointment.reason && (
          <p className="text-[13px] text-[#475569] bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0] italic mt-2.5">
            &ldquo;{appointment.reason}&rdquo;
          </p>
        )}
      </div>

      <div className="flex flex-col sm:items-end gap-2 shrink-0">
        <span className={cn(
          "inline-flex w-fit rounded-full border px-3 py-1 text-[13px] font-bold",
          isScheduled ? "border-[#2563EB] bg-blue-50 text-[#2563EB]" : "border-[#E2E8F0] bg-white text-[#64748B]"
        )}>
          {formatStatus(appointment.status)}
        </span>
      </div>
    </div>
  );
}

// Sidebar Button helper in Quick Actions panel
function QuickActionButton({
  label,
  description,
  icon: Icon,
  onClick,
}: {
  label: string;
  description: string;
  icon: typeof LayoutGrid;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB]/40 hover:bg-[#EFF6FF]/40 text-left transition duration-150 group cursor-pointer"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex size-9 items-center justify-center rounded-lg bg-slate-50 border border-slate-100 text-[#475569] group-hover:bg-[#2563EB]/10 group-hover:text-[#2563EB] shrink-0">
          <Icon className="size-4.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-[#0F172A] leading-tight">
            {label}
          </p>
          <p className="text-[11px] text-[#64748B] font-medium mt-0.5">
            {description}
          </p>
        </div>
      </div>
      <ChevronRight className="size-4 text-slate-300 group-hover:text-[#2563EB] transition" />
    </button>
  );
}

// Tiny pill suggesting topics
function SuggestedPromptButton({
  text,
  onClick,
}: {
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between p-2.5 rounded-lg border border-[#E2E8F0]/80 bg-[#F8FAFC] text-[13px] text-[#475569] hover:bg-[#EFF6FF] hover:border-[#2563EB]/40 hover:text-[#16325B] text-left transition cursor-pointer font-medium"
    >
      <span className="truncate">{text}</span>
      <Plus className="size-3.5 text-slate-400 shrink-0 ml-2" />
    </button>
  );
}

// Starter card inside chat assistant screen
function PromptStarterCard({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-4 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:bg-[#EFF6FF]/20 text-left transition duration-200 group cursor-pointer"
    >
      <p className="text-[13px] font-bold text-[#0F172A] group-hover:text-[#2563EB]">
        {title}
      </p>
      <p className="text-[11px] text-[#64748B] mt-1 font-medium leading-relaxed">
        {subtitle}
      </p>
    </button>
  );
}
